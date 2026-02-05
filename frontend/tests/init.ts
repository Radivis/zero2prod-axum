import { spawn, ChildProcess } from 'child_process';
import { execSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { writeLog } from './helpers';
import * as TIMEOUTS from './constants';

// ES module equivalent of __dirname - MUST be defined BEFORE use
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = promisify(setTimeout);

export interface TestApp {
  port: number;
  address: string;
  testName: string;
  process: ChildProcess;
  username?: string;
  password?: string;
  userId?: string;
}

/**
 * Spawn a backend test server
 * @param testName - Name for the test (used for database naming, may have e2e- prefix)
 * 
 * Note: Users should be created via the makeUser() helper function, not by the backend spawn.
 * This ensures users are created through the actual /initial_password API endpoint.
 */
export async function spawnTestApp(testName: string): Promise<TestApp> {
  const projectRoot = path.resolve(__dirname, '../..');
  
  // Strip e2e- prefix for log file naming if present
  const logFileName = testName.replace(/^e2e-/, '');
  
  writeLog(logFileName, `Starting test app spawn: testName=${testName}`, 'BACKEND');
  
  // Check if binary exists, if not build it
  const binaryPath = path.join(projectRoot, 'target', 'release', 'spawn_test_server');
  const binaryExists = await fs.promises.access(binaryPath).then(() => true).catch(() => false);
  
  if (!binaryExists) {
    await writeLog(logFileName, 'Binary not found, building spawn_test_server...', 'BACKEND');
    const cargoBuild = spawn('cargo', ['build', '--bin', 'spawn_test_server', '--features', 'e2e-tests', '--release'], {
      cwd: projectRoot,
      stdio: 'pipe',
    });
    
    let buildOutput = '';
    cargoBuild.stdout?.on('data', (data) => {
      buildOutput += data.toString();
    });
    cargoBuild.stderr?.on('data', (data) => {
      buildOutput += data.toString();
    });

    await new Promise<void>((resolve, reject) => {
      cargoBuild.on('close', async (code) => {
        if (code === 0) {
          await writeLog(logFileName, 'Binary build successful', 'BACKEND');
          resolve();
        } else {
          await writeLog(logFileName, `ERROR: Cargo build failed with code ${code}\n${buildOutput}`, 'BACKEND');
          reject(new Error(`Cargo build failed with code ${code}. See log file for details.`));
        }
      });
      cargoBuild.on('error', async (err) => {
        await writeLog(logFileName, `ERROR: Failed to start cargo build: ${err.message}`, 'BACKEND');
        reject(new Error(`Failed to start cargo build: ${err.message}`));
      });
    });
  } else {
    writeLog(logFileName, 'Using existing binary', 'BACKEND');
  }
  
  // Log file will be created automatically by writeLog function
  
  const testServerProcess = spawn(
    binaryPath,
    [],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        TEST_NAME: testName,
        CREATE_USER: 'false', // Always false - users created via makeUser() instead
        TEST_LOG: '1', // Enable tracing output to stdout for E2E tests
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let output = '';
  // Write stdout to log file and capture for parsing
  testServerProcess.stdout?.on('data', async (data) => {
    const dataStr = data.toString();
    output += dataStr;
    // Only log via writeLog - no direct file writing
    writeLog(logFileName, `${dataStr}`, 'BACKEND');
  });
  
  // Write stderr to log file
  testServerProcess.stderr?.on('data', async (data) => {
    const dataStr = data.toString();
    // Only log via writeLog - no direct file writing
    writeLog(logFileName, `${dataStr}`, 'BACKEND');
  });

  // Wait for the server to output the port information
  let serverInfo: {
    port: number;
    address: string;
    test_name: string;
    username?: string;
    password?: string;
    user_id?: string;
  } | null = null;
  const maxWait = 10000; // 10 seconds
  const startTime = Date.now();

  while (!serverInfo && Date.now() - startTime < maxWait) {
    if (output.includes('"address"') && output.includes('"port"')) {
      try {
        const lines = output.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          // Try to find JSON in the line - it might be prefixed with timestamp/logger output
          const jsonMatch = trimmed.match(/\{.*"address".*"port".*\}/);
          if (jsonMatch) {
            serverInfo = JSON.parse(jsonMatch[0]);
            break;
          }
        }
      } catch (e) {
        // Not valid JSON yet, continue waiting
      }
    }
    if (!serverInfo) {
      await sleep(100);
    }
  }

  if (!serverInfo) {
    testServerProcess.kill();
    await writeLog(logFileName, `ERROR: Failed to start test server: no port information received. Output: ${output}`, 'BACKEND');
    throw new Error(`Failed to start test server: no port information received`);
  }

  await writeLog(logFileName, `Test server started: port=${serverInfo.port}, address=${serverInfo.address}, username=${serverInfo.username || 'N/A'}`, 'BACKEND');

  // Wait for the backend server to be ready by checking health endpoint
  try {
    await writeLog(logFileName, 'Waiting for backend to be ready...', 'BACKEND');
    await waitForBackendReady(serverInfo.address, 30000);
    await writeLog(logFileName, 'Backend is ready', 'BACKEND');
  } catch (error) {
    testServerProcess.kill();
    await writeLog(logFileName, `ERROR: Backend server did not become ready: ${error}`, 'BACKEND');
    throw new Error(`Backend server did not become ready: ${error}`);
  }

  const app: TestApp = {
    port: serverInfo.port,
    address: serverInfo.address,
    testName: serverInfo.test_name,
    username: serverInfo.username,
    password: serverInfo.password,
    userId: serverInfo.user_id,
    process: testServerProcess,
  };
  
  return app;
}

/**
 * Stop a test app
 */
export async function stopTestApp(app: TestApp): Promise<void> {
  // Write final log entry - strip e2e- prefix for log file naming
  if (app.testName) {
    const logFileName = app.testName.replace(/^e2e-/, '');
    writeLog(logFileName, 'Test app stopped', 'BACKEND'); // Fire-and-forget
  }
  
  if (app.process && !app.process.killed && app.process.pid) {
    try {
      // Try graceful shutdown first
      app.process.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve();
        }, 2000);
        
        app.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        app.process.on('error', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      
      // Force kill if still running
      if (!app.process.killed && app.process.pid) {
        app.process.kill('SIGKILL');
      }
      
      // Give it a moment to fully clean up
      await sleep(TIMEOUTS.DELAY_BACKEND_CLEANUP);
    } catch (error: any) {
      // Ignore errors during cleanup - process might already be dead
      await writeLog('cleanup', `Error during backend cleanup: ${error?.message || error}`, 'TEST');
    }
  }
}

/**
 * Generic function to wait for a URL to become ready
 */
export async function waitForUrlReady(
  url: string,
  maxWait: number,
  errorMessage: string = 'URL did not become ready in time'
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (e) {
      // Server not ready yet
    }
    await sleep(500);
  }
  throw new Error(errorMessage);
}

/**
 * Wait for backend to be ready
 */
export async function waitForBackendReady(
  address: string, 
  maxWait: number = TIMEOUTS.TIMEOUT_BACKEND_READY
): Promise<void> {
  return waitForUrlReady(
    `${address}/health_check`,
    maxWait,
    'Backend did not become ready in time'
  );
}

/**
 * Wait for frontend to be ready
 */
export async function waitForFrontendReady(
  url: string,
  maxWait: number = TIMEOUTS.TIMEOUT_FRONTEND_READY
): Promise<void> {
  return waitForUrlReady(
    url,
    maxWait,
    'Frontend did not become ready in time'
  );
}

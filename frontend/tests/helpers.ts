import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const sleep = promisify(setTimeout);

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TestApp {
  port: number;
  address: string;
  testName: string;
  process: ChildProcess;
  username?: string;
  password?: string;
  userId?: string;
}

export interface TestUser {
  username: string;
  password: string;
  userId?: string;
}

/**
 * Spawn a backend test server
 * @param testName - Name for the test
 * @param createUser - Whether to create a test user (default: true)
 */
export async function spawnTestApp(testName: string, createUser: boolean = true): Promise<TestApp> {
  const projectRoot = path.resolve(__dirname, '../..');
  
  // Build the binary first (with e2e-tests feature to access test dependencies)
  const cargoBuild = spawn('cargo', ['build', '--bin', 'spawn_test_server', '--features', 'e2e-tests', '--release'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  await new Promise<void>((resolve, reject) => {
    cargoBuild.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Cargo build failed with code ${code}`));
      }
    });
    cargoBuild.on('error', (err) => {
      reject(new Error(`Failed to start cargo build: ${err.message}`));
    });
  });

  // Spawn the test server binary
  const binaryPath = path.join(projectRoot, 'target', 'release', 'spawn_test_server');
  const testServerProcess = spawn(
    binaryPath,
    [],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        TEST_NAME: testName,
        CREATE_USER: createUser ? 'true' : 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let output = '';
  testServerProcess.stdout?.on('data', (data) => {
    output += data.toString();
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
  const maxWait = 30000; // 30 seconds
  const startTime = Date.now();

  while (!serverInfo && Date.now() - startTime < maxWait) {
    if (output.includes('{')) {
      try {
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            serverInfo = JSON.parse(line.trim());
            break;
          }
        }
      } catch (e) {
        // Not JSON yet, continue waiting
      }
    }
    if (!serverInfo) {
      await sleep(100);
    }
  }

  if (!serverInfo) {
    testServerProcess.kill();
    const stderr = testServerProcess.stderr?.read()?.toString() || 'No stderr output';
    throw new Error(`Failed to start test server: no port information received. Stderr: ${stderr}`);
  }

  // Wait for the backend server to be ready by checking health endpoint
  try {
    await waitForBackendReady(serverInfo.address, 30000);
  } catch (error) {
    testServerProcess.kill();
    throw new Error(`Backend server did not become ready: ${error}`);
  }

  return {
    port: serverInfo.port,
    address: serverInfo.address,
    testName: serverInfo.test_name,
    username: serverInfo.username,
    password: serverInfo.password,
    userId: serverInfo.user_id,
    process: testServerProcess,
  };
}

/**
 * Stop a test app
 */
export async function stopTestApp(app: TestApp): Promise<void> {
  if (app.process && !app.process.killed) {
    app.process.kill('SIGTERM');
    // Wait a bit for cleanup
    await sleep(1000);
    if (!app.process.killed) {
      app.process.kill('SIGKILL');
    }
  }
}

/**
 * Wait for backend to be ready
 */
export async function waitForBackendReady(address: string, maxWait = 30000): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    try {
      const response = await fetch(`${address}/health_check`);
      if (response.ok) {
        return;
      }
    } catch (e) {
      // Server not ready yet
    }
    await sleep(500);
  }
  throw new Error('Backend did not become ready in time');
}

/**
 * Wait for frontend to be ready
 */
export async function waitForFrontendReady(url: string, maxWait = 30000): Promise<void> {
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
  throw new Error('Frontend did not become ready in time');
}

/**
 * Get test user from the app (if it was created during spawn)
 */
export function getTestUserFromApp(app: TestApp): TestUser | null {
  if (app.username && app.password) {
    return {
      username: app.username,
      password: app.password,
      userId: app.userId,
    };
  }
  return null;
}

/**
 * Login as a user via the browser (fills form and submits)
 */
export async function loginAsUser(
  page: any,
  username: string,
  password: string
): Promise<void> {
  await page.goto('/login');
  
  // Wait for the login form to be visible and the "checking" state to finish
  // The Login component has a useEffect that checks if users exist
  await page.waitForSelector('input[type="text"], input[name="username"]', { state: 'visible' });
  
  // Wait a bit for any redirects to settle (e.g., if no users exist, redirects to initial_password)
  await page.waitForTimeout(500);
  
  // Check if we're still on the login page (if not, something redirected us)
  const currentUrl = page.url();
  if (!currentUrl.includes('/login')) {
    throw new Error(`Expected to be on /login page, but was on ${currentUrl}`);
  }
  
  // Fill in the form
  await page.fill('input[type="text"], input[name="username"]', username);
  await page.fill('input[type="password"]', password);
  
  // Submit the form
  await page.click('button[type="submit"]');
  
  // Wait for navigation to dashboard
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 15000 });
  
  // Verify we're actually on the dashboard
  const finalUrl = page.url();
  if (!finalUrl.includes('/admin/dashboard')) {
    throw new Error(`Login failed: expected to be on /admin/dashboard, but was on ${finalUrl}`);
  }
}

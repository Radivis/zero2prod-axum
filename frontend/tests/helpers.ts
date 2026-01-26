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
}

export interface TestUser {
  username: string;
  password: string;
}

/**
 * Spawn a backend test server
 */
export async function spawnTestApp(testName: string): Promise<TestApp> {
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
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let output = '';
  testServerProcess.stdout?.on('data', (data) => {
    output += data.toString();
  });

  // Wait for the server to output the port information
  let serverInfo: { port: number; address: string; test_name: string } | null = null;
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
    throw new Error('Failed to start test server: no port information received');
  }

  // Wait a bit more for the server to be ready
  await sleep(2000);

  return {
    port: serverInfo.port,
    address: serverInfo.address,
    testName: serverInfo.test_name,
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
 * Create a test user via API
 */
export async function createTestUser(
  backendAddress: string,
  username?: string,
  password?: string
): Promise<TestUser> {
  const testUsername = username || `testuser-${Date.now()}`;
  const testPassword = password || `testpass-${Date.now()}-123456789012`;

  // First check if users exist
  const usersExistResponse = await fetch(`${backendAddress}/api/users/exists`);
  const usersExist = await usersExistResponse.json();

  if (!usersExist.users_exist) {
    // Create initial admin user
    const response = await fetch(`${backendAddress}/initial_password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password: testPassword,
        password_confirmation: testPassword,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create initial user: ${response.statusText}`);
    }

    return {
      username: 'admin',
      password: testPassword,
    };
  } else {
    // For now, we'll need to create users via database or API
    // This is a simplified version - in practice you might want to use the API
    // or have a test helper endpoint
    throw new Error('User creation for existing users not yet implemented in E2E tests');
  }
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
  await page.waitForSelector('input[type="text"], input[name="username"]');
  await page.fill('input[type="text"], input[name="username"]', username);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for navigation or success
  await page.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
}

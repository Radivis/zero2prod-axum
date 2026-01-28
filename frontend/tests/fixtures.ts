import { test as base, Page } from '@playwright/test';
import { spawnTestApp, stopTestApp, TestApp } from './helpers';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

// Helper function to write logs
// source: TEST (Playwright test), FRONTEND (Vite server), BACKEND (test server)
async function writeLog(testName: string, message: string, source: 'TEST' | 'FRONTEND' | 'BACKEND' = 'TEST') {
  const logsDir = path.join(__dirname, 'logs', 'e2e');
  await fs.promises.mkdir(logsDir, { recursive: true }).catch(() => {});
  
  const sanitizedTestName = testName
    .replace(/\s+/g, '_')
    .replace(/[\/\\:]/g, '_')
    .substring(0, 100);
  
  const logFile = path.join(logsDir, `${sanitizedTestName}.log`);
  const timestamp = new Date().toISOString();
  await fs.promises.appendFile(logFile, `[${timestamp}] [${source}] ${message}\n`).catch(() => {});
}

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// REST API error type
export interface RestApiError {
  status: number;
  statusText: string;
  error?: string;
}

// User creation result
export interface MakeUserResult {
  success: boolean;
  error?: RestApiError;
  username: string;
  password: string;
  userId?: string;
}

// Test user type
export interface TestUser {
  username: string;
  password: string;
  userId?: string;
}

/**
 * Creates a user via the REST API using the /initial_password endpoint.
 * This is the proper way to create users in E2E tests - through the actual API.
 * 
 * @param backendAddress - The backend server address (e.g., http://127.0.0.1:12345)
 * @param username - The username for the new user
 * @param password - The password for the new user
 * @returns Promise with creation result
 */
export async function makeUser(
  backendAddress: string,
  username: string,
  password: string
): Promise<MakeUserResult> {
  try {
    const response = await fetch(`${backendAddress}/initial_password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        username, 
        password,
        password_confirmation: password  // Required by the endpoint
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: responseText || 'Unknown error' };
      }
      
      console.error(`[makeUser] Failed to create user: ${response.status} ${response.statusText}`);
      console.error(`[makeUser] Response body: ${responseText}`);
      
      return {
        success: false,
        error: {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error || errorData.message || responseText || 'Failed to create user',
        },
        username,
        password,
      };
    }

    const data = await response.json();
    return {
      success: true,
      username,
      password,
      userId: data.user_id,
    };
  } catch (error: any) {
    console.error(`[makeUser] Network error:`, error);
    return {
      success: false,
      error: {
        status: 0,
        statusText: 'Network Error',
        error: error.message || 'Failed to create user',
      },
      username,
      password,
    };
  }
}

// Extend the base test with our custom fixtures
type TestFixtures = {
  backendApp: TestApp;
  frontendServer: ChildProcess;
  authenticatedPage: Page;
};

export const test = base.extend<TestFixtures>({
  // Backend test app fixture (always starts with blank database, no users)
  backendApp: async ({}, use, testInfo) => {
    const testName = testInfo.titlePath.join(' > ');
    // Use e2e- prefix to match what spawnTestApp uses
    const sanitizedTestName = `e2e-${testInfo.title.replace(/\s+/g, '-').toLowerCase()}`;
    await writeLog(sanitizedTestName, `Starting test: ${testName}`, 'TEST');
    
    // Always spawn without a user - tests create users via makeUser() if needed
    let app: TestApp;
    try {
      app = await spawnTestApp(sanitizedTestName);
    } catch (error) {
      await writeLog(sanitizedTestName, `ERROR: Failed to spawn backend app: ${error}`, 'TEST');
      throw error;
    }
    
    await use(app);
    
    // Cleanup
    await writeLog(sanitizedTestName, 'Cleaning up backend app', 'TEST');
    await stopTestApp(app);
  },

  // Frontend server fixture
  frontendServer: async ({ backendApp }, use, testInfo) => {
    const app = backendApp;
    // Use e2e- prefix to match backendApp
    const sanitizedTestName = `e2e-${testInfo.title.replace(/\s+/g, '-').toLowerCase()}`;
    
    // Ensure backend is ready before starting frontend
    const { waitForBackendReady } = await import('./helpers');
    try {
      await waitForBackendReady(app.address, 30000);
    } catch (error) {
      throw new Error(`Backend not ready before starting frontend: ${error}`);
    }
    
    await writeLog(sanitizedTestName, `Starting Vite dev server with backend port ${app.port}`, 'FRONTEND');
    
    // Start Vite dev server with the backend port
    const viteProcess = spawn('npm', ['run', 'dev'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        BACKEND_PORT: app.port.toString(),
      },
      stdio: 'pipe',
      detached: false,
      ...(process.platform !== 'win32' && { 
        shell: false,
      }),
    });
    
    // On Unix, set the process group so we can kill all children
    if (process.platform !== 'win32' && viteProcess.pid) {
      try {
        process.kill(-viteProcess.pid, 0);
      } catch (e) {
        // If we can't set process group, that's okay
      }
    }

    // Wait for Vite to be ready
    let viteReady = false;
    let viteError = '';
    viteProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      const trimmed = output.trim();
      if (trimmed) {
        writeLog(sanitizedTestName, trimmed, 'FRONTEND');
      }
      if (output.includes('Local:') || output.includes('ready') || output.includes('VITE')) {
        viteReady = true;
      }
    });
    
    viteProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      viteError += output;
      const trimmed = output.trim();
      if (trimmed) {
        writeLog(sanitizedTestName, trimmed, 'FRONTEND');
      }
    });

    // Wait up to 30 seconds for Vite to start
    const maxWait = 30000;
    const startTime = Date.now();
    while (!viteReady && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!viteReady) {
      viteProcess.kill();
      throw new Error(`Vite server did not start in time. Stderr: ${viteError}`);
    }

    // Wait for frontend to actually be accessible
    let frontendAccessible = false;
    const frontendCheckStart = Date.now();
    const frontendMaxWait = 10000;
    
    while (!frontendAccessible && Date.now() - frontendCheckStart < frontendMaxWait) {
      try {
        const response = await fetch('http://localhost:3000');
        frontendAccessible = true;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    if (!frontendAccessible) {
      viteProcess.kill();
      throw new Error(`Frontend server did not become accessible within ${frontendMaxWait}ms`);
    }
    
    // Give React a moment to hydrate
    await new Promise(resolve => setTimeout(resolve, 1000));

    await use(viteProcess);

    // Cleanup - kill Vite process and all its children
    await writeLog(sanitizedTestName, 'Stopping Vite dev server', 'FRONTEND');
    try {
      if (viteProcess.pid && !viteProcess.killed) {
        if (process.platform !== 'win32') {
          try {
            process.kill(-viteProcess.pid, 'SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
              process.kill(-viteProcess.pid, 'SIGKILL');
            } catch (e) {
              // Process group might already be dead
            }
          } catch (e) {
            viteProcess.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!viteProcess.killed) {
              viteProcess.kill('SIGKILL');
            }
          }
        } else {
          viteProcess.kill('SIGTERM');
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (!viteProcess.killed) {
            viteProcess.kill('SIGKILL');
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      // Ignore errors during cleanup
    }
  },

  // Authenticated page fixture - creates a user and logs in
  authenticatedPage: async ({ page, backendApp, frontendServer }, use, testInfo) => {
    // Use e2e- prefix to match backendApp
    const sanitizedTestName = `e2e-${testInfo.title.replace(/\s+/g, '-').toLowerCase()}`;
    
    // Generate random credentials
    const username = `test-user-${Math.random().toString(36).substring(7)}`;
    const password = `test-pass-${Math.random().toString(36).substring(7)}`;
    
    // Create user via REST API
    await writeLog(sanitizedTestName, `Creating user via API: ${username}`, 'TEST');
    const userResult = await makeUser(backendApp.address, username, password);
    
    if (!userResult.success) {
      const errorMsg = `Failed to create user: ${userResult.error?.error || 'Unknown error'}`;
      await writeLog(sanitizedTestName, `ERROR: ${errorMsg}`, 'TEST');
      throw new Error(errorMsg);
    }
    
    await writeLog(sanitizedTestName, `User created successfully: ${username}`, 'TEST');

    // Login via the browser
    await writeLog(sanitizedTestName, 'Starting browser login...', 'TEST');
    await page.goto('http://localhost:3000/login');
    await writeLog(sanitizedTestName, `Filling login form with username: ${username}`, 'TEST');
    await page.fill('input[name="username"], input[placeholder="Enter Username"]', username);
    await page.fill('input[type="password"]', password);
    
    // Wait for login response and navigation
    await writeLog(sanitizedTestName, 'Submitting login form...', 'TEST');
    const [response] = await Promise.all([
      page.waitForResponse(response => response.url().includes('/login') && response.request().method() === 'POST'),
      page.click('button[type="submit"]'),
    ]);
    
    const loginStatus = response.status();
    const loginBody = await response.text();
    await writeLog(sanitizedTestName, `Login response: ${loginStatus} - ${loginBody}`, 'TEST');
    
    if (!response.ok()) {
      throw new Error(`Login failed with status ${loginStatus}: ${loginBody}`);
    }
    
    // Wait for successful login (redirect to dashboard)
    await writeLog(sanitizedTestName, 'Waiting for redirect to dashboard...', 'TEST');
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
    await writeLog(sanitizedTestName, 'Browser login successful', 'TEST');

    await use(page);
  },
});

export { expect } from '@playwright/test';

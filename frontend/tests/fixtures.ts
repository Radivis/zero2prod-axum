import { test as base, Page } from '@playwright/test';
import { spawnTestApp, stopTestApp, TestApp, waitForBackendReady } from './init';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loginAsUser, writeLog } from './helpers';

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
    
    // Verify the user is actually visible in the database before returning
    // This prevents race conditions where the frontend checks for user existence
    // before the database transaction is fully committed
    const maxRetries = 10;
    const retryDelay = 200; // ms
    let userVerified = false;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const existsResponse = await fetch(`${backendAddress}/api/users/exists`);
        if (existsResponse.ok) {
          const existsData = await existsResponse.json();
          if (existsData.users_exist) {
            userVerified = true;
            break;
          }
        }
      } catch (e) {
        // Continue trying
      }
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    if (!userVerified) {
      console.warn(`[makeUser] User created but not yet visible in existence check after ${maxRetries} retries`);
    }
    
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

export async function loginSimple(
  username: string,
  password: string,
  logFileName: string,
  frontendServer: { process: ChildProcess, port: number, url: string },
  page: Page
): Promise<void> {
    // Login via the browser
    await writeLog(logFileName, 'Starting browser login...', 'TEST');
    await page.goto(`${frontendServer.url}/login`);
    await writeLog(logFileName, `Filling login form with username: ${username}`, 'TEST');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    
    // Wait for login response and navigation
    await writeLog(logFileName, 'Submitting login form...', 'TEST');
    const [response] = await Promise.all([
      page.waitForResponse(response => response.url().includes('/login') && response.request().method() === 'POST'),
      page.getByLabel('Login').click(),
    ]);
    
    const loginStatus = response.status();
    
    if (loginStatus !== 200) {
      let errorMessage = `Login failed with status ${loginStatus}`;
      try {
        const loginBody = await response.json();
        errorMessage += `: ${loginBody.error}`;
      } catch {
        errorMessage += `: Cannot parse login response body`;
      }
      throw new Error(errorMessage);
    }
    const loginBody = await response.json();
    writeLog(logFileName, `Login response: ${loginStatus} - ${loginBody}`, 'TEST');
}

// Frontend server type
export interface FrontendServer {
  process: ChildProcess;
  port: number;
  url: string;
}

// Interface for authenticated page with credentials
export interface AuthenticatedPageWithCredentials {
  page: Page;
  username: string;
  password: string;
}

// Extend the base test with our custom fixtures
interface TestFixtures {
  backendApp: TestApp;
  frontendServer: FrontendServer;
  authenticatedPage: AuthenticatedPageWithCredentials;
}

export const test = base.extend<TestFixtures>({
  // Backend test app fixture (always starts with blank database, no users)
  backendApp: async ({}, use, testInfo) => {
    const testName = testInfo.titlePath.join(' > ');
    // Database/test name needs e2e- prefix for spawnTestApp
    const dbTestName = `e2e-${testInfo.title.replace(/\s+/g, '-').toLowerCase()}`;
    // Log file name without e2e- prefix
    const logFileName = testInfo.title.replace(/\s+/g, '-').toLowerCase();
    await writeLog(logFileName, `Starting test: ${testName}`, 'TEST');
    
    // Always spawn without a user - tests create users via makeUser() if needed
    let app: TestApp;
    try {
      app = await spawnTestApp(dbTestName);
    } catch (error) {
      await writeLog(logFileName, `ERROR: Failed to spawn backend app: ${error}`, 'TEST');
      throw error;
    }
    
    await use(app);
    
    // Cleanup
    await writeLog(logFileName, 'Cleaning up backend app', 'TEST');
    await stopTestApp(app);
  },

  // Frontend server fixture - returns { process, port, url }
  frontendServer: async ({ backendApp }, use, testInfo) => {
    const app = backendApp;
    // Log file name without e2e- prefix
    const logFileName = testInfo.title.replace(/\s+/g, '-').toLowerCase();
    
    // Ensure backend is ready before starting frontend
    try {
      await waitForBackendReady(app.address, 30000);
    } catch (error) {
      throw new Error(`Backend not ready before starting frontend: ${error}`);
    }
    
    await writeLog(logFileName, `Starting Vite dev server with backend port ${app.port}`, 'FRONTEND');
    
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

    // Wait for Vite to be ready and extract the port
    let viteReady = false;
    let viteError = '';
    let frontendPort: number | null = null; // Will be extracted from output
    let fullOutput = '';
    
    // Helper function to strip ANSI escape codes
    const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
    
    viteProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      fullOutput += output;
      const trimmed = output.trim();
      if (trimmed) {
        writeLog(logFileName, trimmed, 'FRONTEND');
      }
      
      // Extract port from Vite output like "➜  Local:   http://localhost:3003/"
      // Strip ANSI color codes first to handle colored terminal output
      const cleanOutput = stripAnsi(output);
      const portMatch = cleanOutput.match(/Local:\s+http:\/\/localhost:(\d+)/);
      if (portMatch) {
        frontendPort = parseInt(portMatch[1], 10);
        writeLog(logFileName, `Detected frontend port: ${frontendPort}`, 'TEST');
      }
      
      if (cleanOutput.includes('Local:') || cleanOutput.includes('ready') || cleanOutput.includes('VITE')) {
        viteReady = true;
      }
    });
    
    viteProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      viteError += output;
      const trimmed = output.trim();
      if (trimmed) {
        writeLog(logFileName, trimmed, 'FRONTEND');
      }
    });

    // Wait up to 10 seconds for Vite to start AND port to be detected
    const maxWait = 10000;
    const startTime = Date.now();
    while ((!viteReady || frontendPort === null) && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!viteReady) {
      viteProcess.kill();
      throw new Error(`Vite server did not start in time. Stderr: ${viteError}`);
    }

    if (frontendPort === null) {
      viteProcess.kill();
      throw new Error(`Failed to detect frontend port within ${maxWait}ms. Output: ${fullOutput}`);
    }

    // Wait for frontend to actually be accessible
    let frontendAccessible = false;
    const frontendCheckStart = Date.now();
    const frontendMaxWait = 12000;
    const frontendUrl = `http://localhost:${frontendPort}`;
    
    await writeLog(logFileName, `Checking frontend accessibility at ${frontendUrl}`, 'TEST');
    
    while (!frontendAccessible && Date.now() - frontendCheckStart < frontendMaxWait) {
      try {
        const response = await fetch(frontendUrl);
        frontendAccessible = true;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    if (!frontendAccessible) {
      viteProcess.kill();
      throw new Error(`Frontend server did not become accessible at ${frontendUrl} within ${frontendMaxWait}ms`);
    }
    
    await writeLog(logFileName, `Frontend server accessible at ${frontendUrl}`, 'TEST');
    
    // Give React a moment to hydrate
    await new Promise(resolve => setTimeout(resolve, 1000));

    await use({ process: viteProcess, port: frontendPort, url: frontendUrl });

    // Cleanup - kill Vite process and all its children
    await writeLog(logFileName, 'Stopping Vite dev server', 'FRONTEND');
    try {
      if (viteProcess.process.pid && !viteProcess.process.killed) {
        if (process.platform !== 'win32') {
          try {
            process.kill(-viteProcess.process.pid, 'SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
              process.kill(-viteProcess.process.pid, 'SIGKILL');
            } catch (e) {
              // Process group might already be dead
            }
          } catch (e) {
            viteProcess.process.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!viteProcess.process.killed) {
              viteProcess.process.kill('SIGKILL');
            }
          }
        } else {
          viteProcess.process.kill('SIGTERM');
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (!viteProcess.process.killed) {
            viteProcess.process.kill('SIGKILL');
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      // Ignore errors during cleanup
    }
  },

  // Authenticated page fixture - creates a user and logs in
  authenticatedPage: async ({ browser, backendApp, frontendServer }, use, testInfo) => {
    // Log file name without e2e- prefix
    const logFileName = testInfo.title.replace(/\s+/g, '-').toLowerCase();
    
    // Create a new page with baseURL set to the dynamic frontend URL
    // This allows tests to use relative URLs like goto('/admin/dashboard')
    const context = await browser.newContext({
      baseURL: frontendServer.url,
    });
    const page = await context.newPage();
    
    // Generate random credentials
    const username = `test-user-${Math.random().toString(36).substring(7)}`;
    const password = `test-pass-${Math.random().toString(36).substring(7)}`;

    try {
      await makeUser(backendApp.address, username, password);
    } catch (error) {
      await writeLog(logFileName, `ERROR: Failed to create user: ${error}`, 'TEST');
      await context.close();
      throw error;
    }
    
    await writeLog(logFileName, `User created successfully: ${username}`, 'TEST');

    // Login via the browser
    try {
      await loginSimple(username, password, logFileName, frontendServer, page);
      // await loginAsUser(page, username, password, backendApp.address, logFileName);
    } catch (error) {
      await writeLog(logFileName, `ERROR: Failed to login: ${error}`, 'TEST');
      await context.close();
      throw error;
    }
    
    // Wait for successful login (redirect to dashboard)
    await writeLog(logFileName, 'Waiting for redirect to dashboard...', 'TEST');
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
    await writeLog(logFileName, 'Browser login successful', 'TEST');

    // Pass page along with credentials so tests can use them
    await use({ page, username, password });
    
    // Cleanup
    await context.close();
  },
});

export { expect } from '@playwright/test';

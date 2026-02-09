import { test as base, Page } from '@playwright/test';
import { spawnTestApp, stopTestApp, TestApp, waitForBackendReady } from './init';
import { ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { writeLog } from './helpers';
import * as TIMEOUTS from './constants';
import {
  spawnViteProcess,
  monitorViteOutput,
  waitForViteStart,
  waitForFrontendAccessible,
  killViteProcess,
} from './frontend-server-helpers';

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
 * Retry a user creation operation with exponential backoff
 * Handles transient failures due to database contention
 */
async function retryUserCreation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      if (attempt < maxRetries) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const delayMs = 100 * Math.pow(2, attempt - 1);
        await writeLog('makeUser', `Attempt ${attempt} failed, retrying in ${delayMs}ms...`, 'TEST');
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError;
}

/**
 * Creates a user via the REST API using the /initial_password endpoint.
 * This is the proper way to create users in E2E tests - through the actual API.
 * 
 * Includes retry logic with exponential backoff to handle database contention
 * when multiple tests run in parallel.
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
  return retryUserCreation(async () => {
    try {
      const response = await fetch(`${backendAddress}/api/initial_password`, {
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
      
      await writeLog('makeUser', `Failed to create user: ${response.status} ${response.statusText}`, 'TEST');
      await writeLog('makeUser', `Response body: ${responseText}`, 'TEST');
      
      // Retry on server errors (5xx), but not client errors (4xx)
      if (response.status >= 500) {
        await writeLog('makeUser', `Server error (${response.status}), will retry`, 'TEST');
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
      
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
    const maxRetries = TIMEOUTS.USER_VERIFICATION_MAX_RETRIES;
    const retryDelay = TIMEOUTS.USER_VERIFICATION_RETRY_DELAY;
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
      await writeLog('makeUser', `User created but not yet visible in existence check after ${maxRetries} retries`, 'TEST');
    }
    
    // Small delay to ensure Redis session store is ready
    // Helps prevent race conditions with high parallelism
    await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DELAY_REDIS_READY));
    
      return {
        success: true,
        username,
        password,
        userId: data.user_id,
      };
    } catch (error: any) {
      await writeLog('makeUser', `Network error: ${error.message || error}`, 'TEST');
      
      // Throw to trigger retry for network errors
      throw error;
    }
  }, 3);  // Retry up to 3 times
}

export async function login(
  username: string,
  password: string,
  logFileName: string,
  frontendServer: { process: ChildProcess, port: number, url: string },
  page: Page
): Promise<void> {
    // Login via the browser
    await writeLog(logFileName, 'Starting browser login...', 'TEST');
    await page.goto(`${frontendServer.url}/login`);
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('domcontentloaded');
    
    // Verify we're on the login page
    const currentUrl = page.url();
    if (!currentUrl.includes('/login')) {
        throw new Error(`Expected to be on login page, but current URL is: ${currentUrl}`);
    }
    await writeLog(logFileName, `Confirmed on login page: ${currentUrl}`, 'TEST');
    
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
      } catch (parseError) {
        // Try to get the raw response text for debugging
        try {
          const responseText = await response.text();
          await writeLog(logFileName, `Login failed - raw response body: ${responseText}`, 'TEST');
          errorMessage += `: Cannot parse login response body (raw: ${responseText.substring(0, 200)})`;
        } catch {
          await writeLog(logFileName, `Login failed - could not read response body at all`, 'TEST');
          errorMessage += `: Cannot parse login response body (body unreadable)`;
        }
      }
      throw new Error(errorMessage);
    }
    
    const loginBody = await response.json();
    writeLog(logFileName, `Login response: ${loginStatus} - ${JSON.stringify(loginBody)}`, 'TEST');
    
    // Wait for navigation to dashboard to complete
    await writeLog(logFileName, 'Waiting for navigation to dashboard...', 'TEST');
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
    
    // Verify we're on the dashboard page
    const dashboardUrl = page.url();
    if (!dashboardUrl.includes('/admin/dashboard')) {
        throw new Error(`Expected to be on dashboard page after login, but current URL is: ${dashboardUrl}`);
    }
    
    // Wait for dashboard to be fully loaded (important for subsequent navigations)
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      // If networkidle times out, at least wait for domcontentloaded
      return page.waitForLoadState('domcontentloaded');
    });
    
    await writeLog(logFileName, `Login complete, dashboard loaded at: ${dashboardUrl}`, 'TEST');
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
    await writeLog(logFileName, `Starting backend for test: ${testName}`, 'TEST');
    
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
    const logFileName = testInfo.title.replace(/\s+/g, '-').toLowerCase();
    
    // Ensure backend is ready before starting frontend
    try {
      await waitForBackendReady(app.address, 30000);
    } catch (error) {
      throw new Error(`Backend not ready before starting frontend: ${error}`);
    }
    
    await writeLog(logFileName, `Starting Vite dev server with backend port ${app.port}`, 'FRONTEND');
    
    // Spawn Vite process
    const viteProcess = spawnViteProcess(app.port);
    
    // Monitor output for port and readiness
    const monitor = monitorViteOutput(viteProcess, logFileName);
    
    try {
      // Wait for Vite to start and extract port
      const frontendPort = await waitForViteStart(monitor);
      const frontendUrl = `http://localhost:${frontendPort}`;
      
      // Wait for frontend to be accessible
      await waitForFrontendAccessible(frontendUrl, logFileName);
      
      // Give React a moment to hydrate
      await new Promise(resolve => setTimeout(resolve, 1000));

      await use({ process: viteProcess, port: frontendPort, url: frontendUrl });
    } catch (error) {
      viteProcess.kill();
      throw error;
    } finally {
      // Cleanup - kill Vite process and all its children
      await killViteProcess(viteProcess, logFileName);
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
      await login(username, password, logFileName, frontendServer, page);
    } catch (error) {
      await writeLog(logFileName, `ERROR: Failed to login: ${error}`, 'TEST');
      await context.close();
      throw error;
    }
    
    // Wait for successful login (redirect to dashboard)
    await writeLog(logFileName, 'Waiting for redirect to dashboard...', 'TEST');
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
    
    // Verify we're on the dashboard page
    const dashboardUrl = page.url();
    if (!dashboardUrl.includes('/admin/dashboard')) {
        throw new Error(`Expected to be on dashboard page after login in authenticatedPage fixture, but current URL is: ${dashboardUrl}`);
    }
    
    // Wait for dashboard to be fully loaded before starting tests
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    await writeLog(logFileName, `Dashboard loaded at ${dashboardUrl}, ready for test`, 'TEST');

    // Pass page along with credentials so tests can use them
    await use({ page, username, password });
    
    // Cleanup
    await context.close();
  },
});

export { expect } from '@playwright/test';

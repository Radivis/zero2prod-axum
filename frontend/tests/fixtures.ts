import { test as base, chromium, BrowserContext, Page } from '@playwright/test';
import { spawnTestApp, stopTestApp, TestApp, getTestUserFromApp, TestUser, loginAsUser } from './helpers';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

// Helper to write to log file
async function writeLog(testName: string, message: string, level: 'info' | 'error' | 'debug' = 'info') {
  const logsDir = path.join(__dirname, 'logs', 'e2e');
  await fs.promises.mkdir(logsDir, { recursive: true }).catch(() => {});
  
  const sanitizedTestName = testName
    .replace(/\s+/g, '_')
    .replace(/[\/\\:]/g, '_')
    .substring(0, 100);
  
  const logFile = path.join(logsDir, `${sanitizedTestName}.log`);
  const timestamp = new Date().toISOString();
  await fs.promises.appendFile(logFile, `[${timestamp}] [${level.toUpperCase()}] ${message}\n`).catch(() => {});
}

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extend the base test with our custom fixtures
type TestFixtures = {
  backendApp: TestApp;
  backendAppWithUser: TestApp;
  frontendServer: ChildProcess;
  authenticatedPage: Page;
  testUser: TestUser;
};

export const test = base.extend<TestFixtures>({
  // Backend test app fixture (blank, no users) - for initial_password tests
  backendApp: async ({}, use, testInfo) => {
    const testName = testInfo.titlePath.join(' > ');
    const sanitizedTestName = testInfo.title.replace(/\s+/g, '-').toLowerCase();
    await writeLog(sanitizedTestName, `Starting test: ${testName}`);
    
    const app = await spawnTestApp(`e2e-${sanitizedTestName}-${Date.now()}`, false); // Don't create user
    
    await use(app);
    
    // Cleanup
    await writeLog(sanitizedTestName, 'Cleaning up backend app');
    await stopTestApp(app);
  },

  // Backend test app fixture with user - for most tests
  backendAppWithUser: async ({}, use, testInfo) => {
    const testName = testInfo.titlePath.join(' > ');
    const sanitizedTestName = testInfo.title.replace(/\s+/g, '-').toLowerCase();
    await writeLog(sanitizedTestName, `Starting test: ${testName}`);
    
    const app = await spawnTestApp(`e2e-${sanitizedTestName}-${Date.now()}`, true); // Create user
    
    await use(app);
    
    // Cleanup
    await writeLog(sanitizedTestName, 'Cleaning up backend app');
    await stopTestApp(app);
  },

  // Frontend server fixture (works with both backendApp and backendAppWithUser)
  // Note: This depends on backendApp or backendAppWithUser, so it will wait for them
  frontendServer: async ({ backendApp, backendAppWithUser }, use) => {
    // Use backendAppWithUser if available, otherwise fall back to backendApp
    const app = backendAppWithUser || backendApp;
    
    // Ensure backend is ready before starting frontend
    const { waitForBackendReady } = await import('./helpers');
    try {
      await waitForBackendReady(app.address, 30000);
    } catch (error) {
      throw new Error(`Backend not ready before starting frontend: ${error}`);
    }
    
    // Start Vite dev server with the backend port
    // Use detached: false and set a new process group to help with cleanup
    const viteProcess = spawn('npm', ['run', 'dev'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        BACKEND_PORT: app.port.toString(),
      },
      stdio: 'pipe',
      detached: false,
      // On Unix systems, create a new process group for easier cleanup
      ...(process.platform !== 'win32' && { 
        shell: false,
      }),
    });
    
    // On Unix, set the process group so we can kill all children
    if (process.platform !== 'win32' && viteProcess.pid) {
      try {
        process.kill(-viteProcess.pid, 0); // Test if we can signal the group
      } catch (e) {
        // If we can't set process group, that's okay - we'll kill individually
      }
    }

    // Wait for Vite to be ready
    let viteReady = false;
    let viteError = '';
    viteProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Local:') || output.includes('ready') || output.includes('VITE')) {
        viteReady = true;
      }
    });
    
    viteProcess.stderr?.on('data', (data) => {
      viteError += data.toString();
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

    // Give it a bit more time to be fully ready and verify it's accessible
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify frontend is accessible
    try {
      const response = await fetch('http://localhost:3000');
      if (!response.ok && response.status !== 404) {
        throw new Error(`Frontend returned status ${response.status}`);
      }
    } catch (error) {
      viteProcess.kill();
      throw new Error(`Frontend server not accessible: ${error}`);
    }

    await use(viteProcess);

    // Cleanup - kill Vite process and all its children
    // Vite spawns child processes (npm -> node -> vite) for file watching
    try {
      if (viteProcess.pid && !viteProcess.killed) {
        // On Unix systems, try to kill the process group (includes all children)
        if (process.platform !== 'win32') {
          try {
            // Kill the entire process group
            process.kill(-viteProcess.pid, 'SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Force kill if still running
            try {
              process.kill(-viteProcess.pid, 'SIGKILL');
            } catch (e) {
              // Process group might already be dead
            }
          } catch (e) {
            // Fall back to killing just the main process
            viteProcess.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!viteProcess.killed) {
              viteProcess.kill('SIGKILL');
            }
          }
        } else {
          // On Windows, just kill the main process
          viteProcess.kill('SIGTERM');
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (!viteProcess.killed) {
            viteProcess.kill('SIGKILL');
          }
        }
      }
      
      // Give it a moment to fully clean up file watchers
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      // Ignore errors during cleanup - process might already be dead
      // Don't log warnings as they clutter the test output
    }
  },

  // Authenticated page fixture (uses backendAppWithUser)
  authenticatedPage: async ({ page, backendAppWithUser }, use, testInfo) => {
    const sanitizedTestName = testInfo.title.replace(/\s+/g, '-').toLowerCase();
    
    // Get the test user from the app
    const testUser = getTestUserFromApp(backendAppWithUser);
    if (!testUser) {
      await writeLog(sanitizedTestName, 'ERROR: backendAppWithUser fixture must have a user', 'error');
      throw new Error('backendAppWithUser fixture must have a user. Use backendAppWithUser fixture.');
    }

    await writeLog(sanitizedTestName, `Attempting login for user: ${testUser.username}`);

    // Verify user exists in database before attempting login
    // This helps catch timing issues where user isn't fully committed
    const usersExistResponse = await fetch(`${backendAppWithUser.address}/api/users/exists`);
    if (!usersExistResponse.ok) {
      await writeLog(sanitizedTestName, `ERROR: Failed to verify users exist: ${usersExistResponse.status}`, 'error');
      throw new Error(`Failed to verify users exist: ${usersExistResponse.status}`);
    }
    const usersExist = await usersExistResponse.json();
    if (!usersExist.users_exist) {
      await writeLog(sanitizedTestName, 'ERROR: No users exist in database', 'error');
      throw new Error('Cannot login: No users exist in database. User creation may have failed.');
    }

    // Verify the user can login via API first (this helps debug credential issues)
    try {
      await writeLog(sanitizedTestName, 'Testing API login before browser login...');
      const apiLoginResponse = await fetch(`${backendAppWithUser.address}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: testUser.username,
          password: testUser.password,
        }),
      });
      
      if (!apiLoginResponse.ok) {
        const errorData = await apiLoginResponse.json().catch(() => ({ error: 'Unknown error' }));
        const errorMsg = `API login test failed: ${apiLoginResponse.status} - ${JSON.stringify(errorData)}. Username: "${testUser.username}", Password length: ${testUser.password.length}`;
        await writeLog(sanitizedTestName, `ERROR: ${errorMsg}`, 'error');
        throw new Error(errorMsg);
      }
      
      const loginData = await apiLoginResponse.json();
      if (!loginData.success) {
        const errorMsg = `API login test failed: ${loginData.error || 'Unknown error'}. Username: "${testUser.username}", Password length: ${testUser.password.length}`;
        await writeLog(sanitizedTestName, `ERROR: ${errorMsg}`, 'error');
        throw new Error(errorMsg);
      }
      
      await writeLog(sanitizedTestName, 'API login test successful');
    } catch (e: any) {
      // If API login fails, browser login will definitely fail
      await writeLog(sanitizedTestName, `ERROR: Cannot proceed with browser login - API login test failed: ${e.message}`, 'error');
      throw new Error(`Cannot proceed with browser login - API login test failed: ${e.message}`);
    }

    // Login with backend address for verification
    await writeLog(sanitizedTestName, 'Starting browser login...');
    await loginAsUser(page, testUser.username, testUser.password, backendAppWithUser.address, sanitizedTestName);
    await writeLog(sanitizedTestName, 'Browser login successful');

    await use(page);
  },

  // Test user fixture (uses backendAppWithUser)
  testUser: async ({ backendAppWithUser }, use) => {
    const testUser = getTestUserFromApp(backendAppWithUser);
    if (!testUser) {
      throw new Error('backendAppWithUser fixture must have a user. Use backendAppWithUser fixture.');
    }
    await use(testUser);
  },
});

export { expect } from '@playwright/test';

import { test as base, chromium, BrowserContext, Page } from '@playwright/test';
import { spawnTestApp, stopTestApp, TestApp, getTestUserFromApp, TestUser, loginAsUser } from './helpers';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

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
    const testName = `e2e-${testInfo.title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;
    const app = await spawnTestApp(testName, false); // Don't create user
    
    await use(app);
    
    // Cleanup
    await stopTestApp(app);
  },

  // Backend test app fixture with user - for most tests
  backendAppWithUser: async ({}, use, testInfo) => {
    const testName = `e2e-${testInfo.title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;
    const app = await spawnTestApp(testName, true); // Create user
    
    await use(app);
    
    // Cleanup
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
    const viteProcess = spawn('npm', ['run', 'dev'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        BACKEND_PORT: app.port.toString(),
      },
      stdio: 'pipe',
    });

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

    // Cleanup
    viteProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!viteProcess.killed) {
      viteProcess.kill('SIGKILL');
    }
  },

  // Authenticated page fixture (uses backendAppWithUser)
  authenticatedPage: async ({ page, backendAppWithUser }, use) => {
    // Get the test user from the app
    const testUser = getTestUserFromApp(backendAppWithUser);
    if (!testUser) {
      throw new Error('backendAppWithUser fixture must have a user. Use backendAppWithUser fixture.');
    }

    // Login
    await loginAsUser(page, testUser.username, testUser.password);

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

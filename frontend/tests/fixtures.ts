import { test as base, chromium, BrowserContext, Page } from '@playwright/test';
import { spawnTestApp, stopTestApp, TestApp, createTestUser, TestUser, loginAsUser } from './helpers';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extend the base test with our custom fixtures
type TestFixtures = {
  backendApp: TestApp;
  frontendServer: ChildProcess;
  authenticatedPage: Page;
  testUser: TestUser;
};

export const test = base.extend<TestFixtures>({
  // Backend test app fixture
  backendApp: async ({}, use, testInfo) => {
    const testName = `e2e-${testInfo.title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;
    const app = await spawnTestApp(testName);
    
    await use(app);
    
    // Cleanup
    await stopTestApp(app);
  },

  // Frontend server fixture
  frontendServer: async ({ backendApp }, use) => {
    // Start Vite dev server with the backend port
    const viteProcess = spawn('npm', ['run', 'dev'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        BACKEND_PORT: backendApp.port.toString(),
      },
      stdio: 'pipe',
    });

    // Wait for Vite to be ready
    let viteReady = false;
    viteProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Local:') || output.includes('ready')) {
        viteReady = true;
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
      throw new Error('Vite server did not start in time');
    }

    // Give it a bit more time to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    await use(viteProcess);

    // Cleanup
    viteProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!viteProcess.killed) {
      viteProcess.kill('SIGKILL');
    }
  },

  // Authenticated page fixture
  authenticatedPage: async ({ page, backendApp }, use) => {
    // Create a test user
    const testUser = await createTestUser(backendApp.address);

    // Login
    await loginAsUser(page, testUser.username, testUser.password);

    await use(page);
  },

  // Test user fixture
  testUser: async ({ backendApp }, use) => {
    const testUser = await createTestUser(backendApp.address);
    await use(testUser);
  },
});

export { expect } from '@playwright/test';

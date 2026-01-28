import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname - MUST be defined BEFORE use
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = promisify(setTimeout);

// Helper to write to log file (fire-and-forget to avoid blocking)
// source: TEST (Playwright test), FRONTEND (Vite server), BACKEND (test server)
function writeLog(testName: string, message: string, source: 'TEST' | 'FRONTEND' | 'BACKEND' = 'TEST') {
  const logsDir = path.join(__dirname, 'logs', 'e2e-telemetry');
  
  const sanitizedTestName = testName
    .replace(/\s+/g, '_')
    .replace(/[\/\\:]/g, '_')
    .substring(0, 100);
  
  const logFile = path.join(logsDir, `${sanitizedTestName}.log`);
  const timestamp = new Date().toISOString();
  
  // Fire-and-forget: don't await, just log errors if they occur
  fs.promises.mkdir(logsDir, { recursive: true })
    .then(() => fs.promises.appendFile(logFile, `[${timestamp}] [${source}] ${message}\n`))
    .catch(() => {}); // Silently ignore errors to avoid blocking tests
}

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
  const maxWait = 30000; // 30 seconds
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
      await sleep(500);
    } catch (error) {
      // Ignore errors during cleanup - process might already be dead
      console.warn('Error during backend cleanup:', error);
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
    const testUser = {
      username: app.username,
      password: app.password,
      userId: app.userId,
    };
    
    return testUser;
  }
  return null;
}

/**
 * Login as a user via the browser (fills form and submits)
 * @param page - Playwright page object
 * @param username - Username to login with
 * @param password - Password to login with
 * @param backendAddress - Optional backend address to verify user exists before login
 * @param testName - Optional test name for logging
 */
export async function loginAsUser(
  page: any,
  username: string,
  password: string,
  backendAddress?: string,
  testName?: string
): Promise<void> {
  const logTestName = testName || 'login';
  // If backend address is provided, verify the user exists before attempting login
  if (backendAddress) {
    await writeLog(logTestName, `Verifying users exist at ${backendAddress}...`, 'TEST');
    // Verify user exists by checking if any users exist
    const usersExistResponse = await fetch(`${backendAddress}/api/users/exists`);
    if (usersExistResponse.ok) {
      const usersExist = await usersExistResponse.json();
      if (!usersExist.users_exist) {
        await writeLog(logTestName, 'ERROR: No users exist in database', 'TEST');
        throw new Error('Cannot login: No users exist in database');
      }
      await writeLog(logTestName, 'Users exist in database', 'TEST');
    }
    
    // Give the database a moment to ensure the user is fully committed
    await sleep(500);
  }
  await page.goto('/login', { waitUntil: 'networkidle' });
  
  // Wait for the login form to be visible and the "checking" state to finish
  // The Login component has a useEffect that checks if users exist
  await page.waitForSelector('input[type="text"], input[name="username"]', { state: 'visible', timeout: 10000 });
  
  // Wait for the checking state to finish (the CircularProgress should disappear)
  // Check if there's a loading spinner and wait for it to disappear
  try {
    await page.waitForSelector('text=Login', { state: 'visible', timeout: 5000 });
  } catch (e) {
    // If we can't find "Login" text, that's okay - might be in a different state
  }
  
  // Wait a bit for any redirects to settle (e.g., if no users exist, redirects to initial_password)
  await page.waitForTimeout(1000);
  
  // Check if we're still on the login page (if not, something redirected us)
  const currentUrl = page.url();
  if (!currentUrl.includes('/login')) {
    throw new Error(`Expected to be on /login page, but was on ${currentUrl}`);
  }
  
  // Fill in the form - clear fields first to ensure clean state
  const usernameInput = page.locator('input[type="text"], input[name="username"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  
  await usernameInput.clear();
  await usernameInput.fill(username);
  await passwordInput.clear();
  await passwordInput.fill(password);
  
  // Verify the values were set correctly
  const filledUsername = await usernameInput.inputValue();
  const filledPassword = await passwordInput.inputValue();
  
  if (filledUsername !== username) {
    throw new Error(`Username mismatch: expected "${username}", got "${filledUsername}"`);
  }
  if (filledPassword !== password) {
    throw new Error(`Password mismatch: expected "${password.substring(0, 5)}...", got "${filledPassword.substring(0, 5)}..."`);
  }
  
  // Verify server is still alive before attempting login
  if (backendAddress) {
    try {
      await writeLog(logTestName, `Checking backend health before login: ${backendAddress}/health_check`, 'TEST');
      const healthCheck = await fetch(`${backendAddress}/health_check`, { signal: AbortSignal.timeout(5000) });
      if (!healthCheck.ok) {
        await writeLog(logTestName, `WARNING: Backend health check failed: ${healthCheck.status}`, 'TEST');
      } else {
        await writeLog(logTestName, 'Backend health check passed', 'TEST');
      }
    } catch (e: any) {
      await writeLog(logTestName, `ERROR: Backend health check failed: ${e.message}`, 'TEST');
      throw new Error(`Backend server appears to be down before login attempt: ${e.message}`);
    }
  }
  
  // Set up a promise to wait for navigation BEFORE clicking submit
  // This ensures we catch the navigation even if it happens quickly
  const navigationPromise = page.waitForURL(/\/admin\/dashboard/, { timeout: 20000 });
  
  // Track if request was actually sent
  let requestWasSent = false;
  let requestStartTime: number | null = null;
  
  // Submit the form and wait for the login POST request to complete
  const loginRequestPromise = page.waitForResponse(
    (response: any) => {
      const url = response.url();
      const isLoginPost = url.includes('/login') && response.request().method() === 'POST';
      if (isLoginPost) {
        const elapsed = requestStartTime ? Date.now() - requestStartTime : 0;
        // Fire-and-forget logging to avoid blocking
        writeLog(logTestName, `Login response received after ${elapsed}ms: ${response.status()}`, 'TEST');
      }
      return isLoginPost;
    },
    { timeout: 20000 } // Increased timeout
  );
  
  // Also capture the request to see what was sent
  let loginRequestBody: any = null;
  page.on('request', (request: any) => {
    if (request.url().includes('/login') && request.method() === 'POST') {
      requestWasSent = true;
      requestStartTime = Date.now();
      // Fire-and-forget logging
      writeLog(logTestName, `Login request sent to: ${request.url()}`).catch(() => {});
      // postData() returns synchronously (string | null), not a Promise
      const body = request.postData();
      if (body) {
        try {
          loginRequestBody = JSON.parse(body);
          writeLog(logTestName, `Login request body: ${JSON.stringify(loginRequestBody)}`, 'TEST');
        } catch (e) {
          loginRequestBody = body;
          writeLog(logTestName, `Login request body (raw): ${body}`, 'TEST');
        }
      } else {
        writeLog(logTestName, 'WARNING: Login request has no body', 'TEST');
      }
    }
  });
  
  // Also listen for request failures
  page.on('requestfailed', (request: any) => {
    if (request.url().includes('/login') && request.method() === 'POST') {
      writeLog(logTestName, `ERROR: Login request failed: ${request.failure()?.errorText || 'Unknown error'}`, 'TEST');
    }
  });
  
  await writeLog(logTestName, 'Clicking submit button...', 'TEST');
  await page.click('button[type="submit"]');
  await writeLog(logTestName, 'Submit button clicked', 'TEST');
  
  // Wait for login response
  let loginResponseStatus = 0;
  let loginResponseData: any = null;
  try {
    await writeLog(logTestName, 'Waiting for login response...');
    
    // Check if request was sent before waiting
    await page.waitForTimeout(500); // Give request a moment to be sent
    if (!requestWasSent) {
      await writeLog(logTestName, 'ERROR: Login request was not sent after clicking submit', 'error');
      throw new Error('Login request was not sent - form submission may have failed');
    }
    
    const loginResp = await loginRequestPromise;
    loginResponseStatus = loginResp.status();
    loginResponseData = await loginResp.json().catch(() => null);
    
    // Log what was sent and received to test log file (including password for debugging test users)
    await writeLog(logTestName, `Login attempt - Sent: ${JSON.stringify(loginRequestBody)}, Status: ${loginResponseStatus}, Response: ${JSON.stringify(loginResponseData)}`);
    
    if (loginResponseStatus !== 200) {
      await writeLog(logTestName, `Login failed: ${JSON.stringify(loginResponseData)}`, 'error');
      // Verify what username/password were actually sent
      const sentUsername = loginRequestBody?.username || 'unknown';
      const sentPassword = loginRequestBody?.password || 'unknown';
      const sentPasswordLength = sentPassword !== 'unknown' ? sentPassword.length : 0;
      
      // Log full details including password for debugging
      await writeLog(logTestName, `Login failure details - Sent username: "${sentUsername}", Sent password: "${sentPassword}", Expected username: "${username}", Expected password: "${password}"`, 'error');
      
      throw new Error(`Login request failed with status ${loginResponseStatus}: ${JSON.stringify(loginResponseData)}. ` +
        `Sent username: "${sentUsername}", sent password: "${sentPassword}", expected username: "${username}", expected password: "${password}"`);
    }
    
    if (loginResponseData && !loginResponseData.success) {
      await writeLog(logTestName, `Login response indicates failure - Error: ${loginResponseData.error || 'Unknown error'}, Username: "${username}", Password: "${password}"`, 'error');
      throw new Error(`Login failed: ${loginResponseData.error || 'Unknown error'}. Username: "${username}", Password: "${password}"`);
    }
  } catch (e: any) {
    // Check if this is a timeout waiting for response
    if (e.message && e.message.includes('Timeout') && e.message.includes('waitForResponse')) {
      await writeLog(logTestName, `ERROR: Timeout waiting for login response. Request sent: ${requestWasSent}, Username: "${username}", Password: "${password}"`, 'error');
      
      // Check if server is still alive
      if (backendAddress) {
        try {
          const healthCheck = await fetch(`${backendAddress}/health_check`, { signal: AbortSignal.timeout(3000) });
          await writeLog(logTestName, `Backend health check after timeout: ${healthCheck.status}`, healthCheck.ok ? 'info' : 'error');
        } catch (healthError: any) {
          await writeLog(logTestName, `ERROR: Backend appears to be down after timeout: ${healthError.message}`, 'error');
          throw new Error(`Login request timed out and backend server appears to be down: ${healthError.message}`);
        }
      }
      
      // Check if there's an error message displayed on the page
      await page.waitForTimeout(1000);
      const errorVisible = await page.locator('[role="alert"], .MuiAlert-root, text=/Authentication failed/i, text=/failed/i').isVisible().catch(() => false);
      const currentUrl = page.url();
      await page.screenshot({ path: `test-results/login-timeout-${Date.now()}.png` }).catch(() => {});
      
      if (errorVisible) {
        const errorText = await page.locator('[role="alert"], .MuiAlert-root').first().textContent().catch(() => 'Unknown error');
        await writeLog(logTestName, `Login timeout with visible error - Error: ${errorText}, URL: ${currentUrl}`, 'error');
        throw new Error(`Login request timed out. Page shows error: ${errorText}. Current URL: ${currentUrl}. Username: "${username}", Password: "${password}"`);
      }
      
      throw new Error(`Login request timed out - no response received. Request sent: ${requestWasSent}, Current URL: ${currentUrl}. Username: "${username}", Password: "${password}"`);
    }
    
    // Check if there's an error message displayed on the page
    await page.waitForTimeout(1000); // Give error message time to appear
    const errorVisible = await page.locator('[role="alert"], .MuiAlert-root, text=/Authentication failed/i, text=/failed/i').isVisible().catch(() => false);
    if (errorVisible) {
      const errorText = await page.locator('[role="alert"], .MuiAlert-root').first().textContent().catch(() => 'Authentication failed');
      await page.screenshot({ path: `test-results/login-error-${Date.now()}.png` }).catch(() => {});
      await writeLog(logTestName, `Login exception with visible error - Error: ${errorText}, Original: ${e.message}, Username: "${username}", Password: "${password}"`, 'error');
      throw new Error(`Login failed with error: ${errorText}. Original error: ${e.message}. Username: "${username}", Password: "${password}"`);
    }
    await writeLog(logTestName, `Login exception - Error: ${e.message}, Username: "${username}", Password: "${password}"`, 'error');
    throw e;
  }
  
  // Wait for the auth check request that happens in Login component's onSuccess
  // This is important - the navigation happens after this succeeds
  try {
    await page.waitForResponse(
      (response: any) => response.url().includes('/api/auth/me') && response.status() === 200,
      { timeout: 10000 }
    );
  } catch (e) {
    // Auth check might have failed or timed out
    // Check if we navigated anyway
    const currentUrl = page.url();
    if (!currentUrl.includes('/admin/dashboard')) {
      await writeLog(logTestName, `Auth check failed or timed out - Current URL: ${currentUrl}, Login response status: ${loginResponseStatus}, Username: "${username}", Password: "${password}"`, 'error');
      throw new Error(`Auth check failed or timed out. Still on ${currentUrl}. Login was successful (${loginResponseStatus}) but navigation didn't happen. Username: "${username}", Password: "${password}"`);
    }
    // If we're on dashboard, that's okay - continue
  }
  
  // Give navigation a moment to happen
  await page.waitForTimeout(500);
  
  // Wait for navigation to dashboard
  try {
    await navigationPromise;
  } catch (e) {
    // If navigation failed, check what happened
    const finalUrl = page.url();
    
    // Check for error messages
    const errorVisible = await page.locator('[role="alert"], .MuiAlert-root, text=/Authentication failed/i, text=/Failed to verify/i').isVisible().catch(() => false);
    
    if (errorVisible) {
      const errorText = await page.locator('[role="alert"], .MuiAlert-root').first().textContent().catch(() => 'Unknown error');
      await page.screenshot({ path: `test-results/login-error-${Date.now()}.png` }).catch(() => {});
      await writeLog(logTestName, `Login failed with visible error - Error: ${errorText}, Current URL: ${finalUrl}, Username: "${username}", Password: "${password}"`, 'error');
      throw new Error(`Login failed with error: ${errorText}. Current URL: ${finalUrl}. Username: "${username}", Password: "${password}"`);
    }
    
    // Check if we're stuck on login page (might be a redirect loop)
    if (finalUrl.includes('/login')) {
      // Check if there's a loading spinner (ProtectedRoute might be checking auth)
      const isLoading = await page.locator('text=Loading, CircularProgress').isVisible().catch(() => false);
      if (isLoading) {
        // Wait a bit more for auth check to complete
        await page.waitForTimeout(3000);
        const newUrl = page.url();
        if (newUrl.includes('/admin/dashboard')) {
          // Navigation happened, continue
        } else {
          await page.screenshot({ path: `test-results/login-stuck-${Date.now()}.png` }).catch(() => {});
          throw new Error(`Login stuck on ${newUrl} after waiting for auth check`);
        }
      } else {
        await page.screenshot({ path: `test-results/login-failed-${Date.now()}.png` }).catch(() => {});
        throw new Error(`Login navigation timeout: still on login page (${finalUrl}). Login response status: ${loginResponseStatus}`);
      }
    } else {
      await page.screenshot({ path: `test-results/login-unexpected-${Date.now()}.png` }).catch(() => {});
      throw new Error(`Login navigation timeout: expected /admin/dashboard, but was on ${finalUrl}`);
    }
  }
  
  // Verify we're actually on the dashboard
  const finalUrl = page.url();
  if (!finalUrl.includes('/admin/dashboard')) {
    await page.screenshot({ path: `test-results/login-wrong-page-${Date.now()}.png` }).catch(() => {});
    
    // Check cookies to see if session was set
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name.includes('session') || c.name.includes('sid'));
    
    // Log full details including password for debugging
    await writeLog(logTestName, `Login navigation failed - Final URL: ${finalUrl}, Login response status: ${loginResponseStatus}, Session cookie present: ${!!sessionCookie}, Cookies: ${cookies.map(c => c.name).join(', ')}, Sent username: "${username}", Sent password: "${password}"`, 'error');
    
    throw new Error(`Login failed: expected to be on /admin/dashboard, but was on ${finalUrl}. ` +
      `Login response: ${loginResponseStatus}, Session cookie present: ${!!sessionCookie}, ` +
      `Cookies: ${cookies.map(c => c.name).join(', ')}, Sent username: "${username}", Sent password: "${password}"`);
  }
  
  // Verify session cookie was set
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find(c => c.name.includes('session') || c.name.includes('sid'));
  if (!sessionCookie) {
    console.warn('Warning: No session cookie found after login, but navigation succeeded');
  }
  
  // Wait for the dashboard to be fully loaded and auth check to complete
  // ProtectedRoute will check auth when the dashboard loads
  // AdminDashboard also does its own auth check
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  
  // Wait for the dashboard auth check to complete and welcome message to appear
  // This ensures both ProtectedRoute and AdminDashboard have finished their auth checks
  try {
    await page.waitForResponse(
      (response: any) => response.url().includes('/api/auth/me') && response.status() === 200,
      { timeout: 10000 }
    );
  } catch (e) {
    // Auth check might have already completed, that's okay
  }
  
  // Wait for any loading spinners to disappear and welcome message to appear
  await page.waitForSelector('text=Welcome', { timeout: 10000 }).catch(() => {
    // If welcome text doesn't appear, check if we're still on dashboard
    const url = page.url();
    if (!url.includes('/admin/dashboard')) {
      throw new Error(`Dashboard loaded but then redirected to ${url}`);
    }
  });
}

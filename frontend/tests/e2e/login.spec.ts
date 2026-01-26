import { test, expect } from '../fixtures';

test.describe('Login', () => {
  test('successful login redirects to admin dashboard', async ({ page, backendAppWithUser, frontendServer, testUser }) => {
    // Verify backend is ready and has a user
    const usersExistResponse = await fetch(`${backendAppWithUser.address}/api/users/exists`);
    if (!usersExistResponse.ok) {
      throw new Error(`Failed to check users exist: ${usersExistResponse.status} ${usersExistResponse.statusText}`);
    }
    const usersExist = await usersExistResponse.json();
    expect(usersExist.users_exist).toBe(true);
    
    // Verify we can reach the backend
    const healthCheck = await fetch(`${backendAppWithUser.address}/health_check`);
    if (!healthCheck.ok) {
      throw new Error(`Backend health check failed: ${healthCheck.status}`);
    }
    
    // Navigate to login page
    await page.goto('/login', { waitUntil: 'networkidle' });
    
    // Wait for the login form to be visible (and for the useEffect to finish checking users)
    await page.waitForSelector('input[type="text"], input[name="username"]', { state: 'visible', timeout: 10000 });
    
    // Wait a moment for any redirects to settle (Login component checks if users exist)
    await page.waitForTimeout(2000);
    
    // Verify we're still on login page (shouldn't redirect if users exist)
    const currentUrl = page.url();
    if (!currentUrl.includes('/login')) {
      // Take a screenshot for debugging
      await page.screenshot({ path: 'test-results/login-unexpected-redirect.png' });
      throw new Error(`Expected to be on /login page, but was on ${currentUrl}. Users exist: ${usersExist.users_exist}`);
    }
    
    // Fill in credentials using the test user from the fixture
    await page.fill('input[type="text"], input[name="username"]', testUser.username);
    await page.fill('input[type="password"]', testUser.password);
    
    // Submit the form and wait for navigation
    const navigationPromise = page.waitForURL(/\/admin\/dashboard/, { timeout: 15000 });
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await navigationPromise;
    
    // Verify we're on the dashboard
    const finalUrl = page.url();
    expect(finalUrl).toContain('/admin/dashboard');
    
    // Wait for the welcome message to appear
    await expect(page.locator('text=Welcome')).toBeVisible({ timeout: 10000 });
  });

  test('login with invalid credentials shows error message', async ({ page, backendAppWithUser, frontendServer }) => {
    await page.goto('/login');
    
    // Wait for the login form to be visible
    await page.waitForSelector('input[type="text"], input[name="username"]', { state: 'visible' });
    
    // Wait a moment for any redirects to settle
    await page.waitForTimeout(1000);
    
    // Verify we're on login page
    expect(page.url()).toContain('/login');
    
    await page.fill('input[type="text"], input[name="username"]', 'invalid-user');
    await page.fill('input[type="password"]', 'invalid-password');
    await page.click('button[type="submit"]');
    
    // Wait for error message - the error should appear in an Alert component
    await expect(page.locator('text=/Authentication failed/i')).toBeVisible({ timeout: 10000 });
    
    // Should still be on login page
    expect(page.url()).toContain('/login');
  });

  test('redirects to initial password when no users exist', async ({ page, backendApp, frontendServer }) => {
    // Ensure no users exist (fresh database)
    await page.goto('/login');
    
    // Should redirect to initial password page
    await page.waitForURL(/\/initial_password/, { timeout: 10000 });
    expect(page.url()).toContain('/initial_password');
  });
});

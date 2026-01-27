import { test, expect, makeUser } from '../fixtures';

test.describe('Login', () => {
  test('successful login redirects to admin dashboard', async ({ page, backendApp, frontendServer }) => {
    // Create a test user via API
    const username = 'test-user-login';
    const password = 'test-password-12345';
    const userResult = await makeUser(backendApp.address, username, password);
    
    if (!userResult.success) {
      throw new Error(`Failed to create test user: ${userResult.error?.error}`);
    }
    
    // Navigate to login page
    await page.goto('/login');
    
    // Wait for the login form to be visible
    await page.waitForSelector('input[type="text"], input[name="username"]', { state: 'visible', timeout: 10000 });
    
    // Fill in credentials
    await page.fill('input[type="text"], input[name="username"]', username);
    await page.fill('input[type="password"]', password);
    
    // Submit the form and wait for navigation
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 15000 });
    
    // Verify we're on the dashboard
    expect(page.url()).toContain('/admin/dashboard');
    
    // Wait for the welcome message to appear
    await expect(page.locator('text=Welcome')).toBeVisible({ timeout: 10000 });
  });

  test('login with invalid credentials shows error message', async ({ page, backendApp, frontendServer }) => {
    // Create a valid user first (so we're not redirected to initial_password)
    const userResult = await makeUser(backendApp.address, 'valid-user', 'valid-password-12345');
    if (!userResult.success) {
      throw new Error(`Failed to create test user: ${userResult.error?.error}`);
    }
    
    await page.goto('/login');
    
    // Wait for the login form to be visible
    await page.waitForSelector('input[type="text"], input[name="username"]', { state: 'visible' });
    
    // Verify we're on login page
    expect(page.url()).toContain('/login');
    
    await page.fill('input[type="text"], input[name="username"]', 'invalid-user');
    await page.fill('input[type="password"]', 'invalid-password');
    await page.click('button[type="submit"]');
    
    // Wait for error message
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

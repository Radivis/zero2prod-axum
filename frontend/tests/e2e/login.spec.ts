import { test, expect } from '../fixtures';

test.describe('Login', () => {
  test('successful login redirects to admin dashboard', async ({ page, backendApp, frontendServer }) => {
    // Create a test user first
    const testUser = await fetch(`${backendApp.address}/initial_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: 'testpassword123456',
        password_confirmation: 'testpassword123456',
      }),
    }).then(r => r.json()).catch(() => null);

    // Navigate to login page
    await page.goto('/login');
    
    // Wait for the login form to be visible
    await page.waitForSelector('input[type="text"], input[name="username"]');
    
    // Fill in credentials
    await page.fill('input[type="text"], input[name="username"]', 'admin');
    await page.fill('input[type="password"]', 'testpassword123456');
    
    // Submit the form
    await page.click('button[type="submit"]');
    
    // Wait for redirect to admin dashboard
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
    
    // Verify we're on the dashboard
    expect(page.url()).toContain('/admin/dashboard');
    await expect(page.locator('text=Welcome')).toBeVisible();
  });

  test('login with invalid credentials shows error message', async ({ page, backendApp, frontendServer }) => {
    await page.goto('/login');
    
    await page.waitForSelector('input[type="text"], input[name="username"]');
    await page.fill('input[type="text"], input[name="username"]', 'invalid-user');
    await page.fill('input[type="password"]', 'invalid-password');
    await page.click('button[type="submit"]');
    
    // Wait for error message
    await expect(page.locator('text=/Authentication failed/i')).toBeVisible({ timeout: 5000 });
    
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

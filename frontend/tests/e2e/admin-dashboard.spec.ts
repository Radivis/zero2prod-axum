import { test, expect } from '../fixtures';

test.describe('Admin Dashboard', () => {
  test('protected route redirects to login when not authenticated', async ({ page, backendAppWithUser, frontendServer }) => {
    // Try to access admin dashboard without logging in
    await page.goto('/admin/dashboard');
    
    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('dashboard displays username after login', async ({ page, backendAppWithUser, frontendServer, authenticatedPage, testUser }) => {
    // authenticatedPage fixture already logs us in
    await page.goto('/admin/dashboard');
    
    // Should see welcome message with username
    await expect(page.locator('text=/Welcome/i')).toBeVisible();
    // The username should be displayed
    await expect(page.locator(`text=${testUser.username}`)).toBeVisible({ timeout: 5000 });
  });

  test('logout functionality works', async ({ page, backendApp, frontendServer, authenticatedPage }) => {
    await page.goto('/admin/dashboard');
    
    // Click logout button
    await page.click('button:has-text("Logout")');
    
    // Should redirect to login page
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
    
    // Try to access dashboard again - should redirect to login
    await page.goto('/admin/dashboard');
    await page.waitForURL(/\/login/, { timeout: 10000 });
  });

  test('navigation links work', async ({ page, backendApp, frontendServer, authenticatedPage }) => {
    await page.goto('/admin/dashboard');
    
    // Click on "Change password" link
    await page.click('text=Change password');
    await page.waitForURL(/\/admin\/password/, { timeout: 5000 });
    expect(page.url()).toContain('/admin/password');
    
    // Go back to dashboard
    await page.goto('/admin/dashboard');
    
    // Click on "Send a newsletter" link
    await page.click('text=Send a newsletter');
    await page.waitForURL(/\/admin\/newsletters/, { timeout: 5000 });
    expect(page.url()).toContain('/admin/newsletters');
  });
});

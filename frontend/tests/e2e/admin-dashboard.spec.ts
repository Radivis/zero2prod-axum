import { test, expect, makeUser } from '../fixtures';

test.describe('Admin Dashboard', () => {
  test('protected route redirects to login when not authenticated', async ({ page, backendApp, frontendServer }) => {
    // Create a user so we don't get redirected to initial_password
    await makeUser(backendApp.address, 'test-user', 'test-password-12345');
    
    // Try to access admin dashboard without logging in
    await page.goto(`${frontendServer.url}/admin/dashboard`);
    
    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('dashboard displays username after login', async ({ authenticatedPage }) => {
    // authenticatedPage fixture already logs us in and navigates to dashboard
    
    // Should see welcome message
    await expect(authenticatedPage.locator('text=/Welcome/i')).toBeVisible();
  });

  test('logout functionality works', async ({ authenticatedPage }) => {
    // Click logout button
    await authenticatedPage.getByRole('button', { name: 'Logout' }).click();
    
    // Should redirect to login page
    await authenticatedPage.waitForURL(/\/login/, { timeout: 10000 });
    expect(authenticatedPage.url()).toContain('/login');
    
    // Try to access dashboard again - should redirect to login
    await authenticatedPage.goto('/admin/dashboard');
    await authenticatedPage.waitForURL(/\/login/, { timeout: 10000 });
  });

  test('navigation links work', async ({ authenticatedPage }) => {
    // Click on "Change password" link
    await authenticatedPage.getByRole('link', { name: 'Change password' }).click();
    await authenticatedPage.waitForURL(/\/admin\/password/, { timeout: 5000 });
    expect(authenticatedPage.url()).toContain('/admin/password');
    
    // Go back to dashboard
    await authenticatedPage.goto('/admin/dashboard');
    
    // Click on "Send a newsletter" link
    await authenticatedPage.getByRole('link', { name: 'Send newsletter' }).click();
    await authenticatedPage.waitForURL(/\/admin\/newsletters/, { timeout: 5000 });
    expect(authenticatedPage.url()).toContain('/admin/newsletters');
  });
});

import { test, expect, makeUser } from '../fixtures';

test.describe('Change Password', () => {
  test('password change form requires authentication', async ({ page, backendApp, frontendServer }) => {
    // Create a user so we don't get redirected to initial_password
    await makeUser(backendApp.address, 'test-user', 'test-password-12345');
    
    // Try to access password change page without authentication
    await page.goto(`${frontendServer.url}/admin/password`);
    
    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('shows error when passwords do not match', async ({ page, backendApp, frontendServer }) => {
    // Create user with known credentials
    const username = 'test-user-pwd-mismatch';
    const password = 'test-password-12345';
    await makeUser(backendApp.address, username, password);
    
    // Login
    await page.goto(`${frontendServer.url}/login`);
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL(/\/admin\/dashboard/);
    
    // Go to password change page
    await page.goto(`${frontendServer.url}/admin/password`);
    await page.getByLabel('Current password').waitFor({ state: 'visible' });
    
    // Fill passwords
    await page.getByLabel('Current password').fill(password);
    await page.getByLabel('New password').fill('newpassword123456');
    await page.getByLabel('Confirm new password').fill('differentpassword123456');
    
    await page.getByRole('button', { name: 'Change password' }).click();
    
    // Should show validation error
    await expect(page.locator('text=/two different new passwords/i')).toBeVisible({ timeout: 5000 });
  });

  test('shows error when new password is too short', async ({ page, backendApp, frontendServer }) => {
    // Create user with known credentials
    const username = 'test-user-pwd-short';
    const password = 'test-password-12345';
    await makeUser(backendApp.address, username, password);
    
    // Login
    await page.goto(`${frontendServer.url}/login`);
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL(/\/admin\/dashboard/);
    
    // Go to password change page
    await page.goto(`${frontendServer.url}/admin/password`);
    await page.getByLabel('Current password').waitFor({ state: 'visible' });
    
    await page.getByLabel('Current password').fill(password);
    await page.getByLabel('New password').fill('short');
    await page.getByLabel('Confirm new password').fill('short');
    
    await page.getByRole('button', { name: 'Change password' }).click();
    
    // Should show validation error
    await expect(page.locator('text=/at least 12 characters/i')).toBeVisible({ timeout: 5000 });
  });

  test('shows error when new password is too long', async ({ page, backendApp, frontendServer }) => {
    // Create user with known credentials
    const username = 'test-user-pwd-long';
    const password = 'test-password-12345';
    await makeUser(backendApp.address, username, password);
    
    // Login
    await page.goto(`${frontendServer.url}/login`);
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL(/\/admin\/dashboard/);
    
    // Go to password change page
    await page.goto(`${frontendServer.url}/admin/password`);
    await page.getByLabel('Current password').waitFor({ state: 'visible' });
    
    const longPassword = 'a'.repeat(129);
    await page.getByLabel('Current password').fill(password);
    await page.getByLabel('New password').fill(longPassword);
    await page.getByLabel('Confirm new password').fill(longPassword);
    
    await page.getByRole('button', { name: 'Change password' }).click();
    
    // Should show validation error
    await expect(page.locator('text=/not have more than 128 characters/i')).toBeVisible({ timeout: 5000 });
  });

  test('shows error when current password is incorrect', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/password');
    
    await authenticatedPage.getByLabel('Current password').waitFor({ state: 'visible' });
    
    // Use wrong current password
    await authenticatedPage.getByLabel('Current password').fill('wrongpassword123456');
    await authenticatedPage.getByLabel('New password').fill('newpassword123456');
    await authenticatedPage.getByLabel('Confirm new password').fill('newpassword123456');
    
    await authenticatedPage.getByRole('button', { name: 'Change password' }).click();
    
    // Should show error
    await expect(authenticatedPage.locator('text=/current password is incorrect/i')).toBeVisible({ timeout: 5000 });
  });

  test('successful password change', async ({ page, backendApp, frontendServer }) => {
    // Create user with known credentials
    const username = 'test-user-pwd-success';
    const password = 'test-password-12345';
    await makeUser(backendApp.address, username, password);
    
    // Login
    await page.goto(`${frontendServer.url}/login`);
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL(/\/admin\/dashboard/);
    
    // Go to password change page
    await page.goto(`${frontendServer.url}/admin/password`);
    await page.getByLabel('Current password').waitFor({ state: 'visible' });
    
    const newPassword = 'newpassword123456';
    await page.getByLabel('Current password').fill(password);
    await page.getByLabel('New password').fill(newPassword);
    await page.getByLabel('Confirm new password').fill(newPassword);
    
    await page.getByRole('button', { name: 'Change password' }).click();
    
    // Should show success message
    await expect(page.locator('text=/password has been changed/i')).toBeVisible({ timeout: 10000 });
    
    // Logout and login with new password
    await page.goto(`${frontendServer.url}/admin/dashboard`);
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL(/\/login/);
    
    // Login with new password
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(newPassword);
    await page.getByRole('button', { name: 'Login' }).click();
    
    // Should successfully login
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
    expect(page.url()).toContain('/admin/dashboard');
  });
});

import { test, expect, makeUser } from '../fixtures';

test.describe('Change Password', () => {
  test('password change form requires authentication', async ({ page, backendApp, frontendServer }) => {
    // Create a user so we don't get redirected to initial_password
    await makeUser(backendApp.address, 'test-user', 'test-password-12345');
    
    // Try to access password change page without authentication
    await page.goto('/admin/password');
    
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
    await page.goto('/login');
    await page.fill('input[type="text"], input[name="username"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin\/dashboard/);
    
    // Go to password change page
    await page.goto('/admin/password');
    await page.waitForSelector('input[type="password"]');
    const passwordInputs = await page.locator('input[type="password"]').all();
    
    // Fill current password (first input)
    await passwordInputs[0].fill(password);
    // Fill new password (second input)
    await passwordInputs[1].fill('newpassword123456');
    // Fill confirmation with different password (third input)
    await passwordInputs[2].fill('differentpassword123456');
    
    await page.click('button[type="submit"]');
    
    // Should show validation error
    await expect(page.locator('text=/two different new passwords/i')).toBeVisible({ timeout: 5000 });
  });

  test('shows error when new password is too short', async ({ page, backendApp, frontendServer }) => {
    // Create user with known credentials
    const username = 'test-user-pwd-short';
    const password = 'test-password-12345';
    await makeUser(backendApp.address, username, password);
    
    // Login
    await page.goto('/login');
    await page.fill('input[type="text"], input[name="username"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin\/dashboard/);
    
    // Go to password change page
    await page.goto('/admin/password');
    await page.waitForSelector('input[type="password"]');
    const passwordInputs = await page.locator('input[type="password"]').all();
    
    await passwordInputs[0].fill(password);
    await passwordInputs[1].fill('short');
    await passwordInputs[2].fill('short');
    
    await page.click('button[type="submit"]');
    
    // Should show validation error
    await expect(page.locator('text=/at least 12 characters/i')).toBeVisible({ timeout: 5000 });
  });

  test('shows error when new password is too long', async ({ page, backendApp, frontendServer }) => {
    // Create user with known credentials
    const username = 'test-user-pwd-long';
    const password = 'test-password-12345';
    await makeUser(backendApp.address, username, password);
    
    // Login
    await page.goto('/login');
    await page.fill('input[type="text"], input[name="username"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin\/dashboard/);
    
    // Go to password change page
    await page.goto('/admin/password');
    await page.waitForSelector('input[type="password"]');
    const passwordInputs = await page.locator('input[type="password"]').all();
    
    const longPassword = 'a'.repeat(129);
    await passwordInputs[0].fill(password);
    await passwordInputs[1].fill(longPassword);
    await passwordInputs[2].fill(longPassword);
    
    await page.click('button[type="submit"]');
    
    // Should show validation error
    await expect(page.locator('text=/not have more than 128 characters/i')).toBeVisible({ timeout: 5000 });
  });

  test('shows error when current password is incorrect', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/password');
    
    await authenticatedPage.waitForSelector('input[type="password"]');
    const passwordInputs = await authenticatedPage.locator('input[type="password"]').all();
    
    // Use wrong current password
    await passwordInputs[0].fill('wrongpassword123456');
    await passwordInputs[1].fill('newpassword123456');
    await passwordInputs[2].fill('newpassword123456');
    
    await authenticatedPage.click('button[type="submit"]');
    
    // Should show error
    await expect(authenticatedPage.locator('text=/current password is incorrect/i')).toBeVisible({ timeout: 5000 });
  });

  test('successful password change', async ({ page, backendApp, frontendServer }) => {
    // Create user with known credentials
    const username = 'test-user-pwd-success';
    const password = 'test-password-12345';
    await makeUser(backendApp.address, username, password);
    
    // Login
    await page.goto('/login');
    await page.fill('input[type="text"], input[name="username"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin\/dashboard/);
    
    // Go to password change page
    await page.goto('/admin/password');
    await page.waitForSelector('input[type="password"]');
    const passwordInputs = await page.locator('input[type="password"]').all();
    
    const newPassword = 'newpassword123456';
    await passwordInputs[0].fill(password); // Current password
    await passwordInputs[1].fill(newPassword);
    await passwordInputs[2].fill(newPassword);
    
    await page.click('button[type="submit"]');
    
    // Should show success message
    await expect(page.locator('text=/password has been changed/i')).toBeVisible({ timeout: 10000 });
    
    // Logout and login with new password
    await page.goto('/admin/dashboard');
    await page.click('button:has-text("Logout")');
    await page.waitForURL(/\/login/);
    
    // Login with new password
    await page.fill('input[type="text"], input[name="username"]', username);
    await page.fill('input[type="password"]', newPassword);
    await page.click('button[type="submit"]');
    
    // Should successfully login
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
    expect(page.url()).toContain('/admin/dashboard');
  });
});

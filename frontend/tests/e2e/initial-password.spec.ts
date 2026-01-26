import { test, expect } from '../fixtures';

test.describe('Initial Password', () => {
  test('creates initial admin user successfully', async ({ page, backendApp, frontendServer }) => {
    await page.goto('/initial_password');
    
    // Fill in password form
    await page.waitForSelector('input[type="password"]');
    const passwordInputs = await page.locator('input[type="password"]').all();
    
    await passwordInputs[0].fill('testpassword123456');
    await passwordInputs[1].fill('testpassword123456');
    
    // Submit the form
    await page.click('button[type="submit"]');
    
    // Should redirect to login page
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('shows error when passwords do not match', async ({ page, backendApp, frontendServer }) => {
    await page.goto('/initial_password');
    
    await page.waitForSelector('input[type="password"]');
    const passwordInputs = await page.locator('input[type="password"]').all();
    
    await passwordInputs[0].fill('testpassword123456');
    await passwordInputs[1].fill('differentpassword123456');
    
    await page.click('button[type="submit"]');
    
    // Should show validation error
    await expect(page.locator('text=/Passwords do not match/i')).toBeVisible({ timeout: 5000 });
    
    // Should still be on initial password page
    expect(page.url()).toContain('/initial_password');
  });

  test('shows error when password is too short', async ({ page, backendApp, frontendServer }) => {
    await page.goto('/initial_password');
    
    await page.waitForSelector('input[type="password"]');
    const passwordInputs = await page.locator('input[type="password"]').all();
    
    await passwordInputs[0].fill('short');
    await passwordInputs[1].fill('short');
    
    await page.click('button[type="submit"]');
    
    // Should show validation error
    await expect(page.locator('text=/at least 12 characters/i')).toBeVisible({ timeout: 5000 });
  });

  test('shows error when password is too long', async ({ page, backendApp, frontendServer }) => {
    await page.goto('/initial_password');
    
    await page.waitForSelector('input[type="password"]');
    const passwordInputs = await page.locator('input[type="password"]').all();
    
    const longPassword = 'a'.repeat(129);
    await passwordInputs[0].fill(longPassword);
    await passwordInputs[1].fill(longPassword);
    
    await page.click('button[type="submit"]');
    
    // Should show validation error
    await expect(page.locator('text=/not have more than 128 characters/i')).toBeVisible({ timeout: 5000 });
  });
});

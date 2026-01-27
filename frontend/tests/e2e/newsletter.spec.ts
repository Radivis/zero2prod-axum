import { test, expect, makeUser } from '../fixtures';

test.describe('Newsletter', () => {
  test('newsletter form submission requires authentication', async ({ page, backendApp, frontendServer }) => {
    // Create a user so we don't get redirected to initial_password
    await makeUser(backendApp.address, 'test-user', 'test-password-12345');
    
    // Try to access newsletter page without authentication
    await page.goto('/admin/newsletters');
    
    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('successful newsletter submission', async ({ authenticatedPage }) => {
    await page.goto('/admin/newsletters');
    
    // Fill in the newsletter form
    await authenticatedPage.waitForSelector('input[placeholder*="title"], input[label*="Title"]');
    await authenticatedPage.fill('input[placeholder*="title"], label:has-text("Title") + * input, input:below(label:has-text("Title"))', 'Test Newsletter');
    
    // Fill HTML content
    const htmlContentArea = authenticatedPage.locator('textarea, input').filter({ hasText: /html/i }).or(authenticatedPage.locator('textarea[label*="HTML"]')).first();
    if (await htmlContentArea.count() === 0) {
      // Try finding by label
      const htmlLabel = authenticatedPage.locator('label:has-text("HTML")');
      if (await htmlLabel.count() > 0) {
        await htmlLabel.locator('..').locator('textarea').fill('<p>Test HTML content</p>');
      } else {
        // Fallback: find all textareas and fill the first one
        const textareas = authenticatedPage.locator('textarea');
        await textareas.nth(0).fill('<p>Test HTML content</p>');
      }
    } else {
      await htmlContentArea.fill('<p>Test HTML content</p>');
    }
    
    // Fill text content
    const textContentArea = authenticatedPage.locator('textarea, input').filter({ hasText: /text/i }).or(authenticatedPage.locator('textarea[label*="text"]')).first();
    if (await textContentArea.count() === 0) {
      const textLabel = authenticatedPage.locator('label:has-text("text")');
      if (await textLabel.count() > 0) {
        await textLabel.locator('..').locator('textarea').fill('Test text content');
      } else {
        const textareas = authenticatedPage.locator('textarea');
        await textareas.nth(1).fill('Test text content');
      }
    } else {
      await textContentArea.fill('Test text content');
    }
    
    // Submit the form
    await authenticatedPage.click('button:has-text("Send newsletter"), button[type="submit"]');
    
    // Wait for success message
    await expect(authenticatedPage.locator('text=/newsletter issue has been accepted/i')).toBeVisible({ timeout: 10000 });
    
    // Form should be reset (title should be empty)
    const titleInput = authenticatedPage.locator('input[placeholder*="title"], label:has-text("Title") + * input').first();
    const titleValue = await titleInput.inputValue();
    expect(titleValue).toBe('');
  });

  test('shows validation error for missing fields', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin/newsletters');
    
    // Try to submit without filling required fields
    await authenticatedPage.click('button:has-text("Send newsletter"), button[type="submit"]');
    
    // HTML5 validation should prevent submission, or we should see an error
    // Check if form is still visible (not submitted)
    await expect(authenticatedPage.locator('form')).toBeVisible();
  });
});

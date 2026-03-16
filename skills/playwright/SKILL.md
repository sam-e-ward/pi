---
name: playwright
description: "Install, configure, and use Playwright for browser automation and UI testing. Covers setup, test writing, screenshots, and running tests."
---

# Playwright Skill

Set up and use Playwright for browser automation and end-to-end testing.

## Installation

### Check if installed

```bash
npx playwright --version
```

### Install Playwright

```bash
npm init -y  # if no package.json exists
npm install -D @playwright/test
npx playwright install  # downloads browser binaries (Chromium, Firefox, WebKit)
```

To install only specific browsers:

```bash
npx playwright install chromium
npx playwright install --with-deps chromium  # also installs OS-level dependencies
```

### Verify installation

```bash
npx playwright test --list  # should list available tests (or show empty)
```

## Configuration

Create `playwright.config.ts` if one doesn't exist:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

Adjust `baseURL` and `projects` to match the project's needs.

## Writing Tests

### Basic test structure

```typescript
import { test, expect } from '@playwright/test';

test('page loads and shows heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page).toHaveTitle(/My App/);
});
```

### Screenshots

```typescript
// Full page
await page.screenshot({ path: 'test-results/home-full.png', fullPage: true });

// Specific element
await page.locator('.hero-section').screenshot({ path: 'test-results/hero.png' });
```

### Common interactions

```typescript
// Click
await page.click('button[type="submit"]');
await page.getByRole('button', { name: 'Submit' }).click();

// Fill form
await page.getByLabel('Email').fill('test@example.com');
await page.getByPlaceholder('Search...').fill('query');

// Select
await page.getByRole('combobox').selectOption('value');

// Wait for navigation or network
await page.waitForURL('**/dashboard');
await page.waitForResponse(resp => resp.url().includes('/api/data'));

// Assertions
await expect(page.getByText('Success')).toBeVisible();
await expect(page.locator('.error')).not.toBeVisible();
await expect(page.locator('.items')).toHaveCount(5);
```

### Responsive viewports

```typescript
await page.setViewportSize({ width: 375, height: 812 });  // mobile
await page.setViewportSize({ width: 768, height: 1024 }); // tablet
await page.setViewportSize({ width: 1440, height: 900 }); // desktop
```

### Accessibility helpers

```typescript
// Check for accessible names
await expect(page.getByRole('button', { name: /submit/i })).toBeEnabled();

// Keyboard navigation
await page.keyboard.press('Tab');
await expect(page.locator(':focus')).toBeVisible();
```

## Running Tests

```bash
npx playwright test                          # run all tests
npx playwright test tests/home.spec.ts       # run specific file
npx playwright test --grep "visual"          # filter by name
npx playwright test --reporter=list          # verbose output
npx playwright test --headed                 # show browser window
npx playwright test --debug                  # step-through debugger
npx playwright show-report                   # open HTML report
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `browserType.launch: Executable doesn't exist` | Run `npx playwright install` |
| `Target page, context or browser has been closed` | Increase timeouts or add `await page.waitForLoadState()` |
| Tests hang on CI | Ensure `headless: true` (default) and no `--headed` flag |
| `net::ERR_CONNECTION_REFUSED` | Check that the dev server is running on the expected port |
| Flaky selectors | Prefer `getByRole`, `getByLabel`, `getByText` over CSS selectors |

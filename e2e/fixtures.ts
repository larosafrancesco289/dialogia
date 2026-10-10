// The browser tests' shared setup: a page that fails its test on any uncaught
// error, with no request leaving the machine, and helpers for the steps every
// journey starts with.

import { test as base, expect, type Page } from '@playwright/test';
import { MOCK_URL } from '../playwright.config';

type Fixtures = {
  /** Console errors matching this are expected by the test, not failures. */
  expectedError: RegExp | undefined;
};

export const test = base.extend<Fixtures>({
  expectedError: [undefined, { option: true }],
  context: async ({ context }, provide) => {
    // The app asks OpenRouter for its zero-data-retention list even with no
    // key; nothing in a test may reach the internet.
    await context.route(/^https?:\/\/(?!localhost[:/])/, (route) =>
      route.fulfill({ json: { data: [] } }),
    );
    await provide(context);
  },
  page: async ({ page, expectedError }, provide) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (!expectedError?.test(text)) errors.push(`console: ${text}`);
    });
    await provide(page);
    // The cheapest stand-in for crash reports from users who don't exist yet.
    expect(errors, 'the page logged no unexpected errors').toEqual([]);
  },
});

export { expect };

/** First run: connect the mock as "Your own server". */
export async function connectMock(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Other ways to connect' }).click();
  await page.getByRole('button', { name: /Your own server/ }).click();
  await page.getByRole('textbox', { name: 'Server address' }).fill(MOCK_URL);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Ask anything' })).toBeVisible();
}

export async function send(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Ask anything' }).fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
}

/** The mock's short reply ends with this line. */
export const REPLY_END = 'Done.';

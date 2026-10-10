import { test, expect } from './fixtures';

// OpenRouter stands in for itself: a key is known only if it is the right one.
const RIGHT_KEY = 'sk-or-v1-right';

test.use({ expectedError: /status of 401/ });

test('a wrong key is said once, in the box, and never kept; the right one connects', async ({
  page,
}) => {
  const asked: string[] = [];
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const url = route.request().url();
    if (!url.endsWith('/endpoints/zdr')) asked.push(url);
    const known = route.request().headers()['authorization'] === `Bearer ${RIGHT_KEY}`;
    if (url.endsWith('/key')) {
      return known
        ? route.fulfill({ json: { data: { label: 'test' } } })
        : route.fulfill({
            status: 401,
            json: { error: { message: 'User not found.', code: 401 } },
          });
    }
    if (url.endsWith('/models')) {
      return route.fulfill({
        json: {
          data: [
            {
              id: 'anthropic/claude-haiku-5.5',
              name: 'Anthropic: Claude Haiku 5.5',
              context_length: 200000,
              pricing: { prompt: '0.000001', completion: '0.000005' },
              supported_parameters: ['tools', 'reasoning'],
            },
          ],
        },
      });
    }
    return route.fallback();
  });

  await page.goto('/');
  const field = page.getByRole('textbox', { name: 'OpenRouter key' });
  const connect = page.getByRole('button', { name: 'Connect', exact: true });

  // Not a key at all: caught here, with no call made.
  await field.fill('my-password');
  await connect.click();
  await expect(page.getByRole('alert')).toContainText('keys start with sk-or-');
  expect(asked).toEqual([]);

  await field.fill('sk-or-v1-wrong');
  await connect.click();
  await expect(page.getByRole('alert')).toContainText('OpenRouter did not accept that key');
  // What was pasted stays to be corrected, and nothing else speaks over the box.
  await expect(field).toHaveValue('sk-or-v1-wrong');
  await expect(page.getByText('That key was rejected')).toHaveCount(0);

  // Never saved: the next visit asks again, with nothing to complain about.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'First, connect a model' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await field.fill(RIGHT_KEY);
  await connect.click();
  await expect(page.getByRole('textbox', { name: 'Ask anything' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

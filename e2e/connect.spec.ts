import { test, expect } from './fixtures';

test.use({ expectedError: /ERR_CONNECTION_REFUSED/ });

test('a server address that does not answer is said in the box, with what to check, and never saved', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Other ways to connect' }).click();
  await page.getByRole('button', { name: /Your own server/ }).click();
  // Nothing listens there; the connection is refused at once.
  await page.getByRole('textbox', { name: 'Server address' }).fill('http://localhost:4397/v1');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Could not reach that address.');
  // The browser cannot tell a stopped server from one that refuses this page.
  await expect(alert).toContainText('OLLAMA_ORIGINS');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'First, connect a model' })).toBeVisible();
});

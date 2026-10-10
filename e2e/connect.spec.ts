import { test, expect } from './fixtures';

test.use({ expectedError: /ERR_CONNECTION_REFUSED/ });

test('a server address that does not answer is said in the box and never saved', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Other ways to connect' }).click();
  await page.getByRole('button', { name: /Your own server/ }).click();
  // Nothing listens there; the connection is refused at once.
  await page.getByRole('textbox', { name: 'Server address' }).fill('http://localhost:4397/v1');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();

  await expect(page.getByText('Could not get any models from that address')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'First, connect a model' })).toBeVisible();
});

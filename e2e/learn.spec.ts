import { test, expect, connectMock } from './fixtures';

test('Learn on a model that cannot use tools says so and offers a way out', async ({ page }) => {
  // A server starts with every capability off, tools included.
  await connectMock(page);
  await page.getByRole('button', { name: 'Learn', exact: true }).click();

  const notice = page.getByText(/cannot use tools, so in Learn it can only chat/);
  await expect(notice).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose another model' })).toBeVisible();

  // The header names the model a lesson would really use, and is a control.
  const headerModel = page.getByRole('button', { name: /^Tutor model: mock-/ });
  await expect(headerModel).toBeVisible();

  await page.getByRole('button', { name: 'Turn on Tools in Settings' }).click();
  await expect(page.getByRole('tab', { name: 'Connections', selected: true })).toBeVisible();
});

test('Chat says nothing about tools', async ({ page }) => {
  await connectMock(page);
  await expect(page.getByText(/cannot use tools/)).toHaveCount(0);
});

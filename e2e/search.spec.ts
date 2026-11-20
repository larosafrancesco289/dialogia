import { test, expect, connectMock, send, REPLY_END } from './fixtures';

test('quick search finds a message in another chat and jumps to it', async ({ page }) => {
  await connectMock(page);
  await send(page, 'First conversation about marmalade');
  const main = page.getByRole('main');
  await expect(main.getByText(REPLY_END)).toBeVisible();

  // Start a second chat so the first one is no longer active.
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await send(page, 'Second conversation about glaciers');
  await expect(main.getByText(REPLY_END)).toBeVisible();
  await expect(main.getByText(/marmalade/)).toHaveCount(0);

  // Open quick search via the header button and search for a word in the first chat.
  await page.getByRole('button', { name: 'Search chats and messages' }).click();
  const dialog = page.getByRole('dialog', { name: 'Search chats and messages' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox').fill('marmalade');

  const hit = dialog.getByRole('option', { name: /marmalade/i }).first();
  await expect(hit).toBeVisible();
  await hit.click();

  await expect(dialog).toBeHidden();
  await expect(main.getByText('First conversation about marmalade')).toBeVisible();
});

test('desktop keyboard shortcuts open quick search, toggle the sidebar, and open Settings', async ({
  page,
}) => {
  await connectMock(page);

  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search chats and messages' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const toggle = page.getByRole('button', { name: 'Toggle sidebar' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Control+b');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Control+b');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Control+,');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
});

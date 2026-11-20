import { readFileSync } from 'node:fs';
import { test, expect, connectMock, send, REPLY_END } from './fixtures';

test('an export imported into a fresh browser brings the chats back', async ({
  page,
  browser,
}, testInfo) => {
  await connectMock(page);
  await send(page, 'Remember this exchange');
  await expect(page.getByRole('main').getByText(REPLY_END)).toBeVisible();

  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('tab', { name: 'Data' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const file = testInfo.outputPath('export.json');
  await (await downloading).saveAs(file);

  // Another browser profile: no chats, no server, no keys.
  const fresh = await browser.newContext({ serviceWorkers: 'block' });
  await fresh.route(/^https?:\/\/(?!localhost[:/])/, (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  const other = await fresh.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'Open settings' }).click();
  await other.getByRole('tab', { name: 'Data' }).click();
  // The Import button is a label around a hidden file input.
  await other
    .getByRole('tabpanel', { name: 'Data' })
    .getByLabel('Import', { exact: true })
    .setInputFiles(file);
  // The question, when the backup asks one, opens only once the file is read:
  // wait for it or the result, since checking at once can miss it on a slow run.
  const confirm = other.getByRole('alertdialog').or(other.getByRole('dialog', { name: /Import/ }));
  const imported = other.getByText(/Imported 1 chat/);
  await expect(confirm.or(imported).first()).toBeVisible();
  if (await confirm.isVisible()) {
    await confirm.getByRole('button', { name: 'Import' }).click();
  }
  await expect(imported).toBeVisible();
  await other.getByRole('button', { name: 'Close settings' }).click();
  await other.getByRole('complementary').getByText('Mock title').click();
  await expect(other.getByRole('main').getByText('Remember this exchange')).toBeVisible();
  await expect(other.getByRole('main').getByText(REPLY_END)).toBeVisible();
  await fresh.close();
});

test('a single chat exports as a Markdown file from the sidebar', async ({ page }, testInfo) => {
  await connectMock(page);
  await send(page, 'Write a haiku about cedar trees');
  await expect(page.getByRole('main').getByText(REPLY_END)).toBeVisible();
  const row = page.getByRole('complementary').locator('.chat-item').first();
  await expect(row).toContainText('Mock title');
  await row.hover();

  const downloading = page.waitForEvent('download');
  await row.getByRole('button', { name: /Download .* as Markdown/ }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('mock-title.md');
  const out = testInfo.outputPath('chat.md');
  await download.saveAs(out);
  const text = readFileSync(out, 'utf8');
  expect(text).toContain('# Mock title');
  expect(text).toContain('Write a haiku about cedar trees');
  expect(text).toContain(REPLY_END);
});

test('Usage and spend overview counts replies without double-counting branched chats', async ({
  page,
}) => {
  await connectMock(page);
  await send(page, 'Count this reply once');
  const main = page.getByRole('main');
  await expect(main.getByText(REPLY_END)).toBeVisible();

  // Branch from the reply: the copied reply must not double-count usage.
  await main.getByRole('button', { name: 'Branch in a new chat' }).click();
  await expect(page.getByRole('complementary').locator('.chat-item')).toHaveCount(2);

  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('tab', { name: 'Data' }).click();
  const dataPanel = page.getByRole('tabpanel', { name: 'Data' });
  await expect(dataPanel.getByRole('heading', { name: 'Usage and spend' })).toBeVisible();
  // Unpriced local model shows "—" instead of "$0.00", and 1 reply (not 2).
  await expect(dataPanel.locator('.usage-summary__item').nth(0)).toContainText('—');
  await expect(dataPanel.locator('.usage-summary__item').nth(1)).toContainText('1');
  await expect(dataPanel.getByText('mock-fast')).toBeVisible();
  await expect(dataPanel.getByText('1 reply')).toBeVisible();

  await dataPanel.getByRole('radio', { name: '7 days' }).click();
  await expect(dataPanel.getByRole('radio', { name: '7 days' })).toBeChecked();
});

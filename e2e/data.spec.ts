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

// Seeding a browser with chats the mock cannot produce (a tutor session, one
// studied days ago): export this browser's own chat, so the rows name the
// mock, rewrite the backup, and import it through Settings > Data.

import fs from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';
import { expect } from './fixtures';

export type Row = Record<string, unknown>;
export type Backup = { chats: Row[]; messages: Row[] };

/** The phone layout (src/lib/ui/breakpoints.ts), with its drawer and sheets. */
export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** Settings, on a phone through the chats drawer. */
export async function openSettings(page: Page) {
  if (!isPhone(page)) {
    await page.getByRole('button', { name: 'Open settings' }).click();
    return;
  }
  await page.getByRole('button', { name: 'Open chats' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
}

/** One page of Settings: a tab on a wide screen, a row of the list on a phone. */
export async function openSettingsPage(page: Page, label: string) {
  if (!isPhone(page)) {
    await page.getByRole('tab', { name: label }).click();
    await expect(page.getByRole('tabpanel', { name: label })).toBeVisible();
    return;
  }
  const back = page.getByRole('button', { name: 'Back to Settings' });
  if (await back.isVisible()) await back.click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: new RegExp(`^${label}`) })
    .click();
  await expect(back).toBeVisible();
}

/** Replaces nothing: the imported chats join the ones already here. */
export async function importBackup(
  page: Page,
  testInfo: TestInfo,
  build: (exported: Backup) => object,
) {
  await openSettings(page);
  await openSettingsPage(page, 'Data');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const exported = testInfo.outputPath('export.json');
  await (await downloading).saveAs(exported);
  const backup = testInfo.outputPath('seeded.json');
  await fs.writeFile(
    backup,
    JSON.stringify(build(JSON.parse(await fs.readFile(exported, 'utf8')))),
  );
  // Data has two pickers now: a backup's Import, and other apps' histories.
  await page.getByLabel('Import', { exact: true }).setInputFiles(backup);
  // With chats already here, the import asks first; the question can take a
  // moment to come up, so wait for it or for the import's own word.
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: /Import/ }));
  const imported = page.getByText(/Imported 1 chat/);
  await expect(confirm.or(imported).first()).toBeVisible();
  if (await confirm.isVisible()) await confirm.getByRole('button', { name: 'Import' }).click();
  await expect(imported).toBeVisible();
  await page.getByRole('button', { name: 'Close settings' }).click();
}

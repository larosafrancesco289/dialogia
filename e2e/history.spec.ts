import { test, expect } from './fixtures';

// A ChatGPT export's conversations.json: one conversation whose branch shown
// ends at the newer reply, with the edited-away reply beside it.
const conversations = [
  {
    id: 'e2e-conversation',
    title: 'Planning a trip to Lisbon',
    create_time: 1_700_000_000,
    update_time: 1_700_000_100,
    current_node: 'a-new',
    mapping: {
      root: { id: 'root', parent: null, children: ['u'], message: null },
      u: {
        id: 'u',
        parent: 'root',
        children: ['a-old', 'a-new'],
        message: {
          id: 'u',
          author: { role: 'user' },
          create_time: 1_700_000_010,
          content: { content_type: 'text', parts: ['Where should I eat in Alfama?'] },
        },
      },
      'a-old': {
        id: 'a-old',
        parent: 'u',
        children: [],
        message: {
          id: 'a-old',
          author: { role: 'assistant' },
          create_time: 1_700_000_020,
          content: { content_type: 'text', parts: ['An answer that was regenerated.'] },
        },
      },
      'a-new': {
        id: 'a-new',
        parent: 'u',
        children: [],
        message: {
          id: 'a-new',
          author: { role: 'assistant' },
          create_time: 1_700_000_030,
          content: { content_type: 'text', parts: ['Try the grilled sardines by the castle.'] },
        },
      },
    },
  },
];

test('a ChatGPT export imported into a fresh browser shows up in the sidebar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('tab', { name: 'Data' }).click();
  await page
    .getByRole('tabpanel', { name: 'Data' })
    .getByLabel('Choose file')
    .setInputFiles({
      name: 'conversations.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(conversations)),
    });
  await page
    .getByRole('alertdialog')
    .or(page.getByRole('dialog', { name: /Import/ }))
    .getByRole('button', { name: 'Import' })
    .click();
  await expect(
    page.getByText('Imported 1 chat from ChatGPT, into the folder “From ChatGPT”.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close settings' }).click();

  const sidebar = page.getByRole('complementary');
  await sidebar.getByRole('button', { name: /From ChatGPT/ }).click();
  await sidebar.getByText('Planning a trip to Lisbon').click();
  const main = page.getByRole('main');
  await expect(main.getByText('Where should I eat in Alfama?')).toBeVisible();
  await expect(main.getByText('Try the grilled sardines by the castle.')).toBeVisible();
  await expect(main.getByText('An answer that was regenerated.')).toHaveCount(0);
});

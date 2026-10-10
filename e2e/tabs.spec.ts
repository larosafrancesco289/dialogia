import { test, expect, connectMock, send, REPLY_END } from './fixtures';

test('a reply written in one tab shows up in another, and that tab may not send into it meanwhile', async ({
  page,
  context,
}) => {
  await connectMock(page);
  await send(page, 'Seed the chat');
  await expect(page.getByRole('main').getByText(REPLY_END)).toBeVisible();

  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('main').getByText('Seed the chat')).toBeVisible();

  await send(page, 'Second question [tick=120]');
  await expect(other.getByRole('main').getByText('Second question [tick=120]')).toBeVisible();
  // While the first tab writes, the second shows the reply in progress and
  // offers no send of its own into the same chat.
  await expect(other.getByRole('button', { name: 'Send message' })).toHaveCount(0);

  await expect(page.getByRole('main').getByText(REPLY_END)).toHaveCount(2);
  await expect(other.getByRole('main').getByText(REPLY_END)).toHaveCount(2);
  await expect(other.getByRole('button', { name: 'Send message' })).toBeVisible();
});

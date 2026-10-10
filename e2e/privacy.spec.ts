import { test, expect, connectMock, send, REPLY_END } from './fixtures';

test('someone on their own server sends nothing to OpenRouter: no model list, no retention list', async ({
  page,
  context,
}) => {
  const external: string[] = [];
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== 'localhost')
      external.push(`${request.method()} ${url.origin}${url.pathname}`);
  });

  await connectMock(page);
  await send(page, 'Hello');
  await expect(page.getByRole('main').getByText(REPLY_END)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('main').getByText(REPLY_END)).toBeVisible();

  expect(external, 'requests that left the machine').toEqual([]);
});

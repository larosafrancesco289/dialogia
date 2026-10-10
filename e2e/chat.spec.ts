import { test, expect, connectMock, send, REPLY_END } from './fixtures';

test('a first-time visitor connects their own server, sends, and the reply streams in and survives a reload', async ({
  page,
}) => {
  await connectMock(page);
  await send(page, 'Hello there [tick=40]');

  const main = page.getByRole('main');
  await expect(page.getByRole('button', { name: 'Stop the reply' })).toBeVisible();
  // It grows while it streams, rather than landing whole.
  await expect(main.getByText(/^Sure\. Here is/)).toBeVisible();
  await expect(main.getByText(REPLY_END)).toHaveCount(0);
  await expect(main.getByText(REPLY_END)).toBeVisible();
  await expect(main.getByRole('listitem')).toHaveText(['one', 'two', 'three']);
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();

  await page.reload();
  await expect(main.getByText('Hello there [tick=40]')).toBeVisible();
  await expect(main.getByText(REPLY_END)).toBeVisible();
  await expect(page.getByRole('complementary').getByText('Mock title')).toBeVisible();
});

test('Stop keeps what arrived, says it was stopped, and both survive a reload', async ({
  page,
}) => {
  await connectMock(page);
  await send(page, 'Go slowly [tick=200]');

  const main = page.getByRole('main');
  await expect(main.getByText(/^Sure/)).toBeVisible();
  await page.getByRole('button', { name: 'Stop the reply' }).click();
  await expect(main.getByText('Stopped before the end.')).toBeVisible();
  const partial = await main.getByText(/^Sure/).textContent();
  expect(partial?.length).toBeGreaterThan(0);

  // A later send in the same chat still works.
  await send(page, 'And again');
  await expect(main.getByText(REPLY_END)).toBeVisible();

  await page.reload();
  await expect(main.getByText('Stopped before the end.')).toBeVisible();
  await expect(main.getByText(partial!, { exact: true })).toBeVisible();
});

test('a connection that closes mid-reply is marked cut off, not passed off as finished', async ({
  page,
}) => {
  await connectMock(page);
  await send(page, 'Please answer [cut]');

  const main = page.getByRole('main');
  await expect(main.getByText(/The connection closed before the reply finished/)).toBeVisible();
  await expect(main.getByText(REPLY_END)).toHaveCount(0);

  await page.reload();
  await expect(main.getByText(/The connection closed before the reply finished/)).toBeVisible();
});

test.describe('a provider error', () => {
  test.use({ expectedError: /status of 500|Mock failure 500/ });

  test('reads as a plain sentence, the provider’s words under Details, and Try again recovers', async ({
    page,
  }) => {
    await connectMock(page);
    // The first streamed request fails; every later one reaches the mock.
    let failed = false;
    await page.route('**/v1/chat/completions', async (route) => {
      if (failed || !route.request().postData()?.includes('"stream":true')) {
        return route.fallback();
      }
      failed = true;
      await route.fulfill({ status: 500, json: { error: { message: 'Mock failure 500' } } });
    });
    await send(page, 'Break once');

    const main = page.getByRole('main');
    await expect(main.getByText('This reply failed.')).toBeVisible();
    await expect(main.getByText(/The provider had a problem on its side/)).toBeVisible();
    await expect(main.getByText('500: Mock failure 500')).toBeHidden();
    await main.getByText('What the provider said').click();
    await expect(main.getByText('500: Mock failure 500')).toBeVisible();

    await main.getByRole('button', { name: 'Try again' }).click();
    await expect(main.getByText(REPLY_END)).toBeVisible();
    await expect(main.getByText(/Mock failure 500/)).toHaveCount(0);
  });
});

test('Try again writes a new version of a finished reply', async ({ page }) => {
  await connectMock(page);
  await send(page, 'Hello');
  const main = page.getByRole('main');
  await expect(main.getByText(REPLY_END)).toBeVisible();

  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('menuitem', { name: /mock-fast/ }).click();
  await expect(page.getByRole('button', { name: 'Stop the reply' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
  await expect(main.getByText(REPLY_END)).toHaveCount(1);
  await expect(main.getByText(/2\s*\/\s*2/)).toBeVisible();
});

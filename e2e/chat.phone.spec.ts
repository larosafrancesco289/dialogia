import { test, expect, connectMock, send, REPLY_END } from './fixtures';

test('on a phone the first run, a send and the reply fit the screen', async ({ page }) => {
  await connectMock(page);
  await send(page, 'Hello from a phone');
  await expect(page.getByRole('main').getByText(REPLY_END)).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'no sideways scroll').toBeLessThanOrEqual(0);
});

import { test, expect, connectMock, send, REPLY_END } from './fixtures';

test.describe('with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a reply on its way says so in words, since the mark stands still', async ({
    page,
  }, testInfo) => {
    await connectMock(page);
    await send(page, 'Take your time [delay=2500]');
    const main = page.getByRole('main');
    const waiting = main.getByRole('status', { name: 'Writing a reply' });
    await expect(waiting.getByText('Writing a reply')).toBeVisible();
    // The gold voice holds half drawn, not whole like the mark at rest.
    const dash = await waiting
      .locator('.logo-mark__voice--close')
      .evaluate((path) => getComputedStyle(path).strokeDasharray);
    expect(dash).not.toBe('none');
    await page.screenshot({ path: testInfo.outputPath('waiting.png') });
    await expect(main.getByText(REPLY_END)).toBeVisible();
    await expect(main.getByText('Writing a reply')).toHaveCount(0);
  });
});

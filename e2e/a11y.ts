// The accessibility scans, shared by the wide (a11y.spec.ts) and phone
// (a11y.phone.spec.ts) runs: each main screen, in the light and the dark
// theme, checked by axe against WCAG 2.x A and AA. A serious or critical
// violation fails the test; the full report is attached either way.

import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect, connectMock, send, REPLY_END } from './fixtures';
import { importBackup, isPhone, openSettings, openSettingsPage, type Backup } from './backup';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);

const SETTINGS_PAGES = ['Connections', 'Models', 'Chat', 'Tutor', 'Appearance', 'Data'];

/**
 * Scan what is on screen once it has settled. axe already leaves disabled
 * controls out of the contrast rule, as WCAG does.
 */
async function scan(page: Page, testInfo: TestInfo, screen: string) {
  // A fade caught halfway reads as low contrast. Looping animations never
  // finish, and the scans run with reduced motion, so few are left. Reduced
  // motion still fades opacity (framer-motion keeps it), and a fade only shows
  // up in getAnimations a frame after its element mounts at opacity 0, so wait
  // two frames first, then until no inline opacity sits between 0 and 1.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every(
          (animation) =>
            animation.playState !== 'running' ||
            animation.effect?.getComputedTiming().iterations === Infinity,
        ) &&
      [...document.querySelectorAll<HTMLElement>('[style*="opacity"]')].every((element) => {
        const opacity = Number(element.style.opacity);
        return opacity === 0 || opacity === 1;
      }),
  );
  await page.evaluate(() => document.fonts.ready);
  const { violations, incomplete } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  // What axe could not decide (text over an image or a gradient) is attached
  // for a person to look at, not failed on.
  await testInfo.attach(`axe ${screen}`, {
    body: JSON.stringify({ violations, incomplete }, null, 2),
    contentType: 'application/json',
  });
  const blocking = violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ''))
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help} at ${violation.nodes
          .slice(0, 6)
          .map((node) => node.target.join(' '))
          .join(', ')}`,
    );
  expect.soft(blocking, `${screen}: no serious or critical WCAG violations`).toEqual([]);
}

/**
 * A tutor session waiting on the learner: an approved plan on the first reply
 * and an unanswered quiz on the second, from a real chat of this browser's
 * export so its settings name the mock.
 */
function tutorSession(exported: Backup) {
  const source = exported.chats[0] as {
    settings: Record<string, unknown> & { modelId: string; features: Record<string, unknown> };
  };
  const chatId = 'chat-tutor';
  const at = Date.now() - 60_000;
  const chat = {
    ...source,
    id: chatId,
    title: 'Fractions practice',
    createdAt: at,
    updatedAt: at,
    settings: {
      ...source.settings,
      features: {
        ...source.settings.features,
        tutor: { enabled: true, defaultModelId: source.settings.modelId },
      },
    },
  };
  const message = (id: string, role: 'user' | 'assistant', content: string, n: number) => ({
    ...exported.messages[role === 'user' ? 0 : 1],
    id,
    chatId,
    content,
    createdAt: at + n,
  });
  const messages = [
    message('user-1', 'user', 'Teach me fractions', 1),
    message('reply-1', 'assistant', 'Here is a plan.', 2),
    message('user-2', 'user', 'Ready', 3),
    message('reply-2', 'assistant', 'A quick check before we go on.', 4),
  ];
  const node = (id: string, name: string, prerequisites: string[] = []) => ({
    id,
    name,
    objectives: [`Work with ${name.toLowerCase()}`],
    prerequisites,
    status: 'not_started',
  });
  const plan = {
    goal: 'Add fractions',
    generatedAt: at,
    updatedAt: at,
    version: 1,
    nodes: [
      node('equivalent', 'Equivalent fractions'),
      node('adding', 'Adding fractions', ['equivalent']),
    ],
  };
  const drafts = [
    {
      type: 'plan_proposed',
      by: 'tutor',
      messageId: 'reply-1',
      proposalId: 'p1',
      plan,
      revision: false,
    },
    { type: 'plan_approved', by: 'learner', messageId: 'reply-1', proposalId: 'p1' },
    { type: 'topic_started', by: 'learner', nodeId: 'equivalent' },
    {
      type: 'quiz_given',
      by: 'tutor',
      messageId: 'reply-2',
      quizId: 'quiz1',
      nodeId: 'equivalent',
      items: [
        {
          id: 'q1',
          question: 'Which fraction equals 1/2?',
          choices: ['2/4', '2/3', '3/4'],
          correct: 0,
        },
        {
          id: 'q2',
          question: 'Which fraction equals 2/3?',
          choices: ['3/6', '4/6', '6/4'],
          correct: 1,
        },
      ],
    },
  ];
  const tutorEvents = drafts.map((draft, i) => ({
    ...draft,
    id: `event-${i + 1}`,
    chatId,
    seq: i + 1,
    at: at + i * 1000,
  }));
  return { chats: [chat], messages, tutorEvents };
}

async function openChat(page: Page, title: string) {
  if (isPhone(page)) await page.getByRole('button', { name: 'Open chats' }).click();
  await page.getByText(title, { exact: true }).first().click();
}

/** Every scan, in each theme the app offers, at the size the project sets. */
export function defineA11yScans() {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${colorScheme} theme`, () => {
      // The theme left on Auto follows the system's scheme, which is how the
      // app itself sets it (useThemeMode); motion is reduced so nothing is
      // scanned mid-fade.
      test.use({ colorScheme, contextOptions: { reducedMotion: 'reduce' } });

      test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('html')).toHaveClass(
          colorScheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/,
        );
      });

      test('welcome', async ({ page }, testInfo) => {
        await expect(page.getByRole('button', { name: 'Other ways to connect' })).toBeVisible();
        await scan(page, testInfo, 'welcome');
        await page.getByRole('button', { name: 'Other ways to connect' }).click();
        await expect(page.getByRole('button', { name: /Your own server/ })).toBeVisible();
        await scan(page, testInfo, 'welcome, other ways open');
      });

      test('chat with a long reply, and the model picker', async ({ page }, testInfo) => {
        await connectMock(page);
        const picker = page.locator('.model-picker-trigger').first();
        await picker.click();
        const option = page.getByRole('option', { name: /mock-long/ });
        await expect(option).toBeVisible();
        await scan(page, testInfo, 'model picker');
        await option.click();
        await send(page, 'Write me something long');
        await expect(page.getByRole('main').getByText('That is the end.')).toBeVisible({
          timeout: 20_000,
        });
        await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
        await scan(page, testInfo, 'chat with a long reply');
      });

      test('each Settings page', async ({ page }, testInfo) => {
        await connectMock(page);
        await openSettings(page);
        for (const label of SETTINGS_PAGES) {
          await openSettingsPage(page, label);
          await scan(page, testInfo, `Settings > ${label}`);
        }
      });

      test('Memory', async ({ page }, testInfo) => {
        await connectMock(page);
        if (isPhone(page)) {
          await page.getByRole('button', { name: 'Open chats' }).click();
          await page.getByRole('button', { name: 'Memory', exact: true }).click();
        } else {
          await page.getByRole('button', { name: 'Open memory' }).click();
        }
        await expect(page.getByRole('button', { name: 'Close memory' })).toBeVisible();
        await scan(page, testInfo, 'Memory');
      });

      test('Learn', async ({ page }, testInfo) => {
        await connectMock(page);
        await page.getByRole('button', { name: 'Learn', exact: true }).click();
        await expect(page.getByText(/cannot use tools/)).toBeVisible();
        await scan(page, testInfo, 'Learn');
      });

      test('a tutor session with a quiz waiting', async ({ page }, testInfo) => {
        test.slow();
        await connectMock(page);
        await send(page, 'Seed the export');
        // An import waits for every reply to finish.
        await expect(page.getByRole('main').getByText(REPLY_END)).toBeVisible();
        await importBackup(page, testInfo, tutorSession);
        await openChat(page, 'Fractions practice');
        await expect(page.getByText('Which fraction equals 1/2?')).toBeVisible();
        await scan(page, testInfo, 'tutor quiz card');
      });
    });
  }
}

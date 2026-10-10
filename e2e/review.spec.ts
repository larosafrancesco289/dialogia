import { test, expect, connectMock, send, REPLY_END } from './fixtures';
import { MOCK_URL } from '../playwright.config';
import { importBackup, type Backup, type Row } from './backup';

const DAY = 24 * 60 * 60 * 1000;

/**
 * A tutor chat whose first topic was finished nine days ago, built from a real
 * chat of this browser's export so its settings name the mock: the plan, a
 * quiz answered right three times, the topic completed, the next one started.
 */
function studiedChat(exported: Backup) {
  const source = exported.chats[0] as { settings: Row & { modelId: string; features: Row } };
  const chatId = 'chat-studied';
  // An hour more than nine days, so every row of it reads nine days old.
  const at = Date.now() - 9 * DAY - 60 * 60 * 1000;
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
  const reply = 'reply-1';
  const messages = [
    { ...exported.messages[0], id: 'user-1', chatId, content: 'Teach me fractions', createdAt: at },
    { ...exported.messages[1], id: reply, chatId, content: 'Here is a plan.', createdAt: at + 1 },
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
  const items = [1, 2, 3].map((n) => ({
    id: `q${n}`,
    question: `Is ${n}/${2 * n} a half?`,
    choices: ['Yes', 'No'],
    correct: 0,
  }));
  const drafts: Row[] = [
    {
      type: 'plan_proposed',
      by: 'tutor',
      messageId: reply,
      proposalId: 'p1',
      plan,
      revision: false,
    },
    { type: 'plan_approved', by: 'learner', messageId: reply, proposalId: 'p1' },
    { type: 'topic_started', by: 'learner', nodeId: 'equivalent' },
    {
      type: 'quiz_given',
      by: 'tutor',
      messageId: reply,
      quizId: 'quiz1',
      nodeId: 'equivalent',
      items,
    },
    ...items.flatMap((item) => [
      {
        type: 'quiz_answered',
        by: 'learner',
        quizId: 'quiz1',
        itemId: item.id,
        choice: 0,
        correct: true,
      },
      {
        type: 'evidence_recorded',
        by: 'system',
        nodeId: 'equivalent',
        source: 'quiz',
        kind: 'correct_answer',
        weight: 0.25,
        note: `Quiz, right: "${item.question}"`,
      },
    ]),
    {
      type: 'topic_completed',
      by: 'tutor',
      messageId: reply,
      nodeId: 'equivalent',
      how: 'mastered',
    },
    { type: 'topic_started', by: 'learner', nodeId: 'adding' },
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

test('a topic studied nine days ago is offered for a refresher on the Learn page and in the Hub', async ({
  page,
}, testInfo) => {
  await connectMock(page);
  await send(page, 'Remember this exchange');
  await expect(page.getByRole('main').getByText(REPLY_END)).toBeVisible();

  await importBackup(page, testInfo, studiedChat);

  // A fresh page in Learn lists it, with the session it comes from.
  await page.getByRole('button', { name: 'New chat' }).first().click();
  await page.getByRole('button', { name: 'Learn' }).click();
  const offer = page.getByRole('region', { name: 'Fractions practice' });
  await expect(offer.getByText('Equivalent fractions')).toBeVisible();
  await expect(offer.getByText('Studied 9 days ago')).toBeVisible();

  // Review now opens that session and asks the tutor, who reads the gap.
  await offer.getByRole('button', { name: 'Review now' }).click();
  const main = page.getByRole('main');
  await expect(main.getByText('Asked to review: Equivalent fractions')).toBeVisible();
  await expect(main.getByText(REPLY_END)).toBeVisible();
  const requests = (await (
    await fetch(`${MOCK_URL.replace(/\/v1$/, '')}/__requests`)
  ).json()) as Array<{ messages?: Array<{ role: string; content: unknown }> }>;
  // The mock serves every test running in parallel: this session's turn is
  // the last request whose instructions carry its plan.
  const systemOf = (request: (typeof requests)[number]) =>
    JSON.stringify(request.messages?.filter((m) => m.role === 'system'));
  const turn = [...requests].reverse().find((r) => systemOf(r).includes('Equivalent fractions'));
  const system = turn ? systemOf(turn) : '';
  expect(system).toContain('Back after a break: the last exchange here was 9 days ago.');
  expect(system).toContain('Due for a refresher, studied a while ago and not practised since');

  // The Hub says the same: still due, since no refresher has been answered yet.
  const openHub = page.getByRole('button', { name: 'Open Learning Hub' });
  if (await openHub.isVisible()) await openHub.click();
  const hub = page.getByRole('region', { name: 'Time for a refresher' });
  await expect(hub.getByText('Equivalent fractions')).toBeVisible();
  await expect(hub.getByText('Studied 9 days ago')).toBeVisible();
  await expect(hub.getByRole('button', { name: 'Review now' })).toBeVisible();
  // On the path, the finished topic says so beside its status.
  await expect(page.getByText('Due for a refresher')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('hub.png') });
});

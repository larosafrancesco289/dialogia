import { kvGet, kvSet } from '@/lib/db';

export type TutorDeckCard = {
  id: string;
  front: string;
  back: string;
  hint?: string;
  topic?: string;
  skill?: string;
  // SRS scheduling
  ease: number; // SM-2 ease factor, e.g., 2.5 default
  interval: number; // days
  dueAt: number; // ms epoch
  lastReviewedAt?: number;
  lapses?: number;
  createdAt: number;
};

export type TutorDeck = {
  chatId: string;
  updatedAt: number;
  cards: TutorDeckCard[];
};

const keyFor = (chatId: string) => `tutor-deck:${chatId}`;

export async function loadDeck(chatId: string): Promise<TutorDeck | undefined> {
  return (await kvGet<TutorDeck>(keyFor(chatId))) as TutorDeck | undefined;
}

async function saveDeck(deck: TutorDeck): Promise<void> {
  await kvSet(keyFor(deck.chatId), deck);
}

export async function addCardsToDeck(
  chatId: string,
  cards: Array<{
    id?: string;
    front: string;
    back: string;
    hint?: string;
    topic?: string;
    skill?: string;
  }>,
): Promise<TutorDeck> {
  const now = Date.now();
  const deck = (await loadDeck(chatId)) || { chatId, updatedAt: now, cards: [] };
  const existing = new Set(deck.cards.map((c) => c.front + '\u0000' + c.back));
  for (const raw of cards) {
    const key = (raw.front || '') + '\u0000' + (raw.back || '');
    if (!raw.front || !raw.back) continue;
    if (existing.has(key)) continue; // avoid duplicates by content
    deck.cards.push({
      id: raw.id || `${now}_${Math.random().toString(36).slice(2, 8)}`,
      front: raw.front,
      back: raw.back,
      hint: raw.hint,
      topic: raw.topic,
      skill: raw.skill,
      ease: 2.5,
      interval: 0,
      dueAt: now, // due immediately
      createdAt: now,
      lapses: 0,
    });
  }
  deck.updatedAt = Date.now();
  await saveDeck(deck);
  return deck;
}

export async function getDueCards(chatId: string, limit = 20): Promise<TutorDeckCard[]> {
  const deck = await loadDeck(chatId);
  if (!deck) return [];
  const now = Date.now();
  return deck.cards
    .filter((c) => c.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt || a.createdAt - b.createdAt)
    .slice(0, Math.max(1, Math.min(40, limit)));
}

// Record a review with coarse grades: 'again' (0), 'good' (3), 'easy' (5)
export async function recordReview(
  chatId: string,
  cardId: string,
  grade: 'again' | 'good' | 'easy' = 'good',
): Promise<TutorDeck | undefined> {
  const deck = await loadDeck(chatId);
  if (!deck) return deck;
  const idx = deck.cards.findIndex((c) => c.id === cardId);
  if (idx === -1) return deck;
  const now = Date.now();
  const card = deck.cards[idx];
  const q = grade === 'again' ? 2 : grade === 'good' ? 4 : 5; // SM-2 quality
  let ease = card.ease || 2.5;
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  let interval = card.interval || 0;
  if (q < 3) {
    interval = 0;
    card.lapses = (card.lapses || 0) + 1;
  } else if (interval === 0) {
    interval = 1;
  } else if (interval === 1) {
    interval = 6;
  } else {
    interval = Math.round(interval * ease);
  }
  card.ease = ease;
  card.interval = interval;
  card.lastReviewedAt = now;
  // schedule next review (interval in days)
  card.dueAt = now + interval * 24 * 60 * 60 * 1000;
  deck.cards[idx] = card;
  deck.updatedAt = now;
  await saveDeck(deck);
  return deck;
}

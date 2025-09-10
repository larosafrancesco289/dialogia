import { kvGet, kvSet } from '@/lib/db';
import type { TutorEvent, TutorProfile } from '@/lib/types';

const keyFor = (chatId: string) => `tutor-profile:${chatId}`;

export async function loadTutorProfile(chatId: string): Promise<TutorProfile | undefined> {
  return (await kvGet<TutorProfile>(keyFor(chatId))) as TutorProfile | undefined;
}

export async function updateTutorProfile(chatId: string, evt: TutorEvent): Promise<TutorProfile> {
  const prev =
    (await loadTutorProfile(chatId)) ||
    ({
      chatId,
      updatedAt: Date.now(),
      totalAnswered: 0,
      totalCorrect: 0,
      topics: {},
      skills: {},
      difficulty: {
        easy: { correct: 0, wrong: 0 },
        medium: { correct: 0, wrong: 0 },
        hard: { correct: 0, wrong: 0 },
      },
    } satisfies TutorProfile);

  const next: TutorProfile = { ...prev, updatedAt: Date.now() };
  if (evt.kind === 'mcq' || evt.kind === 'fill_blank' || evt.kind === 'flashcard') {
    const isCorrect = !!evt.correct;
    next.totalAnswered += 1;
    if (isCorrect) next.totalCorrect += 1;
    if (evt.topic) {
      const t = next.topics || (next.topics = {});
      const rec = (t[evt.topic] = t[evt.topic] || { correct: 0, wrong: 0 });
      if (isCorrect) rec.correct += 1;
      else rec.wrong += 1;
    }
    if (evt.skill) {
      const s = next.skills || (next.skills = {});
      const rec = (s[evt.skill] = s[evt.skill] || { correct: 0, wrong: 0 });
      if (isCorrect) rec.correct += 1;
      else rec.wrong += 1;
    }
    if (evt.difficulty) {
      const d =
        next.difficulty ||
        (next.difficulty = {
          easy: { correct: 0, wrong: 0 },
          medium: { correct: 0, wrong: 0 },
          hard: { correct: 0, wrong: 0 },
        });
      const rec = d[evt.difficulty];
      if (isCorrect) rec.correct += 1;
      else rec.wrong += 1;
    }
  }

  await kvSet(keyFor(chatId), next);
  return next;
}

export function summarizeTutorProfile(p: TutorProfile | undefined): string {
  if (!p) return '';
  const total = Math.max(1, p.totalAnswered);
  const acc = Math.round((p.totalCorrect / total) * 100);

  const ratio = (c: number, w: number) => (c + w > 0 ? c / (c + w) : 0);
  const topWeak = Object.entries(p.topics || {})
    .map(([k, v]) => ({ k, a: ratio(v.correct, v.wrong), n: v.correct + v.wrong }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => a.a - b.a)
    .slice(0, 2)
    .map((x) => `${x.k} (${Math.round(x.a * 100)}%)`);
  const topStrong = Object.entries(p.topics || {})
    .map(([k, v]) => ({ k, a: ratio(v.correct, v.wrong), n: v.correct + v.wrong }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.a - a.a)
    .slice(0, 2)
    .map((x) => `${x.k} (${Math.round(x.a * 100)}%)`);
  const weakStr = topWeak.length ? `Focus next: ${topWeak.join(', ')}` : '';
  const strongStr = topStrong.length ? `Strengths: ${topStrong.join(', ')}` : '';
  const parts = [`Accuracy: ${acc}% (${p.totalCorrect}/${p.totalAnswered})`];
  if (weakStr) parts.push(weakStr);
  if (strongStr) parts.push(strongStr);
  return parts.join(' · ');
}

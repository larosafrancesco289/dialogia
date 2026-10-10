#!/usr/bin/env tsx
// `bun run tutor:evals -- summarize <batch folder>`: the judged sessions of a batch as one
// table, and one line each appended to evals/tutor/trends.jsonl (see evals/tutor/README.md).

import fs from 'node:fs/promises';
import path from 'node:path';

export const TRENDS_FILE = path.join('evals', 'tutor', 'trends.jsonl');

const SCORE_KEYS = [
  'diagnosis',
  'plan_fit',
  'mistake_identification',
  'mistake_location',
  'misconception_handling',
  'guidance',
  'actionability',
  'scaffolding_fit',
  'coherence',
  'tone',
  'language',
] as const;

type Judge = {
  judge?: string;
  scores?: Partial<Record<(typeof SCORE_KEYS)[number], number>>;
  calibration_error?: number;
  false_mastery?: number;
  missed_mastery?: number;
  answer_keys_wrong?: number;
  misconceptions?: Array<{ ended?: string; cleared_without_evidence?: boolean }>;
  verdict?: string;
};

type Transcript = {
  meta: { scenario: string; tutorModel: string; startedAt: string; exchanges: number };
  checks?: Array<{ id: string; ok: boolean }>;
  cost?: number;
  promptHash?: string;
};

export type TrendRow = {
  run: string;
  batch: string;
  persona: string;
  promptHash: string;
  tutorModel: string;
  startedAt: string;
  moves: number;
  checksFailed: string[];
  cost: number;
  judge?: string;
  scores: Partial<Record<(typeof SCORE_KEYS)[number], number>>;
  meanScore?: number;
  calibrationError?: number;
  falseMastery?: number;
  missedMastery?: number;
  answerKeysWrong?: number;
  misconceptionsGone?: string;
  verdict?: string;
};

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;

export function trendRow(run: string, batch: string, t: Transcript, j?: Judge): TrendRow {
  const scores = j?.scores ?? {};
  const values = SCORE_KEYS.map((k) => scores[k]).filter((v): v is number => typeof v === 'number');
  const ideas = j?.misconceptions ?? [];
  return {
    run,
    batch,
    persona: t.meta.scenario,
    promptHash: t.promptHash ?? 'unknown',
    tutorModel: t.meta.tutorModel,
    startedAt: t.meta.startedAt,
    moves: t.meta.exchanges,
    checksFailed: (t.checks ?? []).filter((c) => !c.ok).map((c) => c.id),
    cost: Number((t.cost ?? 0).toFixed(4)),
    ...(j?.judge ? { judge: j.judge } : {}),
    scores,
    ...(values.length ? { meanScore: Number(mean(values)!.toFixed(2)) } : {}),
    ...(typeof j?.calibration_error === 'number' ? { calibrationError: j.calibration_error } : {}),
    ...(typeof j?.false_mastery === 'number' ? { falseMastery: j.false_mastery } : {}),
    ...(typeof j?.missed_mastery === 'number' ? { missedMastery: j.missed_mastery } : {}),
    ...(typeof j?.answer_keys_wrong === 'number' ? { answerKeysWrong: j.answer_keys_wrong } : {}),
    ...(ideas.length
      ? { misconceptionsGone: `${ideas.filter((m) => m.ended === 'gone').length}/${ideas.length}` }
      : {}),
    ...(j?.verdict ? { verdict: j.verdict } : {}),
  };
}

function table(rows: TrendRow[]): string {
  const cell = (v: unknown) => (v === undefined ? '–' : String(v));
  const header = ['persona', 'moves', 'mean', 'calib', 'falseM', 'ideas', 'checks', '$'];
  const lines = rows.map((r) => [
    r.persona,
    cell(r.moves),
    cell(r.meanScore),
    cell(r.calibrationError),
    cell(r.falseMastery),
    cell(r.misconceptionsGone),
    r.checksFailed.length ? `✗ ${r.checksFailed.join(',')}` : '✓',
    r.cost.toFixed(3),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const fmt = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i])).join('  ');
  return [fmt(header), ...lines.map(fmt)].join('\n');
}

export async function summarize(batchDir: string, trendsFile = TRENDS_FILE): Promise<TrendRow[]> {
  const batch = path.basename(path.resolve(batchDir));
  const entries = await fs.readdir(batchDir, { withFileTypes: true });
  const rows: TrendRow[] = [];
  for (const entry of entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = path.join(batchDir, entry.name);
    const transcript = await readJson<Transcript>(path.join(dir, 'transcript.json'));
    if (!transcript) continue;
    rows.push(
      trendRow(dir, batch, transcript, await readJson<Judge>(path.join(dir, 'judge.json'))),
    );
  }
  const existing = (await fs.readFile(trendsFile, 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean);
  const seen = new Set(existing.map((line) => (JSON.parse(line) as TrendRow).run));
  const fresh = rows.filter((r) => r.judge && !seen.has(r.run));
  if (fresh.length) {
    await fs.mkdir(path.dirname(trendsFile), { recursive: true });
    await fs.appendFile(trendsFile, fresh.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
  return rows;
}

async function main(argv: string[]): Promise<number> {
  const [command, dir] = argv.filter((a) => !a.startsWith('--'));
  if (command !== 'summarize' || !dir) {
    console.log('Usage: bun run tutor:evals -- summarize <batch folder>');
    return 1;
  }
  const rows = await summarize(dir);
  if (!rows.length) {
    console.log(`No finished sessions in ${dir}.`);
    return 1;
  }
  const hashes = [...new Set(rows.map((r) => r.promptHash))];
  console.log(
    `Batch ${path.basename(dir)} · prompt ${hashes.join(', ')} · ${rows[0].tutorModel}\n`,
  );
  console.log(table(rows));
  const judged = rows.filter((r) => r.meanScore !== undefined);
  const avg = (pick: (r: TrendRow) => number | undefined) =>
    mean(judged.map(pick).filter((v): v is number => typeof v === 'number'))?.toFixed(2) ?? '–';
  console.log(
    `\n${judged.length}/${rows.length} judged · mean score ${avg((r) => r.meanScore)} · calibration error ${avg((r) => r.calibrationError)} · false mastery ${judged.reduce((n, r) => n + (r.falseMastery ?? 0), 0)} · spend $${rows.reduce((n, r) => n + r.cost, 0).toFixed(3)}`,
  );
  return 0;
}

if (process.argv[1]?.endsWith('evals.ts')) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}

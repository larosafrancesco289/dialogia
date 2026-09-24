// Module: tutor tooling report
// Responsibility: a simulated session as plain text a person can read in a minute: the
// exchanges, what the tutor did with its tools, where the session ended, and the checks.

import { percent } from '@/modules/tutor/engine';
import type { CheckResult } from '@/modules/tutor/tooling/check';
import type { Judgement } from '@/modules/tutor/tooling/judge';
import type {
  ExchangeRecord,
  SimulationRun,
  ToolCallRecord,
} from '@/modules/tutor/tooling/simulation';

export type ReportOptions = {
  /** Print every reply whole instead of clipping long ones. */
  full?: boolean;
  checks?: CheckResult[];
  judgement?: Judgement;
};

function clip(text: string, full: boolean, max = 420): string {
  const clean = text.trim();
  if (full || clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function callSummary(call: ToolCallRecord): string {
  const args = call.args;
  switch (call.name) {
    case 'propose_plan': {
      const topics = Array.isArray(args.topics) ? args.topics : [];
      return `${topics.length} topics: ${topics
        .map((t) => (t && typeof t === 'object' ? String((t as { name?: unknown }).name) : '?'))
        .join(' → ')}`;
    }
    case 'give_quiz':
    case 'give_diagnostic':
    case 'ask_intake': {
      const items = (Array.isArray(args.items) ? args.items : args.questions) as unknown[];
      return `${Array.isArray(items) ? items.length : 0} item(s)`;
    }
    case 'record_evidence': {
      const moved =
        call.result && typeof call.result.was === 'number'
          ? ` ${call.result.was}% → ${String(call.result.mastery)}%`
          : '';
      return `${String(args.kind)}${moved}: ${String(args.note ?? '')}`;
    }
    case 'complete_topic':
    case 'start_topic':
      return String(args.topicId ?? '(current)');
    case 'note_misconception':
      return String(args.description ?? '');
    default:
      return '';
  }
}

function callLine(call: ToolCallRecord): string {
  const mark = call.ok ? '✓' : '✗';
  const detail = callSummary(call);
  const failure =
    !call.ok && call.result
      ? ` [${call.code ?? 'error'}: ${String(call.result.message ?? '')}]`
      : '';
  return `→ ${mark} ${call.name}${detail ? ` ${detail}` : ''}${failure}`;
}

function exchangeBlock(x: ExchangeRecord, full: boolean): string {
  const lines: string[] = [];
  const who = x.student.kind === 'ledger' ? 'Student [ledger]' : 'Student';
  lines.push(`#${x.index} ${who}: ${clip(x.student.text, full, 300)}`);
  for (const a of x.student.actions) {
    lines.push(
      `     ${a.ok ? '·' : '✗'} ${a.action.type}${a.note ? ` (${a.note})` : ''}${a.error ? ` refused: ${a.error.code}` : ''}`,
    );
  }
  const rounds = x.tutor.requests.length;
  lines.push(`   Tutor (${rounds} round${rounds === 1 ? '' : 's'}):`);
  lines.push(indent(clip(x.tutor.text || '(no text)', full), '     '));
  for (const call of x.tutor.toolCalls) lines.push(`     ${callLine(call)}`);
  for (const name of x.tutor.droppedCalls) lines.push(`     → ✗ ${name} (not run)`);
  if (x.tutor.error) lines.push(`     ! turn failed: ${x.tutor.error}`);
  const after = x.after;
  const state = [
    `phase ${after.phase}`,
    after.currentTopic ? `topic ${after.currentTopic}` : undefined,
    after.awaiting ? `open ${after.awaiting.kind}` : undefined,
    after.topicsTotal ? `${after.topicsDone}/${after.topicsTotal} done` : undefined,
  ].filter(Boolean);
  lines.push(`   ⇢ ${state.join(' · ')}`);
  for (const edit of x.quietEdits) {
    lines.push(
      `   quiet edit: ${edit.action.type} ${'nodeId' in edit.action ? edit.action.nodeId : ''}${edit.ok ? '' : ' (refused)'}`,
    );
  }
  return lines.join('\n');
}

function totals(run: SimulationRun) {
  let prompt = 0;
  let completion = 0;
  let cost = 0;
  let calls = 0;
  let failed = 0;
  for (const x of run.exchanges) {
    prompt += x.tutor.usage?.promptTokens ?? 0;
    completion += x.tutor.usage?.completionTokens ?? 0;
    cost += x.tutor.usage?.cost ?? 0;
    calls += x.tutor.toolCalls.length;
    failed += x.tutor.toolCalls.filter((c) => !c.ok).length;
  }
  return { prompt, completion, cost, calls, failed };
}

export function renderReport(run: SimulationRun, options: ReportOptions = {}): string {
  const { meta, state } = run;
  const full = !!options.full;
  const flags = [
    meta.flags.planEditable ? 'plan editable' : 'plan fixed',
    meta.flags.learnerModelVisible ? 'model visible' : 'model hidden',
    meta.flags.learnerModelEditable ? 'model editable' : 'model read-only',
    meta.learnerEdits ? 'quiet learner edits on' : undefined,
  ].filter(Boolean);
  const sum = totals(run);
  const out: string[] = [];
  out.push(`Tutor simulation: ${meta.title} (${meta.scenario})`);
  out.push(`Tutor ${meta.tutorModel} · student ${meta.studentModel} · seed ${meta.seed}`);
  out.push(`Conditions: ${flags.join(', ')}`);
  out.push(
    `${meta.exchanges} exchanges in ${Math.round(meta.durationMs / 1000)}s · ${sum.calls} tool calls (${sum.failed} failed) · tutor tokens ${sum.prompt} in / ${sum.completion} out${sum.cost ? ` · $${sum.cost.toFixed(4)}` : ''}`,
  );
  out.push('');
  for (const x of run.exchanges) {
    out.push(exchangeBlock(x, full));
    out.push('');
  }

  out.push('Where it ended');
  out.push(
    `  Phase: ${state.phase}${state.currentNodeId ? ` · current topic ${state.currentNodeId}` : ''}`,
  );
  if (state.plan) {
    out.push(`  Plan: ${state.plan.goal}`);
    for (const node of state.plan.nodes) {
      const m = state.mastery[node.id];
      const misconceptions = m?.misconceptions.filter((x) => !x.resolved).length ?? 0;
      out.push(
        `   - ${node.name} [${node.id}]: ${node.status}${node.completedHow ? ` (${node.completedHow})` : ''}, ${percent(m?.confidence ?? 0)}%${misconceptions ? `, ${misconceptions} open misconception(s)` : ''}`,
      );
    }
  } else {
    out.push('  No plan was approved.');
  }
  const rates = Object.entries(meta.errorRates)
    .map(([topic, rate]) => `${topic} ${Math.round(rate * 100)}%`)
    .join(', ');
  if (rates) out.push(`  Student error rates now: ${rates}`);

  if (options.checks) {
    const failed = options.checks.filter((c) => !c.ok);
    out.push('');
    out.push(`Checks: ${options.checks.length - failed.length} of ${options.checks.length} passed`);
    for (const check of options.checks) {
      const mark = check.skipped ? '–' : check.ok ? '✓' : '✗';
      out.push(`  ${mark} ${check.id}: ${check.summary}`);
      for (const problem of check.problems) out.push(`      ${problem}`);
    }
  }

  if (options.judgement) {
    const j = options.judgement;
    out.push('');
    out.push(`Judge: ${j.score ?? '?'}/5. ${j.verdict}`);
    for (const s of j.strengths) out.push(`  + ${s}`);
    for (const s of j.improvements) out.push(`  - ${s}`);
  }
  return out.join('\n');
}

/** The session as a plain transcript, for the judge. */
export function renderTranscript(run: SimulationRun): string {
  return run.exchanges
    .map((x) => {
      const student = x.student.kind === 'ledger' ? `[${x.student.text}]` : x.student.text;
      const calls = x.tutor.toolCalls
        .map((c) => `  (${c.ok ? '' : 'failed '}${c.name})`)
        .join('\n');
      return `Student: ${student}\nTutor: ${x.tutor.text}${calls ? `\n${calls}` : ''}`;
    })
    .join('\n\n');
}

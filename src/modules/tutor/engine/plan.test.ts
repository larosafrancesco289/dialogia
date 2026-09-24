import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, nextReadyNode, planProblems, slugify } from '@/modules/tutor/engine';
import { CALCULUS } from '@/modules/tutor/engine/testSupport';

test('slugify makes readable ids', () => {
  assert.equal(slugify('Chain Rule (composites)'), 'chain-rule-composites');
  assert.equal(slugify('Élan vital'), 'elan-vital');
  assert.equal(slugify('!!!'), 'topic');
  assert.equal(slugify('x'.repeat(60)).length, 40);
});

test('a first plan keeps given ids, slugs the rest, and resolves prerequisites by name', () => {
  const built = buildPlan(CALCULUS, undefined, 5);
  assert.ok(built.ok);
  assert.deepEqual(
    built.plan.nodes.map((n) => n.id),
    ['limits', 'derivatives', 'chain-rule'],
  );
  assert.deepEqual(built.plan.nodes[2].prerequisites, ['derivatives']);
  assert.equal(built.plan.version, 1);
  assert.equal(built.plan.generatedAt, 5);
  assert.ok(built.plan.nodes.every((n) => n.status === 'not_started'));
});

test('a revision keeps reused ids, matches unnamed topics by name, and never reuses a removed id', () => {
  const first = buildPlan(CALCULUS, undefined, 1);
  assert.ok(first.ok);
  const current = {
    ...first.plan,
    nodes: first.plan.nodes.map((n) =>
      n.id === 'limits'
        ? { ...n, status: 'completed' as const, completedHow: 'mastered' as const }
        : n,
    ),
  };
  const revised = buildPlan(
    {
      goal: 'Differentiate anything',
      nodes: [
        { id: 'LIMITS', name: 'Limits again', objectives: ['Evaluate limits'] },
        { name: 'Chain rule', objectives: ['Compose'], prerequisites: ['limits'] },
        { id: 'derivatives', name: 'Implicit differentiation', objectives: ['Implicit'] },
      ],
    },
    current,
    9,
  );
  assert.ok(revised.ok);
  const [limits, chain, implicit] = revised.plan.nodes;
  assert.equal(limits.id, 'limits');
  assert.equal(limits.status, 'completed', 'the proposal shows carried-over completion');
  assert.equal(chain.id, 'chain-rule', 'matched by name');
  assert.equal(implicit.id, 'derivatives', 'a reused id is kept even under a new name');
  assert.equal(revised.plan.version, 2);
  assert.equal(revised.plan.generatedAt, 1);
  assert.deepEqual(revised.kept, ['limits', 'chain-rule', 'derivatives']);
  assert.deepEqual(revised.added, []);

  const replaced = buildPlan(
    { goal: 'g', nodes: [{ name: 'Derivatives', id: 'brand-new', objectives: ['x'] }] },
    current,
    9,
  );
  assert.ok(replaced.ok);
  assert.equal(replaced.plan.nodes[0].id, 'brand-new');
  assert.deepEqual(replaced.removed.sort(), ['chain-rule', 'derivatives', 'limits']);

  const collides = buildPlan(
    {
      goal: 'g',
      nodes: [
        { id: 'fresh', name: 'Limits', objectives: ['x'] },
        { name: 'Limits', objectives: ['y'] },
      ],
    },
    current,
    9,
  );
  assert.ok(collides.ok);
  assert.deepEqual(
    collides.plan.nodes.map((n) => n.id),
    ['fresh', 'limits'],
  );
});

test('new topics never take the id of a topic the revision drops', () => {
  const first = buildPlan(
    { goal: 'g', nodes: [{ id: 'a', name: 'A', objectives: ['x'] }] },
    undefined,
    1,
  );
  assert.ok(first.ok);
  const next = buildPlan(
    {
      goal: 'g',
      nodes: [
        { id: 'b', name: 'B', objectives: ['x'] },
        { name: 'a', id: 'a!', objectives: ['y'] },
      ],
    },
    first.plan,
    2,
  );
  assert.ok(next.ok);
  assert.deepEqual(
    next.plan.nodes.map((n) => n.id),
    ['b', 'a-2'],
  );
});

test('structural problems are reported, not repaired', () => {
  const problems = (nodes: Parameters<typeof buildPlan>[0]['nodes']) => {
    const built = buildPlan({ goal: 'g', nodes }, undefined, 1);
    assert.equal(built.ok, false);
    return (built as { problems: string[] }).problems.join(' ');
  };
  assert.match(problems([]), /1 to 20 topics/);
  assert.match(
    problems(Array.from({ length: 21 }, (_, i) => ({ name: `T${i}`, objectives: ['x'] }))),
    /1 to 20 topics/,
  );
  assert.match(
    problems([{ id: 'a', name: 'A', objectives: ['x'], prerequisites: ['a'] }]),
    /itself/,
  );
  assert.match(
    problems([{ id: 'a', name: 'A', objectives: ['x'], prerequisites: ['zzz'] }]),
    /"zzz"/,
  );
  assert.match(
    problems([
      { id: 'a', name: 'A', objectives: ['x'], prerequisites: ['b'] },
      { id: 'b', name: 'B', objectives: ['x'], prerequisites: ['a'] },
    ]),
    /cycle: a -> b -> a/,
  );
  assert.match(
    problems([
      { id: 'a', name: 'A', objectives: ['x'] },
      { id: 'a', name: 'B', objectives: ['x'] },
    ]),
    /share the id "a"/,
  );
  assert.match(problems([{ id: 'a', name: 'A', objectives: [] }]), /objectives/);
  assert.deepEqual(
    planProblems([{ id: 'a', name: 'A', objectives: ['x'], prerequisites: [] }]),
    [],
  );
});

test('the next ready topic follows plan order and prerequisites', () => {
  const built = buildPlan(CALCULUS, undefined, 1);
  assert.ok(built.ok);
  assert.equal(nextReadyNode(built.plan)?.id, 'limits');
  const afterLimits = {
    ...built.plan,
    nodes: built.plan.nodes.map((n) =>
      n.id === 'limits' ? { ...n, status: 'completed' as const } : n,
    ),
  };
  assert.equal(nextReadyNode(afterLimits)?.id, 'derivatives');
});

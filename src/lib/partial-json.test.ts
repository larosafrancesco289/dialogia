import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePartialJson } from './partial-json';

describe('parsePartialJson', () => {
  it('parses valid JSON', () => {
    assert.deepEqual(parsePartialJson('{"a": 1}'), { a: 1 });
    assert.deepEqual(parsePartialJson('[1, 2, 3]'), [1, 2, 3]);
  });

  it('parses partial objects', () => {
    assert.deepEqual(parsePartialJson('{"a": 1'), { a: 1 });
    // {"a": is ambiguous, null is acceptable
    assert.deepEqual(parsePartialJson('{"a":'), {});
    assert.deepEqual(parsePartialJson('{"a": 1, "b":'), { a: 1 });
  });

  it('parses partial arrays', () => {
    assert.deepEqual(parsePartialJson('[1, 2'), [1, 2]);
    assert.deepEqual(parsePartialJson('[1, 2,'), [1, 2]);
  });

  it('parses nested structures', () => {
    assert.deepEqual(parsePartialJson('{"a": [1, 2'), { a: [1, 2] });
    assert.deepEqual(parsePartialJson('{"a": {"b": 1'), { a: { b: 1 } });
  });

  it('parses partial strings', () => {
    assert.deepEqual(parsePartialJson('{"a": "hello'), { a: 'hello' });
  });

  it('parses DeepResearch trace scenario', () => {
    const input = '{"type": "search", "input": {"query": "foo"}, "output":';
    // We expect it to strip the "output": part
    assert.deepEqual(parsePartialJson(input), { type: 'search', input: { query: 'foo' } });
  });

  it('parses streaming final answer', () => {
    const base = '[{"type":"thought","output":"Final Answer: This is a long answer that is stre';
    const parsed = parsePartialJson(base);
    assert.equal(parsed?.length, 1);
    assert.equal(parsed?.[0].output, 'Final Answer: This is a long answer that is stre');
  });

  it('parses string ending with backslash', () => {
    const base = '[{"type":"thought","output":"This ends with backslash \\';
    const parsed = parsePartialJson(base);
    assert.equal(parsed?.length, 1);
    // We expect the backslash to be removed
    assert.equal(parsed?.[0].output, 'This ends with backslash ');
  });

  it('parses string ending with double backslash', () => {
    const base = '[{"type":"thought","output":"This ends with double backslash \\\\';
    const parsed = parsePartialJson(base);
    assert.equal(parsed?.length, 1);
    // We expect the double backslash to be preserved (as a single backslash in the parsed string)
    assert.equal(parsed?.[0].output, 'This ends with double backslash \\');
  });

  it('simulates streaming final answer char by char', () => {
    const full = 'Final Answer: The result is 42';
    for (let i = 1; i <= full.length; i++) {
      const partial = full.slice(0, i);
      // Simulate the JSON structure being built
      const json = `[{"type":"thought","output":"${partial}`;
      const parsed = parsePartialJson(json);
      assert.equal(parsed?.length, 1);
      assert.equal(parsed?.[0].output, partial);
    }
  });
});

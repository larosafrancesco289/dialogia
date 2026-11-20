import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { texToWords, type MathWords } from '@/lib/speech/tex';

const EN: MathWords = {
  over: 'over',
  squared: 'squared',
  cubed: 'cubed',
  toThePowerOf: 'to the power of',
  squareRootOf: 'square root of',
  cubeRootOf: 'cube root of',
  nthRootOf: '{index}th root of',
  times: 'times',
  dividedBy: 'divided by',
  plus: 'plus',
  minus: 'minus',
  plusOrMinus: 'plus or minus',
  equals: 'equals',
  notEqual: 'is not equal to',
  lessThan: 'is less than',
  greaterThan: 'is greater than',
  lessOrEqual: 'is less than or equal to',
  greaterOrEqual: 'is greater than or equal to',
  approximately: 'is approximately',
  infinity: 'infinity',
  degrees: 'degrees',
};

describe('texToWords', () => {
  it('reads fractions, powers, degrees, and subscripts', () => {
    assert.equal(texToWords('\\frac{a + b}{c}', EN), 'a plus b over c');
    assert.equal(
      texToWords('x^2 + y^3 = z^{n+1}', EN),
      'x squared plus y cubed equals z to the power of n plus 1',
    );
    assert.equal(texToWords('90^\\circ', EN), '90 degrees');
    assert.equal(texToWords('x_0 + x_{i+1}', EN), 'x 0 plus x i plus 1');
  });

  it('reads square, cube, and nth roots including spaced optional brackets', () => {
    assert.equal(texToWords('\\sqrt{x}', EN), 'square root of x');
    assert.equal(texToWords('\\sqrt[3]{27}', EN), 'cube root of 27');
    assert.equal(texToWords('\\sqrt [4]{16}', EN), '4th root of 16');
  });

  it('reads Greek letters as names or as Greek characters depending on mode', () => {
    assert.equal(texToWords('\\alpha + \\pi \\approx 3.14', EN, 'names'), 'alpha plus pi is approximately 3.14');
    assert.equal(texToWords('\\alpha + \\pi = \\Delta', EN, 'letters'), 'α plus π equals Δ');
  });

  it('handles relations, operators, environments, text commands, and style commands', () => {
    assert.equal(
      texToWords('\\begin{aligned} a \\leq b \\neq \\infty \\end{aligned}', EN),
      'a is less than or equal to b is not equal to infinity',
    );
    assert.equal(texToWords('\\mathbf{v} \\cdot \\text{km/h}', EN), 'v times km/h');
    assert.equal(texToWords('\\left(x \\pm 1\\right)', EN), '(x plus or minus 1)');
  });

  it('survives unclosed braces and trailing operators gracefully', () => {
    assert.equal(texToWords('\\frac{a + 1', EN), 'a plus 1 over');
    assert.equal(texToWords('x^', EN), 'x to the power of');
  });
});

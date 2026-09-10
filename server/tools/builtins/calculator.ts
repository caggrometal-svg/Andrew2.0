import { assertToolInput, registerTool } from '../tool-registry';
import type { ToolDefinition } from '../tool-types';

type CalculatorInput = Readonly<{ expression: string }>;

function evaluate(expression: string): number {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/%]/g);
  if (tokens === null || tokens.join('') !== expression.replace(/\s+/g, '')) {
    throw new Error('CALCULATOR_EXPRESSION_NOT_ALLOWED');
  }

  const values: number[] = [];
  const operators: string[] = [];
  const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };
  let expectValue = true;

  const apply = (): void => {
    const op = operators.pop();
    if (op === undefined || op === '(') throw new Error('CALCULATOR_INVALID_EXPRESSION');
    const right = values.pop();
    const left = values.pop();
    if (left === undefined || right === undefined) throw new Error('CALCULATOR_INVALID_EXPRESSION');
    if ((op === '/' || op === '%') && right === 0) throw new Error('CALCULATOR_DIVISION_BY_ZERO');
    const result = op === '+' ? left + right : op === '-' ? left - right : op === '*' ? left * right : op === '/' ? left / right : left % right;
    if (!Number.isFinite(result)) throw new Error('CALCULATOR_INVALID_RESULT');
    values.push(result);
  };

  for (const token of tokens) {
    if (/^\d/.test(token)) {
      if (!expectValue) throw new Error('CALCULATOR_INVALID_EXPRESSION');
      values.push(Number(token));
      expectValue = false;
    } else if (token === '(') {
      if (!expectValue) throw new Error('CALCULATOR_INVALID_EXPRESSION');
      operators.push(token);
    } else if (token === ')') {
      if (expectValue) throw new Error('CALCULATOR_INVALID_EXPRESSION');
      while (operators.at(-1) !== '(') {
        if (operators.length === 0) throw new Error('CALCULATOR_INVALID_EXPRESSION');
        apply();
      }
      operators.pop();
    } else {
      if (expectValue) {
        if (token !== '-') throw new Error('CALCULATOR_INVALID_EXPRESSION');
        values.push(0);
      }
      while (operators.length > 0 && operators.at(-1) !== '(' && precedence[operators.at(-1)!] >= precedence[token]) apply();
      operators.push(token);
      expectValue = true;
    }
  }

  if (expectValue) throw new Error('CALCULATOR_INVALID_EXPRESSION');
  while (operators.length > 0) {
    if (operators.at(-1) === '(') throw new Error('CALCULATOR_INVALID_EXPRESSION');
    apply();
  }
  const result = values[0];
  if (values.length !== 1 || result === undefined || !Number.isFinite(result)) throw new Error('CALCULATOR_INVALID_RESULT');
  return result;
}

const calculator: ToolDefinition<CalculatorInput> = {
  name: 'calculator',
  description: 'Evaluates restricted arithmetic without dynamic code execution.',
  risk: 'read',
  validate: (input) => {
    assertToolInput(input);
    if (typeof input.expression !== 'string' || input.expression.trim().length === 0) throw new Error('CALCULATOR_INVALID_EXPRESSION');
  },
  execute: async (input) => ({ ok: true, data: { value: evaluate(input.expression.replace(/\s+/g, '')) } }),
};

export function registerCalculatorTool(): void { registerTool(calculator); }
export { calculator };

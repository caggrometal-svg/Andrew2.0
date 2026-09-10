import { assertToolInput, registerTool } from '../tool-registry';
import type { ToolDefinition } from '../tool-types';

type CalculatorInput = Readonly<{ expression: string }>;

const calculator: ToolDefinition<CalculatorInput> = {
  name: 'calculator',
  description: 'Evaluates a restricted arithmetic expression without code execution.',
  risk: 'read',
  validate: (input) => {
    assertToolInput(input);
    if (typeof input.expression !== 'string' || input.expression.trim().length === 0) {
      throw new Error('CALCULATOR_INVALID_EXPRESSION');
    }
    if (!/^[0-9+\-*/().%\s]+$/.test(input.expression)) {
      throw new Error('CALCULATOR_EXPRESSION_NOT_ALLOWED');
    }
  },
  execute: async (input) => {
    const expression = input.expression.trim();
    const value = Function(`"use strict"; return (${expression});`)();
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, error: 'CALCULATOR_INVALID_RESULT' };
    }
    return { ok: true, data: { value } };
  },
};

export function registerCalculatorTool(): void {
  registerTool(calculator);
}

export { calculator };

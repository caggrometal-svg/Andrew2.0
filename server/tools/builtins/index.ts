import { registerCalculatorTool } from './calculator.ts';
import { registerMemoryTool } from './memory.ts';
import { registerMediaTool } from './media.ts';

export function registerBuiltinTools(): void {
  registerCalculatorTool();
  registerMemoryTool();
  registerMediaTool();
}

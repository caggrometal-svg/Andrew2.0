import { registerCalculatorTool } from './calculator';
import { registerMemoryTool } from './memory';
import { registerMediaTool } from './media';

export function registerBuiltinTools(): void {
  registerCalculatorTool();
  registerMemoryTool();
  registerMediaTool();
}

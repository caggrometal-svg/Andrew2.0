import type { ToolDefinition } from './tool-types';

export type JsonPrimitive = string | number | boolean | null;

export interface JsonSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, JsonSchemaProperty>>;
  readonly required?: ReadonlyArray<string>;
  readonly additionalProperties: false;
}

export interface JsonSchemaProperty {
  readonly type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  readonly description?: string;
  readonly enum?: ReadonlyArray<JsonPrimitive>;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly items?: JsonSchemaProperty;
}

export interface OpenAIToolDeclaration {
  readonly type: 'function';
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchema;
  readonly strict: true;
}

export type ToolSchemaProvider = (toolName: string) => JsonSchema | undefined;

const SAFE_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
const SAFE_DESCRIPTION = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;

const isSafeProperty = (property: JsonSchemaProperty): boolean => {
  if (!property || typeof property !== 'object') return false;
  if (!['string', 'number', 'integer', 'boolean', 'array', 'object'].includes(property.type)) return false;
  if (property.description !== undefined && (!SAFE_DESCRIPTION.test(property.description) || property.description.length > 2048)) return false;
  if (property.enum !== undefined && !property.enum.every((value) => value === null || ['string', 'number', 'boolean'].includes(typeof value))) return false;
  if (property.minimum !== undefined && !Number.isFinite(property.minimum)) return false;
  if (property.maximum !== undefined && !Number.isFinite(property.maximum)) return false;
  if (property.items !== undefined && !isSafeProperty(property.items)) return false;
  return true;
};

const assertSafeSchema = (schema: JsonSchema): void => {
  if (schema.type !== 'object' || schema.additionalProperties !== false) throw new Error('unsafe_tool_schema');
  const properties = schema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new Error('unsafe_tool_schema');
  const propertyNames = Object.keys(properties);
  if (propertyNames.some((name) => !SAFE_NAME.test(name))) throw new Error('unsafe_tool_schema');
  if (!propertyNames.every((name) => isSafeProperty(properties[name]))) throw new Error('unsafe_tool_schema');
  if (schema.required !== undefined && !schema.required.every((name) => propertyNames.includes(name))) throw new Error('unsafe_tool_schema');
};

export class LlmToolAdapter {
  constructor(private readonly schemaProvider: ToolSchemaProvider) {}

  toOpenAITools(tools: ReadonlyArray<ToolDefinition<unknown>>): ReadonlyArray<OpenAIToolDeclaration> {
    return tools.map((tool) => this.toOpenAITool(tool));
  }

  toOpenAITool(tool: ToolDefinition<unknown>): OpenAIToolDeclaration {
    if (!SAFE_NAME.test(tool.name)) throw new Error(`unsafe_tool_name:${tool.name}`);
    if (!SAFE_DESCRIPTION.test(tool.description) || tool.description.length > 4096) throw new Error(`unsafe_tool_description:${tool.name}`);

    const parameters = this.schemaProvider(tool.name);
    if (!parameters) throw new Error(`missing_tool_schema:${tool.name}`);
    assertSafeSchema(parameters);

    return {
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters,
      strict: true,
    };
  }
}

export const parseAndValidateToolArguments = <TArgs>(rawArguments: string, tool: ToolDefinition<TArgs>): TArgs => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments) as unknown;
  } catch {
    throw new Error('invalid_tool_arguments_json');
  }
  if (!tool.validate(parsed)) throw new Error('invalid_tool_arguments');
  return parsed;
};

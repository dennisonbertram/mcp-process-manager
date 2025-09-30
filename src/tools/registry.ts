import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { nanoid } from 'nanoid';
import { logToolAction } from '../utils/actionLogger.js';

interface Tool {
  name: string;
  description: string;
  schema: z.ZodSchema;
  handler: (args: any) => Promise<{ content: Array<{ type: string, text: string }>, isError?: boolean }>;
}

const registeredTools: Tool[] = [];

export function registerTool(tool: Tool): void {
  registeredTools.push(tool);
}

export function getToolsList(): Array<{
  name: string;
  description: string;
  inputSchema: any;
}> {
  return registeredTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.schema)
  }));
}

export async function callTool(name: string, args: any): Promise<{ content: Array<{ type: string, text: string }>, isError?: boolean }> {
  const tool = registeredTools.find(t => t.name === name);
  if (!tool) {
    return {
      content: [{ type: 'text', text: `Tool '${name}' not found` }],
      isError: true
    };
  }

  const requestId = nanoid(8);
  const timestamp = new Date().toISOString();

  try {
    const validatedArgs = tool.schema.parse(args);
    const result = await tool.handler(validatedArgs);

    // Concatenate text outputs for logging only (does not affect response)
    const outputText = (result.content || [])
      .filter(c => c && typeof c.text === 'string')
      .map(c => c.text)
      .join('\n\n');

    // Log success
    logToolAction({
      requestId,
      tool: name,
      timestamp,
      args: validatedArgs,
      isError: !!result.isError,
      outputText: outputText || undefined,
    });

    return result;
  } catch (error) {
    // Log error – include stack if available
    const errText = error instanceof Error ? `${error.message}\n\n${error.stack || ''}` : String(error);
    logToolAction({
      requestId,
      tool: name,
      timestamp,
      args,
      isError: true,
      errorText: errText,
    });

    // Return standardized error without leaking internals in response
    return {
      content: [{ type: 'text', text: `Failed to execute tool '${name}': ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

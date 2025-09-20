import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

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

  try {
    const validatedArgs = tool.schema.parse(args);
    return await tool.handler(validatedArgs);
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Invalid arguments for tool '${name}': ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}
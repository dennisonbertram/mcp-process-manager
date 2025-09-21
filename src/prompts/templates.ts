import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import winston from 'winston';

export function registerTemplatePrompts(server: Server, _logger: winston.Logger) {
  server.setRequestHandler({ method: 'prompts/list' } as any, async () => {
    // Defer to existing prompt provider; this file focuses on template prompts in future
    return { prompts: [] };
  });
}

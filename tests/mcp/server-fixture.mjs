import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createMcpServer } from '../../src/mcp/server.mjs';
import { fixture } from '../helpers/fixture.mjs';
const f=fixture();const server=createMcpServer({service:f.service,getPrincipal:()=>f.principal,config:f.config,widgetHtml:'<!doctype html><html><body>Protocol fixture; not a production UI.</body></html>'});
await server.connect(new StdioServerTransport());
process.stdin.on('end',()=>server.close());

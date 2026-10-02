import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createMcpServer, connectServer } from '../../src/mcp/server.mjs';
import { fixture } from '../helpers/fixture.mjs';
const f=await fixture();const server=createMcpServer({service:f.service,getPrincipal:()=>f.principal,config:f.config,widgetHtml:'<!doctype html><html><body>Protocol fixture; not a production UI.</body></html>'});
await connectServer(server,new StdioServerTransport());
process.stdin.on('end',()=>server.close());

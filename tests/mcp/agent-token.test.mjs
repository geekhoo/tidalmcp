import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { fixture } from '../helpers/fixture.mjs';
import { AgentTokens } from '../../src/core/agent-tokens.mjs';
import { makeHttpHandler } from '../../src/core/http.mjs';
import { webExchange } from '../../src/core/web-adapter.mjs';
import { makeWebMcpHandler } from '../../src/mcp/web-handler.mjs';

test('official MCP client uses an operator-issued agent bearer token through the shared web boundary', async t => {
  const f = await fixture({config:{enableAgentTokens:true}});
  const tokens = new AgentTokens(f), issued = await tokens.create({grantId:f.principal.grantId,name:'SDK agent',scopes:['tidal:read']});
  const handle = makeHttpHandler({...f,mcpHandler:makeWebMcpHandler({service:f.service,widgetHtml:'<!doctype html><title>Fixture</title>',config:f.config})});
  const transport = new StreamableHTTPClientTransport(new URL(f.config.resource),{
    requestInit:{headers:{Authorization:'Bearer ' + issued.token,host:new URL(f.config.origin).host}},
    fetch:async(input,init) => {const exchange = webExchange(new Request(input,init));await handle(exchange.req,exchange.res);return exchange.response();}
  });
  const client = new Client({name:'agent-token-test',version:'1.0.0'}); t.after(() => client.close());
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length,12);
  const status = await client.callTool({name:'tidal_auth_status',arguments:{}});
  assert.equal(status.structuredContent.data.connected,true);
  assert.deepEqual(status.structuredContent.data.mcpScopes,['tidal:read']);
  const search = await client.callTool({name:'tidal_search',arguments:{query:'night',kind:'tracks'}});
  assert.equal(search.structuredContent.ok,true);
  await tokens.revoke(issued.id);
  await assert.rejects(client.listTools());
  assert.equal(f.fake.mutations,0);
});

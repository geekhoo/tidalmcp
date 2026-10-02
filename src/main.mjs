#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { makeRuntime } from './runtime.mjs';
import { httpServer } from './core/http.mjs';
import { publicError } from './core/util.mjs';
let runtime;
try {
  const [{createMcpServer,connectServer},{sdkSend}]=await Promise.all([import('./mcp/server.mjs'),import('./adapters/tidal-sdk.mjs')]);
  runtime=await makeRuntime({send:sdkSend});
  const widgetHtml=await readFile(new URL('../dist/widget.html',import.meta.url),'utf8');
  if(process.argv.includes('--stdio')) {
    const {StdioServerTransport}=await import('@modelcontextprotocol/server/stdio');
    const server=createMcpServer({service:runtime.service,getPrincipal:runtime.localPrincipal,local:true,widgetHtml,config:runtime.config});
    await connectServer(server,new StdioServerTransport());
    process.stdin.on('end',()=>{server.close().finally(()=>runtime.close());});
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close().finally(()=>{runtime.close();process.exit(0);});});
  } else {
    const {NodeStreamableHTTPServerTransport}=await import('@modelcontextprotocol/node');
    const mcpHandler=async(req,res,body,principal)=>{
      const server=createMcpServer({service:runtime.service,getPrincipal:()=>principal,widgetHtml,config:runtime.config});
      const transport=new NodeStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
      req.auth={token:req.headers.authorization.slice(7),clientId:principal.clientId,scopes:principal.scopes,expiresAt:principal.expiresAt,extra:{sub:principal.subject,grantId:principal.grantId}};
      let closed=false;const close=()=>{if(!closed){closed=true;void server.close();}};res.once('close',close);
      try{await server.connect(transport);await transport.handleRequest(req,res,body);}catch(error){close();throw error;}
    };
    const server=httpServer({...runtime,mcpHandler});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(runtime.config.port,runtime.config.host,resolve);});
    console.error(`TIDAL MCP listening at ${runtime.config.resource}. No credentials are logged.`);
    const maintenance=setInterval(async()=>{try{await runtime.broker.prune();}catch{console.error('State maintenance failed; investigate storage health.');}},60000);maintenance.unref();
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{clearInterval(maintenance);server.close(()=>{runtime.close();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();});
  }
}catch(error){
  runtime?.close();
  if(error.code==='ERR_MODULE_NOT_FOUND')console.error('Dependencies are not installed. Run npm install, then npm run build.');
  else if(error.code==='ENOENT')console.error('A required file is missing. Run npm run build and check DATA_DIR.');
  else console.error(JSON.stringify(publicError(error)));
  process.exitCode=1;
}

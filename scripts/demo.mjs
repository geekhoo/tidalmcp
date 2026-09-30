import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture } from '../tests/helpers/fixture.mjs';
import { requestBody, sendJson } from '../src/core/http.mjs';
export async function startDemo(port=3010) {
  const runtime=fixture(),assets={'/':['web/index.html','text/html'],'/ui.mjs':['web/ui.mjs','text/javascript'],'/demo-adapter.mjs':['web/demo-adapter.mjs','text/javascript'],'/style.css':['web/style.css','text/css'],'/tokens.css':['web/tokens.css','text/css']};
  const server=createServer(async(req,res)=>{
    try {
      const expected=`127.0.0.1:${server.address().port}`,origin=`http://${expected}`;
      res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://resources.tidal.com https://images.tidal.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
      if(req.headers.host!==expected||req.headers.origin&&req.headers.origin!==origin)return sendJson(res,403,{ok:false,error:{message:'Host or origin not allowed.'}});
      const url=new URL(req.url,origin);
      if(url.pathname==='/demo/tools'&&req.method==='POST'){
        if(!req.headers['content-type']?.startsWith('application/json'))return sendJson(res,415,{ok:false,error:{message:'JSON required.'}});
        const body=JSON.parse(await requestBody(req));return sendJson(res,200,await runtime.service.invoke(body.name,body.arguments,runtime.principal));
      }
      const asset=assets[url.pathname];if(asset&&req.method==='GET'){res.writeHead(200,{'Content-Type':asset[1]+'; charset=utf-8'});res.end(await readFile(new URL('../'+asset[0],import.meta.url)));return;}
      if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
      sendJson(res,404,{error:'not_found'});
    }catch{sendJson(res,400,{ok:false,error:{message:'Invalid demo request.'}});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {server,runtime,url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const demo=await startDemo(Number(process.env.DEMO_PORT||3010));console.log(`Fictional-data demo: ${demo.url}. No TIDAL credentials or external API calls.`);for(const s of ['SIGINT','SIGTERM'])process.once(s,()=>demo.close().then(()=>process.exit(0)));}

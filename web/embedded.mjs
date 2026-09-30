import { App } from '@modelcontextprotocol/ext-apps';
import { createView } from './ui.mjs';
const app=new App({name:'tidal-music-workspace',version:'1.0.0'});
const adapter={
  call:(name,args)=>app.callServerTool({name,arguments:args}),
  open:url=>app.openLink({url}),
  expand:async()=>{try{const result=await app.requestDisplayMode({mode:'fullscreen'});return result.mode==='fullscreen';}catch{return false;}}
};
const view=createView(document.getElementById('app'),adapter);
// Register handlers BEFORE initialization so the first tool result cannot be missed.
app.ontoolresult=result=>view.receive(result);
app.ontoolinput=input=>view.input(input);
app.onhostcontextchanged=context=>view.context(context);
app.onerror=()=>{const n=document.getElementById('message');n.textContent='The host connection was interrupted. Reopen the app or continue through the conversation.';n.hidden=false;n.className='message error';};
try{await app.connect();view.context(app.getHostContext());}catch{const n=document.getElementById('message');n.textContent='This UI needs an MCP Apps-compatible host. The same tools remain available without UI.';n.hidden=false;n.className='message error';}

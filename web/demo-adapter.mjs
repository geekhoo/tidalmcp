import { createView } from './ui.mjs';
const view=createView(document.getElementById('app'),{
  async call(name,args){const response=await fetch('/demo/tools',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,arguments:args})});return response.json();},
  async open(){throw new Error('This is a fictional demo item; no live TIDAL link will be opened.');},
  async expand(){return true;}
},{demo:true,view:'full'});
await view.start();

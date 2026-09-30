import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generateTokens } from './tokens.mjs';
import { sha256 } from '../src/core/util.mjs';
generateTokens();
let build;try{({build}=await import('esbuild'));}catch{console.error('esbuild is not installed. Run npm install before building the production MCP Apps resource.');process.exit(1);}
const root=new URL('../',import.meta.url);
const result=await build({entryPoints:[fileURLToPath(new URL('web/embedded.mjs',root))],bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,minify:true,legalComments:'eof',metafile:true});
const js=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'),css=(await fs.readFile(new URL('web/tokens.css',root),'utf8'))+'\n'+await fs.readFile(new URL('web/style.css',root),'utf8');
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TIDAL music workspace</title><style>${css}</style></head><body><div id="app"></div><script type="module">${js}</script></body></html>`;
await fs.mkdir(new URL('dist/',root),{recursive:true});await fs.writeFile(new URL('dist/widget.html',root),html);await fs.writeFile(new URL('dist/build-manifest.json',root),JSON.stringify({sha256:sha256(html),resourceUri:`ui://tidal/explorer-${sha256(html).slice(0,12)}.html`,bytes:Buffer.byteLength(html),inputs:Object.keys(result.metafile.inputs)},null,2));
console.log(`Built a self-contained ${Buffer.byteLength(html)}-byte MCP Apps resource. No remote JavaScript or fonts.`);

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveTokens, flattenTokens, cssName } from '../../scripts/tokens.mjs';
import { sha256 } from '../../src/core/util.mjs';
test('semantic aliases and bezier arrays resolve without framework dependencies',()=>{assert.deepEqual(resolveTokens({'a':'#fff','b':'{a}','c':[.2,0,0,1]}),{a:'#fff',b:'#fff',c:'cubic-bezier(0.2, 0, 0, 1)'});assert.equal(cssName('semantic.color.textPrimary'),'--semantic-color-text-primary');});
test('cyclic or missing design aliases fail instead of producing invalid CSS',()=>{assert.throws(()=>resolveTokens({a:'{b}',b:'{a}'}));assert.throws(()=>resolveTokens({a:'{missing}'}));});
test('all 155 supplied production tokens retain source hashes and resolve',()=>{const manifest=JSON.parse(fs.readFileSync(new URL('../../audit/design-token-map.json',import.meta.url)));assert.equal(manifest.count,155);const raw={};for(const source of manifest.sources){const text=fs.readFileSync(new URL('../../'+source.path,import.meta.url),'utf8');assert.equal(sha256(text),source.sha256);flattenTokens(JSON.parse(text),'',raw);}const resolved=resolveTokens(raw);for(const token of manifest.tokens)assert.equal(token.resolved,resolved[token.key]);});
test('generated styles contain no unresolved semantic aliases',()=>{const css=fs.readFileSync(new URL('../../web/tokens.css',import.meta.url),'utf8');assert.ok(!css.includes('{primitive.'));assert.ok(css.includes('--primitive-font-sans:'));assert.ok(css.includes('--semantic-color-surface-canvas: #fcfcfc;'));});

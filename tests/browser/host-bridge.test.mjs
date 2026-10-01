import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { fixture } from '../helpers/fixture.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hostHarness = `
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';

  const frame = document.createElement('iframe');
  frame.id = 'mcp-app';
  frame.title = 'Synthetic TIDAL MCP Apps view';
  document.body.append(frame);
window.bridgeState = { initialized: false, firstToolResultSent: false, errors: [], calls: [] };
const bridge = new AppBridge(
  null,
  { name: 'TIDAL MCP Apps browser test host', version: '1.0.0' },
  { serverTools: {}, openLinks: {}, logging: {} },
  { hostContext: { displayMode: 'inline' } },
);
bridge.onerror = error => { window.bridgeState.errors.push(String(error)); };
bridge.oncalltool = async ({ name, arguments: args }) => {
  window.bridgeState.calls.push(name);
  const envelope = await window.invokeSyntheticTool(name, args || {});
  return {
    content: [{ type: 'text', text: JSON.stringify(envelope) }],
    structuredContent: envelope,
  };
};
bridge.oninitialized = async () => {
  try {
    window.bridgeState.initialized = true;
    const envelope = await window.initialSearchResult();
    await bridge.sendToolResult({
      content: [{ type: 'text', text: JSON.stringify(envelope) }],
      structuredContent: envelope,
    });
    window.bridgeState.firstToolResultSent = true;
  } catch (error) {
    window.bridgeState.errors.push(String(error));
  }
};

const transport = new PostMessageTransport(frame.contentWindow, frame.contentWindow);
const connected = bridge.connect(transport);
frame.src = '/widget.html';
await connected;
window.bridgeState.connected = true;
`;

test('production MCP Apps bundle renders a host tool result and calls one read tool through the official bridge', async t => {
  const widgetPath = path.join(root, 'dist', 'widget.html');
  const widgetHtml = await readFile(widgetPath, 'utf8');
  const hostBuild = await build({
    stdin: {
      contents: hostHarness,
      resolveDir: root,
      sourcefile: 'host-bridge.mjs',
      loader: 'js',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
  });
  const hostModule = hostBuild.outputFiles[0].text;
  const f = await fixture({ config: { enableWrites: false } });
  const initial = await f.service.invoke('tidal_search', { query: 'night', kind: 'tracks', countryCode: 'SG' }, f.principal);
  assert.equal(initial.ok, true);
  assert.ok(initial.data.items.length > 0);
  const expectedTitle = initial.data.items[0].title;
  const toolCalls = [];
  const server = createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    if (pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;font:14px system-ui,sans-serif}header{box-sizing:border-box;height:40px;padding:11px 16px;background:#173b38;color:#fff;font-weight:600}iframe{display:block;width:100%;height:calc(100vh - 40px);border:0}</style></head><body><header>Synthetic official bridge validation · read only</header><script type="module" src="/host.mjs"></script></body></html>');
    } else if (pathname === '/widget.html') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(widgetHtml);
    } else if (pathname === '/host.mjs') {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      response.end(hostModule);
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));

  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(5000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.exposeFunction('initialSearchResult', async () => initial);
  await page.exposeFunction('invokeSyntheticTool', async (name, args) => {
    toolCalls.push({ name, args });
    assert.equal(name, 'tidal_get', 'the browser bridge test permits only the one expected read call');
    return f.service.invoke(name, args, f.principal);
  });

  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const app = page.frameLocator('#mcp-app');
  await app.getByRole('button', { name: expectedTitle, exact: true }).waitFor();
  assert.equal(await app.locator('#demo').isVisible(), false);
  await app.getByRole('button', { name: expectedTitle, exact: true }).click();
  await app.locator('dialog[open]').waitFor();

  const bridgeState = await page.evaluate(() => window.bridgeState);
  assert.equal(bridgeState.initialized, true);
  assert.equal(bridgeState.firstToolResultSent, true);
  assert.equal(bridgeState.connected, true);
  assert.deepEqual(bridgeState.errors, []);
  assert.deepEqual(bridgeState.calls, ['tidal_get']);
  assert.equal(await app.locator('#dialog-title').textContent(), expectedTitle);
  assert.deepEqual(toolCalls.map(call => call.name), ['tidal_get']);
  assert.equal(f.config.enableWrites, false);
  assert.equal(f.fake.mutations, 0);
  assert.deepEqual(pageErrors, []);
  const screenshotDir = path.join(root, 'test-results');
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, 'host-bridge.png'), fullPage: true });
});

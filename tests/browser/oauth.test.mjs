import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { fixture } from '../helpers/fixture.mjs';
import { httpServer } from '../../src/core/http.mjs';
import { createServer } from 'node:http';
import { opaque, challenge } from '../../src/core/util.mjs';

test('consent form redirects to TIDAL in Chromium without a CSP violation', async t => {
  const f = await fixture();
  const upstream = createServer((req, res) => res.end('<h1>Synthetic TIDAL login</h1>'));
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { upstream.closeAllConnections(); upstream.close(resolve); }));
  const loginOrigin = `http://127.0.0.1:${upstream.address().port}`;
  f.config.redirectAllowlist = [loginOrigin + '/callback'];
  f.auth.loginUrl = () => ({ url: loginOrigin + '/login', verifier: 'synthetic-verifier' });
  const server = httpServer({ config: f.config, broker: f.broker, audit: f.audit });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  Object.assign(f.config, { origin, resource: origin + '/mcp', callback: origin + '/tidal/callback' });
  const client = await f.broker.register({ redirect_uris: f.config.redirectAllowlist });
  const query = new URLSearchParams({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], resource: f.config.resource, response_type: 'code', code_challenge: challenge(opaque(48)), code_challenge_method: 'S256', scope: 'tidal:read' });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  // A separate loopback origin exercises Chromium's redirect enforcement offline.
  const response = await page.goto(origin + '/authorize?' + query);
  assert.match(response.headers()['content-security-policy'], /form-action 'self' https:\/\/login\.tidal\.com /);
  await page.getByRole('button', { name: 'Continue to TIDAL' }).click();
  await page.getByRole('heading', { name: 'Synthetic TIDAL login' }).waitFor({ timeout: 3000 });
  assert.equal(new URL(page.url()).origin, loginOrigin);
});

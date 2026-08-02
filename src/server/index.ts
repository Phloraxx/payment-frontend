import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createApiApp } from './app.js';
import { loadConfig } from './config.js';
import { PayGateClient } from './paygate.js';
import { FixedWindowLimiter } from './rate-limit.js';
import { RazorpayTestClient } from './razorpay-test.js';

const config = loadConfig();
const payGate = new PayGateClient(config.payGateUrl, config.payGateApiKey);
const razorpayTest = config.razorpayTestEnabled
  ? new RazorpayTestClient(config.razorpayTestUrl, config.razorpayTestApiKey)
  : undefined;
const app = createApiApp({
  config,
  payGate,
  razorpayTest,
  createPerIpLimiter: new FixedWindowLimiter(config.creationRateLimit, config.creationWindowMs),
  createGlobalLimiter: new FixedWindowLimiter(config.globalCreationRateLimit, config.globalCreationWindowMs),
  statusPerIpLimiter: new FixedWindowLimiter(config.statusRateLimit, config.statusWindowMs),
  statusGlobalLimiter: new FixedWindowLimiter(config.globalStatusRateLimit, config.globalStatusWindowMs),
});

const clientDir = resolve(process.cwd(), 'dist/client');
const indexHtml = readFileSync(resolve(clientDir, 'index.html'), 'utf8');

app.use('/assets/*', async (c, next) => {
  await next();
  if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable');
});
app.use('/assets/*', serveStatic({ root: clientDir }));
app.use('/Ieee.svg', serveStatic({ path: resolve(clientDir, 'Ieee.svg') }));
app.use('/favicon.svg', serveStatic({ path: resolve(clientDir, 'favicon.svg') }));
app.get('*', (c) => {
  c.header('Cache-Control', 'no-cache');
  return c.html(indexHtml);
});

const server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`payment-frontend listening on :${info.port}`);
});

function shutdown(signal: string) {
  console.log(`received ${signal}, shutting down`);
  server.close((error) => {
    if (error) {
      console.error('server shutdown failed', error);
      process.exitCode = 1;
    }
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

export interface ServerConfig {
  port: number;
  payGateUrl: string;
  payGateApiKey: string;
  razorpayTestEnabled: boolean;
  razorpayTestUrl: string;
  razorpayTestApiKey: string;
  trustProxyHeaders: boolean;
  creationRateLimit: number;
  creationWindowMs: number;
  globalCreationRateLimit: number;
  globalCreationWindowMs: number;
  statusRateLimit: number;
  statusWindowMs: number;
  globalStatusRateLimit: number;
  globalStatusWindowMs: number;
}

function required(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parsePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function parsePort(raw: string | undefined): number {
  const port = parsePositiveInt('PORT', raw, 3000);
  if (port > 65_535) throw new Error('PORT must be between 1 and 65535');
  return port;
}

function parseWindowMs(name: string, raw: string | undefined, fallbackSeconds: number): number {
  const seconds = parsePositiveInt(name, raw, fallbackSeconds);
  if (seconds > Math.floor(Number.MAX_SAFE_INTEGER / 1000)) {
    throw new Error(`${name} is too large`);
  }
  return seconds * 1000;
}

function parseBoolean(name: string, raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be true or false`);
}


function parseOrigin(name: string, raw: string): string {
  const value = raw.replace(/\/+$/, '');
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use http or https`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== '/' && parsed.pathname !== '')) {
    throw new Error(`${name} must be an origin without credentials, path, query or fragment`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const payGateUrl = parseOrigin('PAYGATE_URL', required('PAYGATE_URL', env));
  const payGateApiKey = required('PAYGATE_API_KEY', env);
  if (payGateApiKey.length < 24) {
    throw new Error('PAYGATE_API_KEY must be at least 24 characters');
  }

  const razorpayTestEnabled = parseBoolean('RAZORPAY_TEST_ENABLED', env.RAZORPAY_TEST_ENABLED, false);
  let razorpayTestUrl = '';
  let razorpayTestApiKey = '';
  if (razorpayTestEnabled) {
    razorpayTestUrl = parseOrigin('RAZORPAY_TEST_URL', required('RAZORPAY_TEST_URL', env));
    razorpayTestApiKey = required('RAZORPAY_TEST_API_KEY', env);
    if (razorpayTestApiKey.length < 24) {
      throw new Error('RAZORPAY_TEST_API_KEY must be at least 24 characters');
    }
  }

  return {
    port: parsePort(env.PORT),
    payGateUrl,
    payGateApiKey,
    razorpayTestEnabled,
    razorpayTestUrl,
    razorpayTestApiKey,
    trustProxyHeaders: parseBoolean('TRUST_PROXY_HEADERS', env.TRUST_PROXY_HEADERS, false),
    creationRateLimit: parsePositiveInt('PAYMENT_CREATE_LIMIT', env.PAYMENT_CREATE_LIMIT, 5),
    creationWindowMs: parseWindowMs('PAYMENT_CREATE_WINDOW_SECONDS', env.PAYMENT_CREATE_WINDOW_SECONDS, 300),
    globalCreationRateLimit: parsePositiveInt('PAYMENT_CREATE_GLOBAL_LIMIT', env.PAYMENT_CREATE_GLOBAL_LIMIT, 60),
    globalCreationWindowMs: parseWindowMs(
      'PAYMENT_CREATE_GLOBAL_WINDOW_SECONDS',
      env.PAYMENT_CREATE_GLOBAL_WINDOW_SECONDS,
      60,
    ),
    statusRateLimit: parsePositiveInt('PAYMENT_STATUS_LIMIT', env.PAYMENT_STATUS_LIMIT, 180),
    statusWindowMs: parseWindowMs('PAYMENT_STATUS_WINDOW_SECONDS', env.PAYMENT_STATUS_WINDOW_SECONDS, 60),
    globalStatusRateLimit: parsePositiveInt('PAYMENT_STATUS_GLOBAL_LIMIT', env.PAYMENT_STATUS_GLOBAL_LIMIT, 1800),
    globalStatusWindowMs: parseWindowMs(
      'PAYMENT_STATUS_GLOBAL_WINDOW_SECONDS',
      env.PAYMENT_STATUS_GLOBAL_WINDOW_SECONDS,
      60,
    ),
  };
}

export interface ServerConfig {
  port: number;
  payGateUrl: string;
  payGateApiKey: string;
  trustProxyHeaders: boolean;
  creationRateLimit: number;
  creationWindowMs: number;
  globalCreationRateLimit: number;
  globalCreationWindowMs: number;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const payGateUrl = required('PAYGATE_URL', env).replace(/\/+$/, '');
  const parsedUrl = new URL(payGateUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('PAYGATE_URL must use http or https');
  }
  if (parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash || (parsedUrl.pathname !== '/' && parsedUrl.pathname !== '')) {
    throw new Error('PAYGATE_URL must be an origin without credentials, path, query or fragment');
  }

  const payGateApiKey = required('PAYGATE_API_KEY', env);
  if (payGateApiKey.length < 24) {
    throw new Error('PAYGATE_API_KEY must be at least 24 characters');
  }

  return {
    port: parsePort(env.PORT),
    payGateUrl,
    payGateApiKey,
    trustProxyHeaders: parseBoolean('TRUST_PROXY_HEADERS', env.TRUST_PROXY_HEADERS, false),
    creationRateLimit: parsePositiveInt('PAYMENT_CREATE_LIMIT', env.PAYMENT_CREATE_LIMIT, 5),
    creationWindowMs: parseWindowMs('PAYMENT_CREATE_WINDOW_SECONDS', env.PAYMENT_CREATE_WINDOW_SECONDS, 300),
    globalCreationRateLimit: parsePositiveInt('PAYMENT_CREATE_GLOBAL_LIMIT', env.PAYMENT_CREATE_GLOBAL_LIMIT, 60),
    globalCreationWindowMs: parseWindowMs(
      'PAYMENT_CREATE_GLOBAL_WINDOW_SECONDS',
      env.PAYMENT_CREATE_GLOBAL_WINDOW_SECONDS,
      60,
    ),
  };
}

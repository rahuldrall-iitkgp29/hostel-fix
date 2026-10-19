const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');
const { mongo } = require('mongoose');
const { isTestDatabaseUri } = require('./testDatabase');

class ConfigurationError extends Error {
  constructor(keys) {
    const fields = [...new Set(keys)].sort();
    super(`Invalid configuration: ${fields.join(', ')}.`);
    this.name = 'ConfigurationError';
    this.fields = fields;
  }
}

const isLocalhost = (hostname) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);

function isOrigin(value) {
  try {
    const url = new URL(value);
    return url.origin === value && (
      url.protocol === 'https:' || (url.protocol === 'http:' && isLocalhost(url.hostname))
    );
  } catch {
    return false;
  }
}

function isMongoUri(value) {
  try {
    if (/\s/.test(value)) return false;
    // Constructor parses only; no sockets, DNS or topology discovery here.
    const { options } = new mongo.MongoClient(value);
    return (value.startsWith('mongodb+srv://') || Boolean(options.replicaSet?.trim()))
      && options.readPreference.mode === 'primary' && !options.directConnection;
  } catch {
    return false;
  }
}

const fixedInteger = (value) => z.literal(String(value)).default(String(value)).transform(Number);
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().regex(/^\d+$/).default('5000').transform(Number).pipe(z.number().int().min(1).max(65535)),
  MONGODB_URI: z.string().min(1).refine(isMongoUri),
  TEST_MONGODB_URI: z.preprocess((value) => value === '' ? undefined : value, z.string().optional()),
  JWT_SECRET: z.string().refine((value) => value.trim().length > 0 && Buffer.byteLength(value, 'utf8') >= 32),
  CORS_ORIGIN: z.string().refine(isOrigin),
  UPLOAD_DIR: z.string().min(1).refine(path.isAbsolute),
  COOKIE_DOMAIN: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().regex(/^\.?[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/).optional(),
  ),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  ACCESS_TOKEN_EXPIRY: fixedInteger(600),
  REFRESH_TOKEN_EXPIRY: fixedInteger(604800),
  BCRYPT_ROUNDS: fixedInteger(12),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'test') {
    if (!isTestDatabaseUri(env.TEST_MONGODB_URI)) {
      ctx.addIssue({ code: 'custom', path: ['TEST_MONGODB_URI'], message: 'Dedicated local test URI required.' });
    }
  }
  if (env.NODE_ENV === 'production' && isMongoUri(env.MONGODB_URI || '')) {
    const credentials = new mongo.MongoClient(env.MONGODB_URI).options.credentials;
    if (!credentials?.username || !credentials?.password) {
      ctx.addIssue({ code: 'custom', path: ['MONGODB_URI'], message: 'Production database authentication required.' });
    }
  }
  if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
    ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'Production requires secure cookies.' });
  }
  if (env.NODE_ENV === 'production' && !env.CORS_ORIGIN.startsWith('https://')) {
    ctx.addIssue({ code: 'custom', path: ['CORS_ORIGIN'], message: 'Production requires HTTPS.' });
  }
  if (!env.COOKIE_SECURE && isOrigin(env.CORS_ORIGIN) && !isLocalhost(new URL(env.CORS_ORIGIN).hostname)) {
    ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'Insecure cookies are limited to localhost.' });
  }
});

function parseEnv(source) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Never return/log Zod's raw input, a database URI, or a supplied secret.
    throw new ConfigurationError(result.error.issues.map((issue) => issue.path[0] || 'ENV'));
  }
  return Object.freeze(result.data);
}

function loadEnv({ source = process.env, envFile = path.resolve(__dirname, '../../.env') } = {}) {
  const values = { ...source };
  // Tests supply their own values and never read a developer/production env file.
  if (values.NODE_ENV !== 'test') {
    const result = dotenv.config({ path: envFile, processEnv: values, quiet: true });
    if (result.error && result.error.code !== 'ENOENT') throw new ConfigurationError(['ENV_FILE']);
  }
  return parseEnv(values);
}

module.exports = { ConfigurationError, parseEnv, loadEnv };

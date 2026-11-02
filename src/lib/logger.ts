/**
 * SECURIA — Structured Logger
 * ============================
 * Provides consistent, structured log output suitable for both local
 * development (human-readable) and production log aggregation pipelines
 * (JSON format, e.g., Vercel Logs, Datadog, Loki).
 *
 * Features:
 * - Structured JSON output in production
 * - Pretty human-readable output in development
 * - Log levels: debug | info | warn | error
 * - Contextual fields (module, userId, alertId, etc.)
 * - Never leaks secrets or full stack traces to the client
 *
 * Usage (server-side only):
 *   import { logger } from '@/lib/logger';
 *   const log = logger.child({ module: 'alert-engine' });
 *   log.info('Alert triggered', { alertId, userId });
 *   log.error('Database failure', { error });
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  module?: string;
  userId?: string;
  alertId?: string;
  interventionId?: string;
  organizationId?: string;
  requestId?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Level Priority
// ---------------------------------------------------------------------------
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const isDev = process.env.NODE_ENV !== 'production';
const minLevel: LogLevel = isDev ? 'debug' : 'info';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'authorization',
  'apikey',
  'api_key',
  'service_role_key',
  'jwt',
  'cookie',
]);

function sanitizeLogData(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeLogData);

  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lowerKey = k.toLowerCase();
    if (
      SENSITIVE_KEYS.has(lowerKey) ||
      lowerKey.includes('password') ||
      lowerKey.includes('token') ||
      lowerKey.includes('secret')
    ) {
      clean[k] = '[REDACTED]';
    } else if (v && typeof v === 'object') {
      clean[k] = sanitizeLogData(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Core Log Function
// ---------------------------------------------------------------------------
function log(
  level: LogLevel,
  message: string,
  context: LogContext = {},
  error?: unknown
): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;

  const timestamp = new Date().toISOString();
  const cleanContext = sanitizeLogData(context);
  const errorDetails =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: isDev ? error.stack : undefined }
      : error !== undefined
      ? { raw: String(error) }
      : undefined;

  if (isDev) {
    // Human-readable development output
    const color = LEVEL_COLORS[level];
    const prefix = `${color}[${level.toUpperCase()}]${RESET}`;
    const moduleTag = cleanContext.module ? ` [${cleanContext.module}]` : '';
    const extra = { ...cleanContext };
    delete extra.module;

    const extraStr = Object.keys(extra).length > 0 ? ' ' + JSON.stringify(extra) : '';
    const errorStr = errorDetails ? '\n  ' + JSON.stringify(errorDetails) : '';

    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      `${timestamp} ${prefix}${moduleTag} ${message}${extraStr}${errorStr}`
    );
  } else {
    // JSON output for production log pipelines
    const logEntry: Record<string, unknown> = {
      timestamp,
      level,
      message,
      ...cleanContext,
      ...(errorDetails ? { error: errorDetails } : {}),
    };

    const output = JSON.stringify(logEntry);
    if (level === 'error') {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }
}

// ---------------------------------------------------------------------------
// Logger Factory
// ---------------------------------------------------------------------------
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext, error?: unknown): void;
  child(context: LogContext): Logger;
}

function createLogger(baseContext: LogContext = {}): Logger {
  return {
    debug(message, context = {}) {
      log('debug', message, { ...baseContext, ...context });
    },
    info(message, context = {}) {
      log('info', message, { ...baseContext, ...context });
    },
    warn(message, context = {}) {
      log('warn', message, { ...baseContext, ...context });
    },
    error(message, context = {}, error?: unknown) {
      log('error', message, { ...baseContext, ...context }, error);
    },
    child(context: LogContext) {
      return createLogger({ ...baseContext, ...context });
    },
  };
}

/** Root logger — use this directly or call `.child()` for module-scoped loggers. */
export const logger = createLogger();

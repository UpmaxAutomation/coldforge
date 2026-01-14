// Structured logging utilities for InstantScale with Pino
import pino, { type Logger, type LoggerOptions, type DestinationStream } from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

// Sensitive fields to redact from logs
const REDACTED_FIELDS = [
  'password',
  'token',
  'apiKey',
  'api_key',
  'authorization',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'secret',
  'secretKey',
  'secret_key',
  'privateKey',
  'private_key',
  'creditCard',
  'credit_card',
  'ssn',
  'cvv',
]

// Build redact paths for nested objects
const redactPaths = REDACTED_FIELDS.flatMap(field => [
  field,
  `*.${field}`,
  `*.*.${field}`,
  `[*].${field}`,
  `body.${field}`,
  `headers.${field}`,
  `query.${field}`,
  `params.${field}`,
  `data.${field}`,
  `user.${field}`,
  `context.${field}`,
])

// Logger configuration
const loggerConfig: LoggerOptions = {
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  base: {
    env: process.env.NODE_ENV || 'development',
    service: 'instantscale',
    version: process.env.npm_package_version || '1.0.0',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      env: bindings.env,
      service: bindings.service,
      version: bindings.version,
      pid: bindings.pid,
      hostname: bindings.hostname,
    }),
  },
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      params: req.params,
      headers: {
        'user-agent': req.headers?.['user-agent'],
        'content-type': req.headers?.['content-type'],
        'x-forwarded-for': req.headers?.['x-forwarded-for'],
        'x-request-id': req.headers?.['x-request-id'],
      },
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      headers: {
        'content-type': res.headers?.['content-type'],
        'content-length': res.headers?.['content-length'],
      },
    }),
  },
}

// Create transport for development (pretty print)
function createDevTransport(): DestinationStream | undefined {
  if (isDev && typeof window === 'undefined') {
    // Only use pino-pretty in Node.js server environment
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pretty = require('pino-pretty')
    return pretty({
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname,service,version',
      messageFormat: '{module} - {msg}',
      errorProps: 'err,error',
      singleLine: false,
    })
  }
  return undefined
}

// Main logger instance
const transport = createDevTransport()
export const logger: Logger = transport
  ? pino(loggerConfig, transport)
  : pino(loggerConfig)

// Logger factory for creating module-specific loggers
export function createLogger(module: string, additionalContext?: Record<string, unknown>): Logger {
  return logger.child({ module, ...additionalContext })
}

// Pre-configured loggers for common modules
export const loggers = {
  email: createLogger('email'),
  campaign: createLogger('campaign'),
  auth: createLogger('auth'),
  billing: createLogger('billing'),
  warmup: createLogger('warmup'),
  api: createLogger('api'),
  db: createLogger('db'),
  cache: createLogger('cache'),
  queue: createLogger('queue'),
  webhook: createLogger('webhook'),
  smtp: createLogger('smtp'),
  dns: createLogger('dns'),
}

// Request context type
export interface RequestContext {
  requestId: string
  method: string
  path: string
  userId?: string
  organizationId?: string
  startTime: number
  query?: Record<string, string>
  userAgent?: string
  ip?: string
}

// Generate unique request ID
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`
}

// Request logging helper with duration
export function logRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  context?: Partial<RequestContext>
) {
  const log = statusCode >= 500 ? logger.error : statusCode >= 400 ? logger.warn : logger.info
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'

  log({
    type: 'http_request',
    level,
    method,
    path,
    statusCode,
    durationMs: duration,
    requestId: context?.requestId,
    userId: context?.userId,
    organizationId: context?.organizationId,
    userAgent: context?.userAgent,
    ip: context?.ip,
  }, `${method} ${path} ${statusCode} - ${duration}ms`)
}

// Error logging helper with full context
export function logError(
  error: Error,
  context?: Record<string, unknown>
) {
  logger.error({
    type: 'error',
    err: error,
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
    ...context,
  }, `Error: ${error.message}`)
}

// Audit logging for sensitive operations
export function logAudit(
  action: string,
  userId: string,
  organizationId: string,
  details?: Record<string, unknown>
) {
  logger.info({
    type: 'audit',
    action,
    userId,
    organizationId,
    ...details,
    timestamp: new Date().toISOString(),
  }, `Audit: ${action} by user ${userId}`)
}

// Performance logging helper
export function logPerformance(
  operation: string,
  durationMs: number,
  context?: Record<string, unknown>
) {
  const log = durationMs > 5000 ? logger.warn : durationMs > 1000 ? logger.info : logger.debug

  log({
    type: 'performance',
    operation,
    durationMs,
    ...context,
  }, `Performance: ${operation} took ${durationMs}ms`)
}

// Database query logging helper
export function logQuery(
  query: string,
  durationMs: number,
  context?: Record<string, unknown>
) {
  const log = durationMs > 1000 ? logger.warn : durationMs > 100 ? logger.debug : logger.trace

  log({
    type: 'db_query',
    query: query.substring(0, 500), // Truncate long queries
    durationMs,
    ...context,
  }, `DB Query: ${durationMs}ms`)
}

// Security event logging
export function logSecurityEvent(
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  context?: Record<string, unknown>
) {
  const log = severity === 'critical' || severity === 'high'
    ? logger.error
    : severity === 'medium'
      ? logger.warn
      : logger.info

  log({
    type: 'security_event',
    event,
    severity,
    ...context,
    timestamp: new Date().toISOString(),
  }, `Security Event [${severity.toUpperCase()}]: ${event}`)
}

// Business metric logging
export function logMetric(
  metric: string,
  value: number,
  unit: string,
  tags?: Record<string, string>
) {
  logger.info({
    type: 'metric',
    metric,
    value,
    unit,
    tags,
    timestamp: new Date().toISOString(),
  }, `Metric: ${metric}=${value}${unit}`)
}

// Export types for consumers
export type { Logger } from 'pino'

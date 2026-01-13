// Logging utilities for InstantScale
import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
  base: {
    env: process.env.NODE_ENV || 'development',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
})

// Create child logger for specific modules
export function createLogger(module: string) {
  return logger.child({ module })
}

// Pre-configured loggers for common modules
export const loggers = {
  email: createLogger('email'),
  campaign: createLogger('campaign'),
  auth: createLogger('auth'),
  billing: createLogger('billing'),
  warmup: createLogger('warmup'),
  api: createLogger('api'),
}

// Request logging helper
export function logRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  userId?: string
) {
  const log = statusCode >= 500 ? logger.error : statusCode >= 400 ? logger.warn : logger.info

  log({
    type: 'request',
    method,
    path,
    statusCode,
    duration: `${duration}ms`,
    ...(userId && { userId }),
  })
}

// Error logging helper
export function logError(
  error: Error,
  context?: Record<string, unknown>
) {
  logger.error({
    type: 'error',
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  })
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
  })
}

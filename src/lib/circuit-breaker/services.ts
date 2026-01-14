import { CircuitBreaker, CircuitState } from '.'

// Pre-configured circuit breakers for external services
export const circuitBreakers = {
  // SMTP services - more tolerant of failures
  smtp: new CircuitBreaker('smtp', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 1 minute
    resetTimeout: 120000 // 2 minutes
  }),

  // Cloudflare API - DNS management
  cloudflare: new CircuitBreaker('cloudflare', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000, // 30 seconds
    resetTimeout: 60000
  }),

  // Namecheap API - domain registration
  namecheap: new CircuitBreaker('namecheap', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000
  }),

  // Porkbun API - domain registration
  porkbun: new CircuitBreaker('porkbun', {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000
  }),

  // Supabase - database operations (more tolerant)
  supabase: new CircuitBreaker('supabase', {
    failureThreshold: 10,
    successThreshold: 3,
    timeout: 15000, // 15 seconds
    resetTimeout: 30000
  }),

  // Google OAuth/API
  google: new CircuitBreaker('google', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000
  }),

  // Microsoft OAuth/API
  microsoft: new CircuitBreaker('microsoft', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000
  }),

  // IMAP connections
  imap: new CircuitBreaker('imap', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 45000,
    resetTimeout: 90000
  }),

  // Stripe billing
  stripe: new CircuitBreaker('stripe', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000
  })
} as const

export type ServiceName = keyof typeof circuitBreakers

// Get a specific circuit breaker by name
export function getCircuitBreaker(service: ServiceName): CircuitBreaker {
  return circuitBreakers[service]
}

// Get all circuit breaker stats (for health checks)
export function getAllCircuitStats() {
  return Object.entries(circuitBreakers).map(([key, cb]) => ({
    service: key,
    ...cb.getStats()
  }))
}

// Get summary of circuit breaker health
export function getCircuitBreakerSummary(): {
  healthy: string[]
  degraded: string[]
  unhealthy: string[]
  total: number
} {
  const healthy: string[] = []
  const degraded: string[] = []
  const unhealthy: string[] = []

  for (const [name, cb] of Object.entries(circuitBreakers)) {
    const state = cb.getState()
    switch (state) {
      case CircuitState.CLOSED:
        healthy.push(name)
        break
      case CircuitState.HALF_OPEN:
        degraded.push(name)
        break
      case CircuitState.OPEN:
        unhealthy.push(name)
        break
    }
  }

  return {
    healthy,
    degraded,
    unhealthy,
    total: Object.keys(circuitBreakers).length
  }
}

// Reset all circuit breakers (useful for testing or manual intervention)
export function resetAllCircuitBreakers(): void {
  for (const cb of Object.values(circuitBreakers)) {
    cb.reset()
  }
}

// Reset a specific circuit breaker
export function resetCircuitBreaker(service: ServiceName): void {
  circuitBreakers[service].reset()
}

// Check if a service is available
export function isServiceAvailable(service: ServiceName): boolean {
  return circuitBreakers[service].isAvailable()
}

// Execute a function with circuit breaker protection
export async function executeWithCircuitBreaker<T>(
  service: ServiceName,
  fn: () => Promise<T>
): Promise<T> {
  return circuitBreakers[service].execute(fn)
}

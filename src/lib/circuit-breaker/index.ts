export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, rejecting requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number    // Failures before opening
  successThreshold: number    // Successes to close from half-open
  timeout: number             // Time in OPEN state before trying again (ms)
  resetTimeout?: number       // Time to reset failure count (ms)
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  resetTimeout: 60000
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount: number = 0
  private successCount: number = 0
  private lastFailureTime: number = 0
  private nextAttemptTime: number = 0
  private readonly config: CircuitBreakerConfig
  private readonly name: string

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new CircuitOpenError(this.name, this.nextAttemptTime - Date.now())
      }
      // Time to try again - move to half-open
      this.state = CircuitState.HALF_OPEN
      this.successCount = 0
      console.log(`[CircuitBreaker:${this.name}] Circuit HALF_OPEN (testing recovery)`)
    }

    // Reset failure count if enough time has passed (for CLOSED state)
    if (
      this.state === CircuitState.CLOSED &&
      this.config.resetTimeout &&
      this.lastFailureTime > 0 &&
      Date.now() - this.lastFailureTime > this.config.resetTimeout
    ) {
      this.failureCount = 0
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.failureCount = 0

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED
        console.log(`[CircuitBreaker:${this.name}] Circuit CLOSED (service recovered)`)
      }
    }
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during testing - go back to open
      this.state = CircuitState.OPEN
      this.nextAttemptTime = Date.now() + this.config.timeout
      console.log(`[CircuitBreaker:${this.name}] Circuit OPEN (failed in half-open)`)
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN
      this.nextAttemptTime = Date.now() + this.config.timeout
      console.log(`[CircuitBreaker:${this.name}] Circuit OPEN (threshold ${this.config.failureThreshold} reached)`)
    }
  }

  getState(): CircuitState {
    return this.state
  }

  getName(): string {
    return this.name
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      config: this.config
    }
  }

  reset(): void {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = 0
    this.nextAttemptTime = 0
    console.log(`[CircuitBreaker:${this.name}] Circuit manually reset to CLOSED`)
  }

  // Check if the circuit is allowing requests
  isAvailable(): boolean {
    if (this.state === CircuitState.CLOSED) return true
    if (this.state === CircuitState.HALF_OPEN) return true
    if (this.state === CircuitState.OPEN && Date.now() >= this.nextAttemptTime) return true
    return false
  }

  // Get time until next retry is allowed (in ms)
  getRetryAfter(): number {
    if (this.state !== CircuitState.OPEN) return 0
    const remaining = this.nextAttemptTime - Date.now()
    return remaining > 0 ? remaining : 0
  }
}

export class CircuitOpenError extends Error {
  public readonly service: string
  public readonly retryAfterMs: number

  constructor(service: string, retryAfterMs: number) {
    super(`Circuit breaker is open for ${service}. Retry after ${Math.ceil(retryAfterMs / 1000)}s`)
    this.name = 'CircuitOpenError'
    this.service = service
    this.retryAfterMs = retryAfterMs
  }
}

// Utility function to wrap any async function with circuit breaker
export function withCircuitBreaker<T extends unknown[], R>(
  circuitBreaker: CircuitBreaker,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return (...args: T) => circuitBreaker.execute(() => fn(...args))
}

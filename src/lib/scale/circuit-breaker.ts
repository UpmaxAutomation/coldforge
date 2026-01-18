// Circuit Breaker Pattern Implementation
import { CircuitBreakerConfig, CircuitBreakerStatus, CircuitState } from './types';

// Circuit Breaker for resilient external service calls
export class CircuitBreaker {
  private name: string;
  private state: CircuitState;
  private failures: number;
  private successes: number;
  private lastFailure?: Date;
  private nextRetry?: Date;
  private config: CircuitBreakerConfig;
  private halfOpenRequests: number;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.halfOpenRequests = 0;

    this.config = {
      failureThreshold: config.failureThreshold || 5,
      successThreshold: config.successThreshold || 3,
      timeout: config.timeout || 30000,
      resetTimeout: config.resetTimeout || 60000,
    };
  }

  // Execute a function with circuit breaker protection
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.nextRetry && Date.now() >= this.nextRetry.getTime()) {
        this.transitionToHalfOpen();
      } else {
        throw new CircuitBreakerOpenError(this.name, this.nextRetry);
      }
    }

    if (this.state === 'half-open') {
      // Limit requests in half-open state
      if (this.halfOpenRequests >= 3) {
        throw new CircuitBreakerOpenError(this.name, this.nextRetry);
      }
      this.halfOpenRequests++;
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  // Execute with timeout
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Circuit breaker timeout: ${this.config.timeout}ms`));
      }, this.config.timeout);

      fn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  // Handle successful execution
  private onSuccess(): void {
    this.failures = 0;

    if (this.state === 'half-open') {
      this.successes++;
      this.halfOpenRequests--;

      if (this.successes >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  // Handle failed execution
  private onFailure(): void {
    this.failures++;
    this.lastFailure = new Date();

    if (this.state === 'half-open') {
      this.halfOpenRequests--;
      this.transitionToOpen();
    } else if (this.failures >= this.config.failureThreshold) {
      this.transitionToOpen();
    }
  }

  // State transitions
  private transitionToOpen(): void {
    this.state = 'open';
    this.nextRetry = new Date(Date.now() + this.config.resetTimeout);
    this.successes = 0;
    console.log(`Circuit breaker [${this.name}] opened until ${this.nextRetry.toISOString()}`);
  }

  private transitionToHalfOpen(): void {
    this.state = 'half-open';
    this.halfOpenRequests = 0;
    this.successes = 0;
    console.log(`Circuit breaker [${this.name}] half-open, testing...`);
  }

  private transitionToClosed(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.nextRetry = undefined;
    this.halfOpenRequests = 0;
    console.log(`Circuit breaker [${this.name}] closed, recovered`);
  }

  // Get current status
  getStatus(): CircuitBreakerStatus {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      nextRetry: this.nextRetry,
    };
  }

  // Force reset
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = undefined;
    this.nextRetry = undefined;
    this.halfOpenRequests = 0;
  }

  // Check if circuit is available
  isAvailable(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open' && this.nextRetry && Date.now() >= this.nextRetry.getTime()) {
      return true;
    }

    if (this.state === 'half-open' && this.halfOpenRequests < 3) {
      return true;
    }

    return false;
  }
}

// Circuit breaker error
export class CircuitBreakerOpenError extends Error {
  public readonly circuitName: string;
  public readonly retryAt?: Date;

  constructor(name: string, retryAt?: Date) {
    super(`Circuit breaker [${name}] is open`);
    this.name = 'CircuitBreakerOpenError';
    this.circuitName = name;
    this.retryAt = retryAt;
  }
}

// Circuit breaker registry for managing multiple breakers
class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker>;

  constructor() {
    this.breakers = new Map();
  }

  get(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(name);

    if (!breaker) {
      breaker = new CircuitBreaker(name, config);
      this.breakers.set(name, breaker);
    }

    return breaker;
  }

  getStatus(name: string): CircuitBreakerStatus | null {
    const breaker = this.breakers.get(name);
    return breaker ? breaker.getStatus() : null;
  }

  getAllStatuses(): CircuitBreakerStatus[] {
    return Array.from(this.breakers.values()).map((b) => b.getStatus());
  }

  reset(name: string): boolean {
    const breaker = this.breakers.get(name);

    if (breaker) {
      breaker.reset();
      return true;
    }

    return false;
  }

  resetAll(): void {
    this.breakers.forEach((breaker) => breaker.reset());
  }

  remove(name: string): boolean {
    return this.breakers.delete(name);
  }
}

// Singleton registry
export const circuitBreakers = new CircuitBreakerRegistry();

// Pre-configured circuit breakers
export const serviceBreakers = {
  // Email service circuit breaker
  email: () =>
    circuitBreakers.get('email', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 10000,
      resetTimeout: 30000,
    }),

  // SMTP provider circuit breaker
  smtp: () =>
    circuitBreakers.get('smtp', {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 30000,
      resetTimeout: 60000,
    }),

  // Webhook delivery circuit breaker
  webhook: () =>
    circuitBreakers.get('webhook', {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 10000,
      resetTimeout: 30000,
    }),

  // External API circuit breaker
  externalApi: () =>
    circuitBreakers.get('external-api', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 15000,
      resetTimeout: 45000,
    }),

  // DNS verification circuit breaker
  dns: () =>
    circuitBreakers.get('dns', {
      failureThreshold: 10,
      successThreshold: 3,
      timeout: 5000,
      resetTimeout: 120000,
    }),

  // Payment provider circuit breaker
  payment: () =>
    circuitBreakers.get('payment', {
      failureThreshold: 2,
      successThreshold: 2,
      timeout: 30000,
      resetTimeout: 60000,
    }),

  // AI/LLM provider circuit breaker
  ai: () =>
    circuitBreakers.get('ai', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 60000,
      resetTimeout: 30000,
    }),
};

// Retry with exponential backoff
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    retryCondition?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    retryCondition = () => true,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts || !retryCondition(lastError)) {
        throw lastError;
      }

      // Wait with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError;
}

// Bulkhead pattern for limiting concurrent operations
export class Bulkhead {
  private name: string;
  private maxConcurrent: number;
  private maxWaiting: number;
  private running: number;
  private waiting: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }>;

  constructor(
    name: string,
    options: { maxConcurrent?: number; maxWaiting?: number } = {}
  ) {
    this.name = name;
    this.maxConcurrent = options.maxConcurrent || 10;
    this.maxWaiting = options.maxWaiting || 100;
    this.running = 0;
    this.waiting = [];
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();

    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }

    if (this.waiting.length >= this.maxWaiting) {
      throw new BulkheadFullError(this.name);
    }

    return new Promise<void>((resolve, reject) => {
      this.waiting.push({ resolve, reject });
    });
  }

  private release(): void {
    this.running--;

    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (next) {
        this.running++;
        next.resolve();
      }
    }
  }

  getStats(): { running: number; waiting: number; available: number } {
    return {
      running: this.running,
      waiting: this.waiting.length,
      available: this.maxConcurrent - this.running,
    };
  }
}

// Bulkhead full error
export class BulkheadFullError extends Error {
  public readonly bulkheadName: string;

  constructor(name: string) {
    super(`Bulkhead [${name}] is full`);
    this.name = 'BulkheadFullError';
    this.bulkheadName = name;
  }
}

// Pre-configured bulkheads
const bulkheadRegistry = new Map<string, Bulkhead>();

export function getBulkhead(
  name: string,
  options?: { maxConcurrent?: number; maxWaiting?: number }
): Bulkhead {
  let bulkhead = bulkheadRegistry.get(name);

  if (!bulkhead) {
    bulkhead = new Bulkhead(name, options);
    bulkheadRegistry.set(name, bulkhead);
  }

  return bulkhead;
}

export const bulkheads = {
  // Email sending bulkhead
  emailSending: () =>
    getBulkhead('email-sending', { maxConcurrent: 50, maxWaiting: 500 }),

  // Webhook delivery bulkhead
  webhookDelivery: () =>
    getBulkhead('webhook-delivery', { maxConcurrent: 100, maxWaiting: 1000 }),

  // Lead import bulkhead
  leadImport: () =>
    getBulkhead('lead-import', { maxConcurrent: 5, maxWaiting: 20 }),

  // API request bulkhead
  apiRequest: () =>
    getBulkhead('api-request', { maxConcurrent: 200, maxWaiting: 500 }),

  // Database operations bulkhead
  database: () =>
    getBulkhead('database', { maxConcurrent: 50, maxWaiting: 200 }),
};

// Fallback pattern
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  options: {
    onFallback?: (error: Error) => void;
  } = {}
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    if (options.onFallback) {
      options.onFallback(err);
    }

    return fallback();
  }
}

// Timeout wrapper
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  message?: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(message || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

// Combine all resilience patterns
export async function resilient<T>(
  fn: () => Promise<T>,
  options: {
    circuitBreaker?: CircuitBreaker;
    bulkhead?: Bulkhead;
    timeout?: number;
    retryAttempts?: number;
    fallback?: () => Promise<T>;
  } = {}
): Promise<T> {
  let operation = fn;

  // Wrap with timeout
  if (options.timeout) {
    const originalOp = operation;
    operation = () => withTimeout(originalOp, options.timeout!);
  }

  // Wrap with retry
  if (options.retryAttempts && options.retryAttempts > 1) {
    const originalOp = operation;
    operation = () => retryWithBackoff(originalOp, { maxAttempts: options.retryAttempts });
  }

  // Wrap with circuit breaker
  if (options.circuitBreaker) {
    const originalOp = operation;
    operation = () => options.circuitBreaker!.execute(originalOp);
  }

  // Wrap with bulkhead
  if (options.bulkhead) {
    const originalOp = operation;
    operation = () => options.bulkhead!.execute(originalOp);
  }

  // Wrap with fallback
  if (options.fallback) {
    return withFallback(operation, options.fallback);
  }

  return operation();
}

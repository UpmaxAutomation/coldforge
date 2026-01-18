// Rate Limiting
import { createClient } from '@/lib/supabase/server';
import type { RateLimitConfig, RateLimitResult } from './types';

// Default rate limit configurations by tier
export const RATE_LIMIT_TIERS: Record<string, RateLimitConfig> = {
  free: {
    requestsPerMinute: 30,
    requestsPerHour: 500,
    requestsPerDay: 5000,
    burstLimit: 5,
  },
  starter: {
    requestsPerMinute: 60,
    requestsPerHour: 2000,
    requestsPerDay: 20000,
    burstLimit: 10,
  },
  professional: {
    requestsPerMinute: 120,
    requestsPerHour: 5000,
    requestsPerDay: 50000,
    burstLimit: 20,
  },
  enterprise: {
    requestsPerMinute: 600,
    requestsPerHour: 30000,
    requestsPerDay: 500000,
    burstLimit: 100,
  },
};

// In-memory rate limit store (for single-instance deployments)
// In production, use Redis
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean every minute

// Check rate limit (sliding window)
export async function checkRateLimit(
  identifier: string, // API key ID or IP address
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  const key = `ratelimit:${identifier}:minute`;

  // Get current count
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt < now) {
    // New window
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });

    return {
      allowed: true,
      remaining: config.requestsPerMinute - 1,
      resetAt: new Date(now + windowMs),
    };
  }

  // Check if exceeded
  if (current.count >= config.requestsPerMinute) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(current.resetAt),
      retryAfter,
    };
  }

  // Increment count
  current.count++;
  rateLimitStore.set(key, current);

  return {
    allowed: true,
    remaining: config.requestsPerMinute - current.count,
    resetAt: new Date(current.resetAt),
  };
}

// Check burst rate limit
export async function checkBurstLimit(
  identifier: string,
  burstLimit: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = 1000; // 1 second window
  const key = `ratelimit:${identifier}:burst`;

  const current = rateLimitStore.get(key);

  if (!current || current.resetAt < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });

    return {
      allowed: true,
      remaining: burstLimit - 1,
      resetAt: new Date(now + windowMs),
    };
  }

  if (current.count >= burstLimit) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(current.resetAt),
      retryAfter,
    };
  }

  current.count++;
  rateLimitStore.set(key, current);

  return {
    allowed: true,
    remaining: burstLimit - current.count,
    resetAt: new Date(current.resetAt),
  };
}

// Check hourly rate limit
export async function checkHourlyLimit(
  identifier: string,
  limit: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = 3600000; // 1 hour
  const key = `ratelimit:${identifier}:hour`;

  const current = rateLimitStore.get(key);

  if (!current || current.resetAt < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });

    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: new Date(now + windowMs),
    };
  }

  if (current.count >= limit) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(current.resetAt),
      retryAfter,
    };
  }

  current.count++;
  rateLimitStore.set(key, current);

  return {
    allowed: true,
    remaining: limit - current.count,
    resetAt: new Date(current.resetAt),
  };
}

// Check daily rate limit
export async function checkDailyLimit(
  identifier: string,
  limit: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = 86400000; // 24 hours
  const key = `ratelimit:${identifier}:day`;

  const current = rateLimitStore.get(key);

  if (!current || current.resetAt < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });

    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: new Date(now + windowMs),
    };
  }

  if (current.count >= limit) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(current.resetAt),
      retryAfter,
    };
  }

  current.count++;
  rateLimitStore.set(key, current);

  return {
    allowed: true,
    remaining: limit - current.count,
    resetAt: new Date(current.resetAt),
  };
}

// Comprehensive rate limit check (all windows)
export async function checkAllRateLimits(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  // Check burst limit first (strictest)
  const burstResult = await checkBurstLimit(identifier, config.burstLimit);
  if (!burstResult.allowed) {
    return burstResult;
  }

  // Check minute limit
  const minuteResult = await checkRateLimit(identifier, config);
  if (!minuteResult.allowed) {
    return minuteResult;
  }

  // Check hourly limit
  const hourlyResult = await checkHourlyLimit(identifier, config.requestsPerHour);
  if (!hourlyResult.allowed) {
    return hourlyResult;
  }

  // Check daily limit
  const dailyResult = await checkDailyLimit(identifier, config.requestsPerDay);
  if (!dailyResult.allowed) {
    return dailyResult;
  }

  // Return minute result (most relevant for API response)
  return minuteResult;
}

// Get rate limit config for API key
export async function getRateLimitConfig(
  apiKeyId: string
): Promise<RateLimitConfig> {
  const supabase = await createClient();

  // Get API key's rate limit
  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('rate_limit, workspace_id')
    .eq('id', apiKeyId)
    .single();

  if (!apiKey) {
    return RATE_LIMIT_TIERS.free;
  }

  // Get workspace subscription tier
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan_id')
    .eq('workspace_id', apiKey.workspace_id)
    .eq('status', 'active')
    .single();

  let baseTier = RATE_LIMIT_TIERS.free;

  if (subscription) {
    const { data: plan } = await supabase
      .from('subscription_plans')
      .select('slug')
      .eq('id', subscription.plan_id)
      .single();

    if (plan?.slug && RATE_LIMIT_TIERS[plan.slug]) {
      baseTier = RATE_LIMIT_TIERS[plan.slug];
    }
  }

  // Override with API key's custom rate limit if set
  return {
    ...baseTier,
    requestsPerMinute: apiKey.rate_limit || baseTier.requestsPerMinute,
  };
}

// Get current rate limit status
export async function getRateLimitStatus(
  identifier: string
): Promise<{
  minute: { count: number; limit: number; resetAt: Date };
  hour: { count: number; limit: number; resetAt: Date };
  day: { count: number; limit: number; resetAt: Date };
}> {
  const now = Date.now();

  const minuteKey = `ratelimit:${identifier}:minute`;
  const hourKey = `ratelimit:${identifier}:hour`;
  const dayKey = `ratelimit:${identifier}:day`;

  const minuteData = rateLimitStore.get(minuteKey);
  const hourData = rateLimitStore.get(hourKey);
  const dayData = rateLimitStore.get(dayKey);

  return {
    minute: {
      count: minuteData?.count || 0,
      limit: 60, // Default
      resetAt: new Date(minuteData?.resetAt || now + 60000),
    },
    hour: {
      count: hourData?.count || 0,
      limit: 2000, // Default
      resetAt: new Date(hourData?.resetAt || now + 3600000),
    },
    day: {
      count: dayData?.count || 0,
      limit: 20000, // Default
      resetAt: new Date(dayData?.resetAt || now + 86400000),
    },
  };
}

// Reset rate limits for an identifier (admin use)
export function resetRateLimits(identifier: string): void {
  const keys = [
    `ratelimit:${identifier}:burst`,
    `ratelimit:${identifier}:minute`,
    `ratelimit:${identifier}:hour`,
    `ratelimit:${identifier}:day`,
  ];

  keys.forEach((key) => rateLimitStore.delete(key));
}

// Rate limit headers for API response
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.floor(result.resetAt.getTime() / 1000)),
  };

  if (!result.allowed) {
    headers['Retry-After'] = String(result.retryAfter || 60);
  }

  return headers;
}

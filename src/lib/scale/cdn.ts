// CDN Configuration & Cache Purging
import { CDNConfig, CDNPurgeRequest, CDNStats } from './types';

// CDN Manager
export class CDNManager {
  private config: CDNConfig;

  constructor(config: CDNConfig) {
    this.config = config;
  }

  // Purge cache
  async purge(request: CDNPurgeRequest): Promise<{ success: boolean; message: string }> {
    switch (this.config.provider) {
      case 'cloudflare':
        return this.purgeCloudflare(request);
      case 'aws-cloudfront':
        return this.purgeCloudfront(request);
      case 'fastly':
        return this.purgeFastly(request);
      case 'bunny':
        return this.purgeBunny(request);
      default:
        throw new Error(`Unsupported CDN provider: ${this.config.provider}`);
    }
  }

  // Cloudflare purge
  private async purgeCloudflare(request: CDNPurgeRequest): Promise<{ success: boolean; message: string }> {
    if (!this.config.zoneId || !this.config.apiKey) {
      throw new Error('Cloudflare zoneId and apiKey required');
    }

    const endpoint = `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}/purge_cache`;

    let body: Record<string, unknown>;

    switch (request.type) {
      case 'all':
        body = { purge_everything: true };
        break;
      case 'url':
        body = { files: request.urls };
        break;
      case 'prefix':
        body = { prefixes: request.prefixes };
        break;
      case 'tag':
        body = { tags: request.tags };
        break;
      default:
        throw new Error(`Unsupported purge type: ${request.type}`);
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const result = await response.json() as { success: boolean; errors?: Array<{ message: string }> };

      if (result.success) {
        return { success: true, message: 'Cache purged successfully' };
      }

      return {
        success: false,
        message: result.errors?.[0]?.message || 'Purge failed',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Purge failed',
      };
    }
  }

  // AWS CloudFront purge
  private async purgeCloudfront(request: CDNPurgeRequest): Promise<{ success: boolean; message: string }> {
    if (!this.config.zoneId) {
      throw new Error('CloudFront distribution ID required');
    }

    // Would use AWS SDK in production
    const paths: string[] = [];

    switch (request.type) {
      case 'all':
        paths.push('/*');
        break;
      case 'url':
        paths.push(...(request.urls || []));
        break;
      case 'prefix':
        paths.push(...(request.prefixes?.map((p) => `${p}*`) || []));
        break;
      default:
        throw new Error('CloudFront only supports url, prefix, or all purge types');
    }

    // In production, use AWS SDK:
    // const cloudfront = new CloudFrontClient({ region: 'us-east-1' });
    // const command = new CreateInvalidationCommand({
    //   DistributionId: this.config.zoneId,
    //   InvalidationBatch: {
    //     Paths: { Quantity: paths.length, Items: paths },
    //     CallerReference: Date.now().toString(),
    //   },
    // });
    // await cloudfront.send(command);

    return { success: true, message: `Would invalidate ${paths.length} paths` };
  }

  // Fastly purge
  private async purgeFastly(request: CDNPurgeRequest): Promise<{ success: boolean; message: string }> {
    if (!this.config.apiKey) {
      throw new Error('Fastly API key required');
    }

    const headers: Record<string, string> = {
      'Fastly-Key': this.config.apiKey,
      'Accept': 'application/json',
    };

    try {
      if (request.type === 'all' && this.config.zoneId) {
        const response = await fetch(
          `https://api.fastly.com/service/${this.config.zoneId}/purge_all`,
          { method: 'POST', headers }
        );
        return { success: response.ok, message: 'All cache purged' };
      }

      if (request.type === 'url' && request.urls) {
        for (const url of request.urls) {
          await fetch(url, {
            method: 'PURGE',
            headers,
          });
        }
        return { success: true, message: `Purged ${request.urls.length} URLs` };
      }

      if (request.type === 'tag' && request.tags) {
        for (const tag of request.tags) {
          await fetch(
            `https://api.fastly.com/service/${this.config.zoneId}/purge/${tag}`,
            { method: 'POST', headers }
          );
        }
        return { success: true, message: `Purged ${request.tags.length} tags` };
      }

      return { success: false, message: 'Invalid purge request' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Purge failed',
      };
    }
  }

  // Bunny CDN purge
  private async purgeBunny(request: CDNPurgeRequest): Promise<{ success: boolean; message: string }> {
    if (!this.config.apiKey || !this.config.zoneId) {
      throw new Error('Bunny API key and zone ID required');
    }

    try {
      if (request.type === 'all') {
        const response = await fetch(
          `https://api.bunny.net/pullzone/${this.config.zoneId}/purgeCache`,
          {
            method: 'POST',
            headers: {
              'AccessKey': this.config.apiKey,
              'Content-Type': 'application/json',
            },
          }
        );
        return { success: response.ok, message: 'All cache purged' };
      }

      if (request.type === 'url' && request.urls) {
        for (const url of request.urls) {
          await fetch(
            `https://api.bunny.net/purge?url=${encodeURIComponent(url)}`,
            {
              method: 'POST',
              headers: { 'AccessKey': this.config.apiKey },
            }
          );
        }
        return { success: true, message: `Purged ${request.urls.length} URLs` };
      }

      return { success: false, message: 'Invalid purge request' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Purge failed',
      };
    }
  }

  // Get CDN stats
  async getStats(): Promise<CDNStats | null> {
    switch (this.config.provider) {
      case 'cloudflare':
        return this.getCloudflareStats();
      case 'bunny':
        return this.getBunnyStats();
      default:
        return null;
    }
  }

  private async getCloudflareStats(): Promise<CDNStats | null> {
    if (!this.config.zoneId || !this.config.apiKey) {
      return null;
    }

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}/analytics/dashboard?since=-1440`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
        }
      );

      const data = await response.json() as {
        result?: {
          totals?: {
            bandwidth?: { all: number };
            requests?: { all: number; cached: number };
            uniques?: { all: number };
          };
        };
      };

      const totals = data.result?.totals;

      return {
        bandwidth: totals?.bandwidth?.all || 0,
        requests: totals?.requests?.all || 0,
        cacheHitRatio: totals?.requests ? totals.requests.cached / totals.requests.all : 0,
        uniqueVisitors: totals?.uniques?.all || 0,
        topPaths: [],
      };
    } catch {
      return null;
    }
  }

  private async getBunnyStats(): Promise<CDNStats | null> {
    if (!this.config.zoneId || !this.config.apiKey) {
      return null;
    }

    try {
      const response = await fetch(
        `https://api.bunny.net/pullzone/${this.config.zoneId}/statistics`,
        {
          headers: { 'AccessKey': this.config.apiKey },
        }
      );

      const data = await response.json() as {
        TotalBandwidthUsed?: number;
        TotalRequestsServed?: number;
        CacheHitRate?: number;
      };

      return {
        bandwidth: data.TotalBandwidthUsed || 0,
        requests: data.TotalRequestsServed || 0,
        cacheHitRatio: (data.CacheHitRate || 0) / 100,
        uniqueVisitors: 0,
        topPaths: [],
      };
    } catch {
      return null;
    }
  }
}

// Cache control headers helper
export function generateCacheHeaders(options: {
  maxAge?: number;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
  staleIfError?: number;
  private?: boolean;
  noStore?: boolean;
  noCache?: boolean;
  mustRevalidate?: boolean;
  immutable?: boolean;
}): Record<string, string> {
  const directives: string[] = [];

  if (options.noStore) {
    return { 'Cache-Control': 'no-store' };
  }

  if (options.noCache) {
    directives.push('no-cache');
  }

  if (options.private) {
    directives.push('private');
  } else {
    directives.push('public');
  }

  if (options.maxAge !== undefined) {
    directives.push(`max-age=${options.maxAge}`);
  }

  if (options.sMaxAge !== undefined) {
    directives.push(`s-maxage=${options.sMaxAge}`);
  }

  if (options.staleWhileRevalidate !== undefined) {
    directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
  }

  if (options.staleIfError !== undefined) {
    directives.push(`stale-if-error=${options.staleIfError}`);
  }

  if (options.mustRevalidate) {
    directives.push('must-revalidate');
  }

  if (options.immutable) {
    directives.push('immutable');
  }

  return { 'Cache-Control': directives.join(', ') };
}

// Pre-configured cache policies
export const cachePolicies = {
  // Static assets - cache for 1 year
  static: () =>
    generateCacheHeaders({
      maxAge: 31536000,
      immutable: true,
    }),

  // API responses - cache for 1 minute with revalidation
  api: () =>
    generateCacheHeaders({
      maxAge: 0,
      sMaxAge: 60,
      staleWhileRevalidate: 60,
    }),

  // User-specific data - private, no CDN caching
  private: () =>
    generateCacheHeaders({
      private: true,
      maxAge: 0,
      noCache: true,
    }),

  // Public pages - cache for 5 minutes
  page: () =>
    generateCacheHeaders({
      maxAge: 300,
      sMaxAge: 600,
      staleWhileRevalidate: 300,
    }),

  // Real-time data - no caching
  realtime: () =>
    generateCacheHeaders({
      noStore: true,
    }),

  // Images - cache for 1 day
  images: () =>
    generateCacheHeaders({
      maxAge: 86400,
      sMaxAge: 604800,
      staleWhileRevalidate: 86400,
    }),
};

// Edge caching utilities
export class EdgeCache {
  private cacheTag: string;

  constructor(cacheTag: string) {
    this.cacheTag = cacheTag;
  }

  // Generate cache tag header
  getCacheTagHeader(): Record<string, string> {
    return { 'Cache-Tag': this.cacheTag };
  }

  // Generate surrogate key header (for Fastly)
  getSurrogateKeyHeader(): Record<string, string> {
    return { 'Surrogate-Key': this.cacheTag };
  }

  // Generate combined headers
  getHeaders(maxAge: number = 3600): Record<string, string> {
    return {
      ...generateCacheHeaders({ maxAge, sMaxAge: maxAge * 2 }),
      'Cache-Tag': this.cacheTag,
      'Surrogate-Key': this.cacheTag,
    };
  }

  // Create cache tag for an entity
  static forEntity(type: string, id: string): EdgeCache {
    return new EdgeCache(`${type}:${id}`);
  }

  // Create cache tag for a collection
  static forCollection(type: string): EdgeCache {
    return new EdgeCache(`${type}:list`);
  }

  // Create cache tags for workspace data
  static forWorkspace(workspaceId: string): EdgeCache {
    return new EdgeCache(`workspace:${workspaceId}`);
  }

  // Create cache tags for campaign data
  static forCampaign(campaignId: string): EdgeCache {
    return new EdgeCache(`campaign:${campaignId}`);
  }
}

// CDN configuration factory
export function createCDN(provider: CDNConfig['provider'], options: Partial<CDNConfig> = {}): CDNManager {
  const config: CDNConfig = {
    provider,
    ...options,
  };

  // Load from environment
  switch (provider) {
    case 'cloudflare':
      config.zoneId = config.zoneId || process.env.CLOUDFLARE_ZONE_ID;
      config.apiKey = config.apiKey || process.env.CLOUDFLARE_API_TOKEN;
      break;
    case 'bunny':
      config.zoneId = config.zoneId || process.env.BUNNY_PULL_ZONE_ID;
      config.apiKey = config.apiKey || process.env.BUNNY_API_KEY;
      break;
    case 'fastly':
      config.zoneId = config.zoneId || process.env.FASTLY_SERVICE_ID;
      config.apiKey = config.apiKey || process.env.FASTLY_API_KEY;
      break;
    case 'aws-cloudfront':
      config.zoneId = config.zoneId || process.env.CLOUDFRONT_DISTRIBUTION_ID;
      break;
  }

  return new CDNManager(config);
}

// Auto-detect CDN from environment
export function getDefaultCDN(): CDNManager | null {
  if (process.env.CLOUDFLARE_ZONE_ID) {
    return createCDN('cloudflare');
  }

  if (process.env.BUNNY_PULL_ZONE_ID) {
    return createCDN('bunny');
  }

  if (process.env.FASTLY_SERVICE_ID) {
    return createCDN('fastly');
  }

  if (process.env.CLOUDFRONT_DISTRIBUTION_ID) {
    return createCDN('aws-cloudfront');
  }

  return null;
}

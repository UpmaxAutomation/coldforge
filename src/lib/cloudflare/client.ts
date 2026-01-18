// Cloudflare API Client
// Handles all Cloudflare API interactions for domains and DNS

import type {
  CloudflareConfig,
  CloudflareAPIResponse,
  Zone,
  DNSRecord,
  DNSRecordResponse,
  CloudflareError,
} from './types';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

export class CloudflareClient {
  private apiToken: string;
  private accountId: string;

  constructor(config: CloudflareConfig) {
    this.apiToken = config.apiToken;
    this.accountId = config.accountId;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<CloudflareAPIResponse<T>> {
    const url = `${CLOUDFLARE_API_BASE}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new CloudflareAPIError(
        data.errors?.[0]?.message || 'Cloudflare API error',
        data.errors || []
      );
    }

    return data as CloudflareAPIResponse<T>;
  }

  // ============================================
  // Zone Management
  // ============================================

  async listZones(): Promise<Zone[]> {
    const response = await this.request<Zone[]>(`/zones?account.id=${this.accountId}`);
    return response.result;
  }

  async getZone(zoneId: string): Promise<Zone> {
    const response = await this.request<Zone>(`/zones/${zoneId}`);
    return response.result;
  }

  async getZoneByDomain(domain: string): Promise<Zone | null> {
    const response = await this.request<Zone[]>(`/zones?name=${domain}&account.id=${this.accountId}`);
    return response.result[0] || null;
  }

  async createZone(domain: string): Promise<Zone> {
    const response = await this.request<Zone>('/zones', {
      method: 'POST',
      body: JSON.stringify({
        name: domain,
        account: { id: this.accountId },
        type: 'full',
      }),
    });
    return response.result;
  }

  async deleteZone(zoneId: string): Promise<boolean> {
    await this.request(`/zones/${zoneId}`, { method: 'DELETE' });
    return true;
  }

  // ============================================
  // DNS Records
  // ============================================

  async listDNSRecords(zoneId: string, type?: string): Promise<DNSRecord[]> {
    const typeParam = type ? `&type=${type}` : '';
    const response = await this.request<DNSRecord[]>(
      `/zones/${zoneId}/dns_records?per_page=100${typeParam}`
    );
    return response.result.map(r => ({
      id: r.id,
      type: r.type as DNSRecord['type'],
      name: r.name,
      content: r.content,
      ttl: r.ttl,
      priority: r.priority,
      proxied: r.proxied,
      zoneId,
    }));
  }

  async createDNSRecord(zoneId: string, record: DNSRecord): Promise<DNSRecordResponse> {
    const response = await this.request<DNSRecordResponse['result']>(
      `/zones/${zoneId}/dns_records`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: record.type,
          name: record.name,
          content: record.content,
          ttl: record.ttl || 3600,
          priority: record.priority,
          proxied: record.proxied || false,
        }),
      }
    );

    return {
      success: true,
      result: response.result,
    };
  }

  async updateDNSRecord(
    zoneId: string,
    recordId: string,
    record: Partial<DNSRecord>
  ): Promise<DNSRecordResponse> {
    const response = await this.request<DNSRecordResponse['result']>(
      `/zones/${zoneId}/dns_records/${recordId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(record),
      }
    );

    return {
      success: true,
      result: response.result,
    };
  }

  async deleteDNSRecord(zoneId: string, recordId: string): Promise<boolean> {
    await this.request(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'DELETE',
    });
    return true;
  }

  async getDNSRecord(zoneId: string, recordId: string): Promise<DNSRecord | null> {
    try {
      const response = await this.request<DNSRecord>(
        `/zones/${zoneId}/dns_records/${recordId}`
      );
      return response.result;
    } catch {
      return null;
    }
  }

  // ============================================
  // Domain Registration (Cloudflare Registrar)
  // ============================================

  async checkDomainAvailability(domain: string): Promise<{
    available: boolean;
    premium: boolean;
    price?: number;
  }> {
    try {
      const response = await this.request<{
        available: boolean;
        premium: boolean;
        pricing?: { registration: { price: number } };
      }>(`/accounts/${this.accountId}/registrar/domains/${domain}/available`);

      return {
        available: response.result.available,
        premium: response.result.premium,
        price: response.result.pricing?.registration?.price,
      };
    } catch (error) {
      // Domain might already be registered
      return { available: false, premium: false };
    }
  }

  async registerDomain(
    domain: string,
    options: {
      autoRenew?: boolean;
      privacy?: boolean;
      years?: number;
    } = {}
  ): Promise<{
    success: boolean;
    domainId?: string;
    error?: string;
  }> {
    try {
      const response = await this.request<{ id: string }>(
        `/accounts/${this.accountId}/registrar/domains`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: domain,
            auto_renew: options.autoRenew ?? true,
            privacy: options.privacy ?? true,
            years: options.years ?? 1,
          }),
        }
      );

      return {
        success: true,
        domainId: response.result.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  }

  async getDomain(domain: string): Promise<{
    id: string;
    name: string;
    status: string;
    expiresAt: string;
    autoRenew: boolean;
    locked: boolean;
  } | null> {
    try {
      const response = await this.request<{
        id: string;
        name: string;
        status: string;
        expires_at: string;
        auto_renew: boolean;
        locked: boolean;
      }>(`/accounts/${this.accountId}/registrar/domains/${domain}`);

      return {
        id: response.result.id,
        name: response.result.name,
        status: response.result.status,
        expiresAt: response.result.expires_at,
        autoRenew: response.result.auto_renew,
        locked: response.result.locked,
      };
    } catch {
      return null;
    }
  }

  async listRegisteredDomains(): Promise<Array<{
    id: string;
    name: string;
    status: string;
    expiresAt: string;
  }>> {
    const response = await this.request<Array<{
      id: string;
      name: string;
      status: string;
      expires_at: string;
    }>>(`/accounts/${this.accountId}/registrar/domains`);

    return response.result.map(d => ({
      id: d.id,
      name: d.name,
      status: d.status,
      expiresAt: d.expires_at,
    }));
  }

  async updateDomainSettings(
    domain: string,
    settings: {
      autoRenew?: boolean;
      locked?: boolean;
    }
  ): Promise<boolean> {
    await this.request(`/accounts/${this.accountId}/registrar/domains/${domain}`, {
      method: 'PUT',
      body: JSON.stringify({
        auto_renew: settings.autoRenew,
        locked: settings.locked,
      }),
    });
    return true;
  }

  // ============================================
  // Email Routing
  // ============================================

  async enableEmailRouting(zoneId: string): Promise<boolean> {
    await this.request(`/zones/${zoneId}/email/routing/enable`, {
      method: 'POST',
    });
    return true;
  }

  async createEmailForwardingRule(
    zoneId: string,
    fromAddress: string,
    toAddress: string
  ): Promise<{ id: string }> {
    const response = await this.request<{ id: string }>(
      `/zones/${zoneId}/email/routing/rules`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `Forward ${fromAddress}`,
          enabled: true,
          matchers: [{ type: 'literal', field: 'to', value: fromAddress }],
          actions: [{ type: 'forward', value: [toAddress] }],
        }),
      }
    );
    return { id: response.result.id };
  }

  // ============================================
  // SSL/TLS
  // ============================================

  async getSSLSettings(zoneId: string): Promise<{
    mode: 'off' | 'flexible' | 'full' | 'strict';
  }> {
    const response = await this.request<{ value: string }>(
      `/zones/${zoneId}/settings/ssl`
    );
    return { mode: response.result.value as 'off' | 'flexible' | 'full' | 'strict' };
  }

  async setSSLMode(
    zoneId: string,
    mode: 'off' | 'flexible' | 'full' | 'strict'
  ): Promise<boolean> {
    await this.request(`/zones/${zoneId}/settings/ssl`, {
      method: 'PATCH',
      body: JSON.stringify({ value: mode }),
    });
    return true;
  }
}

// Custom error class
export class CloudflareAPIError extends Error {
  public errors: CloudflareError[];

  constructor(message: string, errors: CloudflareError[]) {
    super(message);
    this.name = 'CloudflareAPIError';
    this.errors = errors;
  }
}

// Singleton instance
let cloudflareClient: CloudflareClient | null = null;

export function getCloudflareClient(): CloudflareClient {
  if (!cloudflareClient) {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!apiToken || !accountId) {
      throw new Error('Cloudflare credentials not configured');
    }

    cloudflareClient = new CloudflareClient({
      apiToken,
      accountId,
    });
  }
  return cloudflareClient;
}

export function initializeCloudflareClient(config: CloudflareConfig): CloudflareClient {
  cloudflareClient = new CloudflareClient(config);
  return cloudflareClient;
}

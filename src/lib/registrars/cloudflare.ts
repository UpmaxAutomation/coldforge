import type {
  DomainSearchResult,
  DomainPurchaseOptions,
  DomainPurchaseResult,
  DnsRecord,
  RegistrarClient,
} from './types'
import { circuitBreakers } from '@/lib/circuit-breaker/services'
import { CircuitOpenError } from '@/lib/circuit-breaker'
import { retryApi, isRetryableStatusCode } from '@/lib/retry'

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'

interface CloudflareConfig {
  apiToken: string
  accountId: string
}

export class CloudflareRegistrar implements RegistrarClient {
  name = 'cloudflare'
  private config: CloudflareConfig

  constructor(config: CloudflareConfig) {
    this.config = config
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Use circuit breaker for all Cloudflare API calls
    // Retry logic is inside the circuit breaker to handle transient failures
    // before they trip the circuit
    return circuitBreakers.cloudflare.execute(async () => {
      return retryApi(async () => {
        const response = await fetch(`${CLOUDFLARE_API_BASE}${endpoint}`, {
          ...options,
          headers: {
            'Authorization': `Bearer ${this.config.apiToken}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
        })

        // Check for retryable HTTP status codes
        if (!response.ok && isRetryableStatusCode(response.status)) {
          const text = await response.text()
          throw new Error(`HTTP ${response.status}: ${text}`)
        }

        const data = await response.json()

        if (!data.success) {
          const errors = data.errors?.map((e: { message: string }) => e.message).join(', ')
          throw new Error(errors || 'Cloudflare API error')
        }

        return data.result
      })
    })
  }

  // Check if the circuit breaker is allowing requests
  isAvailable(): boolean {
    return circuitBreakers.cloudflare.isAvailable()
  }

  // Get retry time if circuit is open
  getRetryAfter(): number {
    return circuitBreakers.cloudflare.getRetryAfter()
  }

  // Check if an error is a circuit breaker error
  static isCircuitOpenError(error: unknown): error is CircuitOpenError {
    return error instanceof CircuitOpenError
  }

  async checkAvailability(domain: string): Promise<DomainSearchResult> {
    try {
      const result = await this.request<{
        name: string
        available: boolean
        can_register: boolean
        pricing?: {
          registration_price: number
          renewal_price: number
          currency: string
        }
      }>(
        `/accounts/${this.config.accountId}/registrar/domains/${domain}/available`
      )

      return {
        domain: result.name,
        available: result.available && result.can_register,
        price: result.pricing?.registration_price,
        currency: result.pricing?.currency || 'USD',
        period: 1,
        premium: false, // Cloudflare doesn't support premium domains
      }
    } catch (error) {
      console.error('Cloudflare availability check failed:', error)
      return {
        domain,
        available: false,
      }
    }
  }

  async searchDomains(query: string, tlds: string[] = ['com', 'net', 'org', 'io', 'co']): Promise<DomainSearchResult[]> {
    const results: DomainSearchResult[] = []

    // Check availability for each TLD in parallel
    const checks = tlds.map(tld => {
      const fullDomain = query.includes('.') ? query : `${query}.${tld}`
      return this.checkAvailability(fullDomain)
    })

    const checkResults = await Promise.all(checks)
    results.push(...checkResults)

    return results
  }

  async purchaseDomain(options: DomainPurchaseOptions): Promise<DomainPurchaseResult> {
    try {
      const result = await this.request<{
        name: string
        status: string
        expires_at: string
      }>(
        `/accounts/${this.config.accountId}/registrar/domains`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: options.domain,
            auto_renew: options.autoRenew ?? true,
            // Cloudflare uses their own nameservers by default
          }),
        }
      )

      return {
        success: true,
        domain: result.name,
        registrar: this.name,
        expiresAt: result.expires_at,
      }
    } catch (error) {
      return {
        success: false,
        domain: options.domain,
        registrar: this.name,
        error: error instanceof Error ? error.message : 'Purchase failed',
      }
    }
  }

  async createDnsZone(domain: string): Promise<{ zoneId: string }> {
    const result = await this.request<{ id: string }>(
      '/zones',
      {
        method: 'POST',
        body: JSON.stringify({
          name: domain,
          account: { id: this.config.accountId },
          type: 'full',
        }),
      }
    )

    return { zoneId: result.id }
  }

  async addDnsRecord(zoneId: string, record: DnsRecord): Promise<{ recordId: string }> {
    const result = await this.request<{ id: string }>(
      `/zones/${zoneId}/dns_records`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: record.type,
          name: record.name,
          content: record.content,
          ttl: record.ttl || 1, // 1 = auto
          priority: record.priority,
          proxied: record.proxied ?? false,
        }),
      }
    )

    return { recordId: result.id }
  }

  async updateDnsRecord(zoneId: string, recordId: string, record: DnsRecord): Promise<void> {
    await this.request(
      `/zones/${zoneId}/dns_records/${recordId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          type: record.type,
          name: record.name,
          content: record.content,
          ttl: record.ttl || 1,
          priority: record.priority,
          proxied: record.proxied ?? false,
        }),
      }
    )
  }

  async deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
    await this.request(
      `/zones/${zoneId}/dns_records/${recordId}`,
      { method: 'DELETE' }
    )
  }

  async listDnsRecords(zoneId: string): Promise<(DnsRecord & { id: string })[]> {
    const results = await this.request<Array<{
      id: string
      type: string
      name: string
      content: string
      ttl: number
      priority?: number
      proxied: boolean
    }>>(`/zones/${zoneId}/dns_records`)

    return results.map(r => ({
      id: r.id,
      type: r.type as DnsRecord['type'],
      name: r.name,
      content: r.content,
      ttl: r.ttl,
      priority: r.priority,
      proxied: r.proxied,
    }))
  }

  // Get zone ID for an existing domain
  async getZoneId(domain: string): Promise<string | null> {
    try {
      const results = await this.request<Array<{ id: string; name: string }>>(
        `/zones?name=${domain}`
      )
      return results[0]?.id || null
    } catch {
      return null
    }
  }
}

// Factory function
export function createCloudflareClient(apiToken: string, accountId: string): CloudflareRegistrar {
  return new CloudflareRegistrar({ apiToken, accountId })
}

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

const PORKBUN_API_BASE = 'https://porkbun.com/api/json/v3'

interface PorkbunConfig {
  apiKey: string
  secretApiKey: string
}

export class PorkbunRegistrar implements RegistrarClient {
  name = 'porkbun'
  private config: PorkbunConfig

  constructor(config: PorkbunConfig) {
    this.config = config
  }

  private async request<T>(endpoint: string, body: Record<string, unknown> = {}): Promise<T> {
    // Use circuit breaker for all Porkbun API calls
    // Retry logic is inside the circuit breaker to handle transient failures
    // before they trip the circuit
    return circuitBreakers.porkbun.execute(async () => {
      return retryApi(async () => {
        const response = await fetch(`${PORKBUN_API_BASE}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            apikey: this.config.apiKey,
            secretapikey: this.config.secretApiKey,
            ...body,
          }),
        })

        // Check for retryable HTTP status codes
        if (!response.ok && isRetryableStatusCode(response.status)) {
          const text = await response.text()
          throw new Error(`HTTP ${response.status}: ${text}`)
        }

        const data = await response.json()

        if (data.status !== 'SUCCESS') {
          throw new Error(data.message || 'Porkbun API error')
        }

        return data
      })
    })
  }

  // Check if the circuit breaker is allowing requests
  isAvailable(): boolean {
    return circuitBreakers.porkbun.isAvailable()
  }

  // Get retry time if circuit is open
  getRetryAfter(): number {
    return circuitBreakers.porkbun.getRetryAfter()
  }

  // Check if an error is a circuit breaker error
  static isCircuitOpenError(error: unknown): error is CircuitOpenError {
    return error instanceof CircuitOpenError
  }

  async checkAvailability(domain: string): Promise<DomainSearchResult> {
    try {
      const data = await this.request<{
        status: string
        avail: string
      }>(`/domain/check/${domain}`)

      // Get pricing
      let price: number | undefined
      try {
        const priceData = await this.request<{
          pricing: Record<string, { registration: string }>
        }>('/pricing/get')
        const tld = domain.split('.').pop() || ''
        price = parseFloat(priceData.pricing[tld]?.registration || '0')
      } catch {
        // Pricing lookup failed, continue without it
      }

      return {
        domain,
        available: data.avail === 'yes',
        price,
        currency: 'USD',
        period: 1,
      }
    } catch (error) {
      console.error('Porkbun availability check failed:', error)
      return { domain, available: false }
    }
  }

  async searchDomains(query: string, tlds: string[] = ['com', 'net', 'org', 'io', 'co']): Promise<DomainSearchResult[]> {
    const results: DomainSearchResult[] = []

    // Check each TLD (Porkbun doesn't have bulk check)
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
      const data = await this.request<{
        domain: string
        status: string
      }>(`/domain/create/${options.domain}`, {
        years: options.years || 1,
        // Porkbun can use account default contacts
      })

      // Calculate expiry
      const years = options.years || 1
      const expiresAt = new Date()
      expiresAt.setFullYear(expiresAt.getFullYear() + years)

      return {
        success: true,
        domain: data.domain || options.domain,
        registrar: this.name,
        expiresAt: expiresAt.toISOString(),
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

  async addDnsRecord(zoneId: string, record: DnsRecord): Promise<{ recordId: string }> {
    // In Porkbun, zoneId is the domain name
    const domain = zoneId
    const subdomain = record.name === domain || record.name === '@'
      ? ''
      : record.name.replace(`.${domain}`, '')

    const data = await this.request<{ id: number }>(`/dns/create/${domain}`, {
      type: record.type,
      name: subdomain,
      content: record.content,
      ttl: record.ttl?.toString() || '600',
      prio: record.priority?.toString(),
    })

    return { recordId: String(data.id) }
  }

  async updateDnsRecord(zoneId: string, recordId: string, record: DnsRecord): Promise<void> {
    const domain = zoneId
    const subdomain = record.name === domain || record.name === '@'
      ? ''
      : record.name.replace(`.${domain}`, '')

    await this.request(`/dns/edit/${domain}/${recordId}`, {
      type: record.type,
      name: subdomain,
      content: record.content,
      ttl: record.ttl?.toString() || '600',
      prio: record.priority?.toString(),
    })
  }

  async deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
    const domain = zoneId
    await this.request(`/dns/delete/${domain}/${recordId}`)
  }

  async listDnsRecords(zoneId: string): Promise<(DnsRecord & { id: string })[]> {
    const domain = zoneId

    const data = await this.request<{
      records: Array<{
        id: string
        type: string
        name: string
        content: string
        ttl: string
        prio?: string
      }>
    }>(`/dns/retrieve/${domain}`)

    return data.records.map(r => ({
      id: r.id,
      type: r.type as DnsRecord['type'],
      name: r.name || domain,
      content: r.content,
      ttl: parseInt(r.ttl, 10),
      priority: r.prio ? parseInt(r.prio, 10) : undefined,
    }))
  }

  // Get nameservers for a domain
  async getNameservers(domain: string): Promise<string[]> {
    const data = await this.request<{
      ns: string[]
    }>(`/domain/getNs/${domain}`)

    return data.ns
  }

  // Update nameservers
  async setNameservers(domain: string, nameservers: string[]): Promise<void> {
    await this.request(`/domain/updateNs/${domain}`, {
      ns: nameservers,
    })
  }
}

// Factory function
export function createPorkbunClient(apiKey: string, secretApiKey: string): PorkbunRegistrar {
  return new PorkbunRegistrar({ apiKey, secretApiKey })
}

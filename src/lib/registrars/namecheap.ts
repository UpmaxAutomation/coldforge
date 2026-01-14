import type {
  DomainSearchResult,
  DomainPurchaseOptions,
  DomainPurchaseResult,
  RegistrarClient,
} from './types'

const NAMECHEAP_API_BASE = 'https://api.namecheap.com/xml.response'
const NAMECHEAP_SANDBOX_API = 'https://api.sandbox.namecheap.com/xml.response'

interface NamecheapConfig {
  apiUser: string
  apiKey: string
  username: string
  clientIp: string
  sandbox?: boolean
}

export class NamecheapRegistrar implements RegistrarClient {
  name = 'namecheap'
  private config: NamecheapConfig

  constructor(config: NamecheapConfig) {
    this.config = config
  }

  private getBaseUrl(): string {
    return this.config.sandbox ? NAMECHEAP_SANDBOX_API : NAMECHEAP_API_BASE
  }

  private buildUrl(command: string, params: Record<string, string> = {}): string {
    const baseParams = {
      ApiUser: this.config.apiUser,
      ApiKey: this.config.apiKey,
      UserName: this.config.username,
      ClientIp: this.config.clientIp,
      Command: command,
      ...params,
    }

    const queryString = Object.entries(baseParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    return `${this.getBaseUrl()}?${queryString}`
  }

  private async request(command: string, params: Record<string, string> = {}): Promise<string> {
    const url = this.buildUrl(command, params)
    const response = await fetch(url)
    const text = await response.text()

    // Check for API errors in XML response
    if (text.includes('<Status>ERROR</Status>')) {
      const errorMatch = text.match(/<Error[^>]*>([^<]+)<\/Error>/)
      throw new Error(errorMatch?.[1] || 'Namecheap API error')
    }

    return text
  }

  private parseXmlValue(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`))
    return match?.[1] || null
  }

  async checkAvailability(domain: string): Promise<DomainSearchResult> {
    try {
      const xml = await this.request('namecheap.domains.check', {
        DomainList: domain,
      })

      const available = xml.includes('Available="true"')
      const premiumMatch = xml.match(/IsPremiumName="(\w+)"/)
      const priceMatch = xml.match(/PremiumRegistrationPrice="([\d.]+)"/)

      return {
        domain,
        available,
        premium: premiumMatch?.[1] === 'true',
        price: priceMatch ? parseFloat(priceMatch[1] ?? '0') : undefined,
        currency: 'USD',
        period: 1,
      }
    } catch (error) {
      console.error('Namecheap availability check failed:', error)
      return { domain, available: false }
    }
  }

  async searchDomains(query: string, tlds: string[] = ['com', 'net', 'org', 'io', 'co']): Promise<DomainSearchResult[]> {
    const domains = tlds.map(tld =>
      query.includes('.') ? query : `${query}.${tld}`
    )

    try {
      const xml = await this.request('namecheap.domains.check', {
        DomainList: domains.join(','),
      })

      const results: DomainSearchResult[] = []
      const domainMatches = xml.matchAll(/<DomainCheckResult[^>]*Domain="([^"]+)"[^>]*Available="(\w+)"[^>]*>/g)

      for (const match of domainMatches) {
        results.push({
          domain: match[1] ?? '',
          available: match[2] === 'true',
          currency: 'USD',
          period: 1,
        })
      }

      return results
    } catch (error) {
      console.error('Namecheap search failed:', error)
      return domains.map(d => ({ domain: d, available: false }))
    }
  }

  async purchaseDomain(options: DomainPurchaseOptions): Promise<DomainPurchaseResult> {
    try {
      const [_sld, _tld] = options.domain.split('.')

      const params: Record<string, string> = {
        DomainName: options.domain,
        Years: String(options.years || 1),
        // Registrant info would typically come from org settings
        RegistrantFirstName: 'Admin',
        RegistrantLastName: 'User',
        RegistrantAddress1: '123 Main St',
        RegistrantCity: 'Anytown',
        RegistrantStateProvince: 'CA',
        RegistrantPostalCode: '12345',
        RegistrantCountry: 'US',
        RegistrantPhone: '+1.5555555555',
        RegistrantEmailAddress: 'admin@example.com',
        // Copy for Tech, Admin, AuxBilling
        TechFirstName: 'Admin',
        TechLastName: 'User',
        TechAddress1: '123 Main St',
        TechCity: 'Anytown',
        TechStateProvince: 'CA',
        TechPostalCode: '12345',
        TechCountry: 'US',
        TechPhone: '+1.5555555555',
        TechEmailAddress: 'admin@example.com',
        AdminFirstName: 'Admin',
        AdminLastName: 'User',
        AdminAddress1: '123 Main St',
        AdminCity: 'Anytown',
        AdminStateProvince: 'CA',
        AdminPostalCode: '12345',
        AdminCountry: 'US',
        AdminPhone: '+1.5555555555',
        AdminEmailAddress: 'admin@example.com',
        AuxBillingFirstName: 'Admin',
        AuxBillingLastName: 'User',
        AuxBillingAddress1: '123 Main St',
        AuxBillingCity: 'Anytown',
        AuxBillingStateProvince: 'CA',
        AuxBillingPostalCode: '12345',
        AuxBillingCountry: 'US',
        AuxBillingPhone: '+1.5555555555',
        AuxBillingEmailAddress: 'admin@example.com',
      }

      if (options.nameservers && options.nameservers.length > 0) {
        params.Nameservers = options.nameservers.join(',')
      }

      if (options.privacy) {
        params.AddFreeWhoisguard = 'yes'
        params.WGEnabled = 'yes'
      }

      const xml = await this.request('namecheap.domains.create', params)

      const domainId = this.parseXmlValue(xml, 'DomainID')
      const registered = xml.includes('Registered="true"')

      if (!registered) {
        throw new Error('Domain registration failed')
      }

      // Calculate expiry
      const years = options.years || 1
      const expiresAt = new Date()
      expiresAt.setFullYear(expiresAt.getFullYear() + years)

      return {
        success: true,
        domain: options.domain,
        registrar: this.name,
        orderId: domainId || undefined,
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

  // Namecheap DNS management
  async setNameservers(domain: string, nameservers: string[]): Promise<void> {
    const [sld, tld] = domain.split('.')

    await this.request('namecheap.domains.dns.setCustom', {
      SLD: sld ?? '',
      TLD: tld ?? '',
      Nameservers: nameservers.join(','),
    })
  }

  async getNameservers(domain: string): Promise<string[]> {
    const [sld, tld] = domain.split('.')

    const xml = await this.request('namecheap.domains.dns.getList', {
      SLD: sld ?? '',
      TLD: tld ?? '',
    })

    const nameservers: string[] = []
    const nsMatches = xml.matchAll(/<Nameserver>([^<]+)<\/Nameserver>/g)
    for (const match of nsMatches) {
      if (match[1]) nameservers.push(match[1])
    }

    return nameservers
  }
}

// Factory function
export function createNamecheapClient(
  apiUser: string,
  apiKey: string,
  username: string,
  clientIp: string,
  sandbox = false
): NamecheapRegistrar {
  return new NamecheapRegistrar({ apiUser, apiKey, username, clientIp, sandbox })
}

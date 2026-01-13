// Common types for registrar integrations

export interface DomainSearchResult {
  domain: string
  available: boolean
  price?: number
  currency?: string
  period?: number // years
  premium?: boolean
}

export interface DomainPurchaseOptions {
  domain: string
  years?: number
  nameservers?: string[]
  privacy?: boolean
  autoRenew?: boolean
}

export interface DomainPurchaseResult {
  success: boolean
  domain: string
  registrar: string
  orderId?: string
  expiresAt?: string
  error?: string
}

export interface DnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV'
  name: string
  content: string
  ttl?: number
  priority?: number // For MX records
  proxied?: boolean // For Cloudflare
}

export interface RegistrarClient {
  name: string

  // Domain operations
  checkAvailability(domain: string): Promise<DomainSearchResult>
  searchDomains(query: string, tlds?: string[]): Promise<DomainSearchResult[]>
  purchaseDomain(options: DomainPurchaseOptions): Promise<DomainPurchaseResult>

  // DNS operations (if supported)
  createDnsZone?(domain: string): Promise<{ zoneId: string }>
  addDnsRecord?(zoneId: string, record: DnsRecord): Promise<{ recordId: string }>
  updateDnsRecord?(zoneId: string, recordId: string, record: DnsRecord): Promise<void>
  deleteDnsRecord?(zoneId: string, recordId: string): Promise<void>
  listDnsRecords?(zoneId: string): Promise<(DnsRecord & { id: string })[]>
}

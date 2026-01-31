import { getCloudflareClient } from '../cloudflare/client'
import { createAdminClient } from '../supabase/admin'

export interface DomainPurchaseRequest {
  domain: string
  registrar: 'cloudflare' | 'namecheap' | 'porkbun'
  years: number
  orgId: string
  autoRenew?: boolean
  privacy?: boolean
}

export interface PurchaseResult {
  success: boolean
  domain: string
  registrar: string
  expiresAt?: Date
  domainId?: string
  zoneId?: string
  error?: string
}

export interface DomainAvailability {
  available: boolean
  price?: number
  currency?: string
  premium?: boolean
}

// TLD pricing fallback (Cloudflare API returns actual pricing, this is fallback)
const TLD_PRICES: Record<string, number> = {
  com: 10.11,
  net: 10.11,
  org: 9.93,
  io: 33.98,
  co: 11.99,
  dev: 12.00,
  app: 14.00,
  ai: 89.00,
}

export async function checkDomainAvailability(domain: string): Promise<DomainAvailability> {
  // Validate domain format
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/
  if (!domainRegex.test(domain)) {
    return { available: false }
  }

  try {
    const cloudflare = getCloudflareClient()
    const result = await cloudflare.checkDomainAvailability(domain)

    // Use API price if available, fallback to TLD price table
    const tld = domain.split('.').pop()?.toLowerCase()
    const fallbackPrice = TLD_PRICES[tld || 'com'] || 12.99

    return {
      available: result.available,
      price: result.price || fallbackPrice,
      currency: 'USD',
      premium: result.premium,
    }
  } catch (error) {
    console.error(`[Domain] Availability check failed for ${domain}:`, error)
    // Return unavailable on error to be safe
    return { available: false }
  }
}

export async function purchaseDomain(request: DomainPurchaseRequest): Promise<PurchaseResult> {
  // Validate input
  if (!request.domain || !request.orgId) {
    return {
      success: false,
      domain: request.domain,
      registrar: request.registrar,
      error: 'Missing required fields: domain and orgId are required',
    }
  }

  if (request.years < 1 || request.years > 10) {
    return {
      success: false,
      domain: request.domain,
      registrar: request.registrar,
      error: 'Years must be between 1 and 10',
    }
  }

  // Check availability first
  const availability = await checkDomainAvailability(request.domain)
  if (!availability.available) {
    return {
      success: false,
      domain: request.domain,
      registrar: request.registrar,
      error: 'Domain is not available for registration',
    }
  }

  try {
    const cloudflare = getCloudflareClient()
    const supabase = createAdminClient()

    console.log(`[Domain] Registering ${request.domain} via ${request.registrar}...`)

    // Step 1: Register the domain via Cloudflare Registrar
    const registrationResult = await cloudflare.registerDomain(request.domain, {
      autoRenew: request.autoRenew ?? true,
      privacy: request.privacy ?? true,
      years: request.years,
    })

    if (!registrationResult.success) {
      return {
        success: false,
        domain: request.domain,
        registrar: request.registrar,
        error: registrationResult.error || 'Registration failed',
      }
    }

    console.log(`[Domain] ${request.domain} registered successfully`)

    // Step 2: Get or create the DNS zone
    let zone = await cloudflare.getZoneByDomain(request.domain)
    if (!zone) {
      console.log(`[Domain] Creating DNS zone for ${request.domain}...`)
      zone = await cloudflare.createZone(request.domain)
    }

    // Calculate expiration date
    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + request.years)

    // Step 3: Store domain record in database
    const { data: domainRecord, error: dbError } = await supabase
      .from('domains')
      .insert({
        organization_id: request.orgId,
        domain: request.domain,
        registrar: request.registrar,
        cloudflare_zone_id: zone.id,
        cloudflare_domain_id: registrationResult.domainId,
        status: 'active',
        expires_at: expiresAt.toISOString(),
        auto_renew: request.autoRenew ?? true,
        price_paid: availability.price,
        years_purchased: request.years,
        // DNS flags - will be set by orchestrator
        spf_configured: false,
        dkim_configured: false,
        dmarc_configured: false,
        health_status: 'pending',
      })
      .select()
      .single()

    if (dbError) {
      console.error(`[Domain] Failed to store domain record:`, dbError)
      // Domain is registered but DB failed - log warning but don't fail
      console.warn(`[Domain] Domain ${request.domain} registered but DB insert failed`)
    }

    console.log(`[Domain] ${request.domain} purchase complete, zone ID: ${zone.id}`)

    return {
      success: true,
      domain: request.domain,
      registrar: request.registrar,
      expiresAt,
      domainId: domainRecord?.id || registrationResult.domainId,
      zoneId: zone.id,
    }
  } catch (error) {
    console.error(`[Domain] Purchase failed for ${request.domain}:`, error)
    return {
      success: false,
      domain: request.domain,
      registrar: request.registrar,
      error: error instanceof Error ? error.message : 'Purchase failed',
    }
  }
}

// Cloudflare-specific domain management functions
export async function configureDomainDns(zoneId: string, records: DnsRecord[]): Promise<{
  success: boolean
  created: string[]
  errors: string[]
}> {
  const cloudflare = getCloudflareClient()
  const created: string[] = []
  const errors: string[] = []

  for (const record of records) {
    try {
      const result = await cloudflare.createDNSRecord(zoneId, {
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl || 3600,
        priority: record.priority,
        proxied: false,
      })

      if (result.success) {
        created.push(`${record.type}:${record.name}`)
        console.log(`[DNS] Created ${record.type} record for ${record.name}`)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`${record.type}:${record.name} - ${msg}`)
      console.error(`[DNS] Failed to create ${record.type} record for ${record.name}:`, error)
    }
  }

  return {
    success: errors.length === 0,
    created,
    errors,
  }
}

export interface DnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS'
  name: string
  content: string
  ttl?: number
  priority?: number
}

export async function getDomainStatus(domain: string): Promise<DomainStatus> {
  try {
    const cloudflare = getCloudflareClient()
    const domainInfo = await cloudflare.getDomain(domain)

    if (!domainInfo) {
      // Domain not found in registrar, check database
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('domains')
        .select('*')
        .eq('domain', domain)
        .single()

      if (data) {
        return {
          domain,
          status: data.status as DomainStatus['status'],
          autoRenew: data.auto_renew,
          locked: true,
          expiresAt: new Date(data.expires_at),
          nameservers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
        }
      }

      throw new Error(`Domain ${domain} not found`)
    }

    return {
      domain: domainInfo.name,
      status: domainInfo.status as DomainStatus['status'],
      autoRenew: domainInfo.autoRenew,
      locked: domainInfo.locked,
      expiresAt: new Date(domainInfo.expiresAt),
      nameservers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
    }
  } catch (error) {
    console.error(`[Domain] Failed to get status for ${domain}:`, error)
    throw error
  }
}

export interface DomainStatus {
  domain: string
  status: 'active' | 'pending' | 'expired' | 'redemption'
  autoRenew: boolean
  locked: boolean
  expiresAt: Date
  nameservers: string[]
}

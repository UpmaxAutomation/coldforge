/**
 * Domain Purchase & Setup Orchestrator
 *
 * Automates the complete domain setup flow:
 * 1. Domain purchase via Cloudflare Registrar
 * 2. DNS zone creation
 * 3. SPF record configuration
 * 4. DKIM key generation and record setup
 * 5. DMARC record configuration
 * 6. Health check verification
 */

import { purchaseDomain, type DomainPurchaseRequest, type PurchaseResult } from './purchase'
import { createSPFRecord, verifySPFRecord } from '../dns/spf'
import { createDKIMRecord, verifyDKIMRecord } from '../dns/dkim'
import { createDMARCRecord, verifyDMARCRecord } from '../dns/dmarc'
import { runFullDomainHealthCheck } from '../dns/health-check'
import { createAdminClient } from '../supabase/admin'

export interface DomainSetupRequest {
  domain: string
  orgId: string
  years?: number
  autoRenew?: boolean
  emailProviders?: ('google' | 'microsoft' | 'ses' | 'mailgun' | 'sendgrid')[]
  dmarcReportEmail?: string
  skipDnsSetup?: boolean
}

export interface DomainSetupResult {
  success: boolean
  domain: string
  domainId?: string
  zoneId?: string
  steps: {
    purchase: StepResult
    spf: StepResult
    dkim: StepResult
    dmarc: StepResult
    verification: StepResult
  }
  error?: string
}

interface StepResult {
  success: boolean
  message: string
  details?: Record<string, unknown>
}

/**
 * Complete domain purchase and setup orchestration
 * Handles the entire flow from purchase to verified DNS configuration
 */
export async function setupDomain(request: DomainSetupRequest): Promise<DomainSetupResult> {
  const result: DomainSetupResult = {
    success: false,
    domain: request.domain,
    steps: {
      purchase: { success: false, message: 'Not started' },
      spf: { success: false, message: 'Not started' },
      dkim: { success: false, message: 'Not started' },
      dmarc: { success: false, message: 'Not started' },
      verification: { success: false, message: 'Not started' },
    },
  }

  try {
    // Step 1: Purchase domain
    console.log(`[Orchestrator] Starting domain setup for ${request.domain}`)

    const purchaseRequest: DomainPurchaseRequest = {
      domain: request.domain,
      registrar: 'cloudflare',
      years: request.years || 1,
      orgId: request.orgId,
      autoRenew: request.autoRenew ?? true,
      privacy: true,
    }

    const purchaseResult = await purchaseDomain(purchaseRequest)

    if (!purchaseResult.success) {
      result.steps.purchase = {
        success: false,
        message: purchaseResult.error || 'Purchase failed',
      }
      result.error = purchaseResult.error
      return result
    }

    result.domainId = purchaseResult.domainId
    result.zoneId = purchaseResult.zoneId
    result.steps.purchase = {
      success: true,
      message: 'Domain purchased successfully',
      details: {
        expiresAt: purchaseResult.expiresAt?.toISOString(),
        zoneId: purchaseResult.zoneId,
      },
    }

    console.log(`[Orchestrator] Domain purchased: ${request.domain}`)

    // If skipDnsSetup is true, return early with just purchase result
    if (request.skipDnsSetup) {
      result.success = true
      result.steps.spf.message = 'Skipped'
      result.steps.dkim.message = 'Skipped'
      result.steps.dmarc.message = 'Skipped'
      result.steps.verification.message = 'Skipped'
      return result
    }

    // Get the domain ID from database for DNS record linking
    const supabase = createAdminClient()
    const { data: domainRecord } = await supabase
      .from('domains')
      .select('id')
      .eq('domain', request.domain)
      .eq('organization_id', request.orgId)
      .single()

    const domainDbId = domainRecord?.id || result.domainId!
    const zoneId = result.zoneId!

    // Step 2: Configure SPF
    console.log(`[Orchestrator] Configuring SPF for ${request.domain}`)
    const spfResult = await createSPFRecord(
      domainDbId,
      zoneId,
      request.domain,
      request.emailProviders
    )

    if (spfResult.success) {
      result.steps.spf = {
        success: true,
        message: 'SPF record created',
        details: { record: spfResult.record, recordId: spfResult.recordId },
      }

      // Update database
      await supabase
        .from('domains')
        .update({ spf_configured: true })
        .eq('id', domainDbId)
    } else {
      result.steps.spf = {
        success: false,
        message: spfResult.error || 'SPF creation failed',
      }
    }

    // Step 3: Configure DKIM
    console.log(`[Orchestrator] Configuring DKIM for ${request.domain}`)
    const dkimResult = await createDKIMRecord(domainDbId, zoneId, request.domain, 'coldforge')

    if (dkimResult.success) {
      result.steps.dkim = {
        success: true,
        message: 'DKIM record created',
        details: { selector: dkimResult.selector, dnsName: dkimResult.dnsName },
      }

      // Update database
      await supabase
        .from('domains')
        .update({ dkim_configured: true })
        .eq('id', domainDbId)
    } else {
      result.steps.dkim = {
        success: false,
        message: dkimResult.error || 'DKIM creation failed',
      }
    }

    // Step 4: Configure DMARC
    console.log(`[Orchestrator] Configuring DMARC for ${request.domain}`)
    const dmarcResult = await createDMARCRecord(
      domainDbId,
      zoneId,
      request.domain,
      request.dmarcReportEmail
    )

    if (dmarcResult.success) {
      result.steps.dmarc = {
        success: true,
        message: 'DMARC record created',
        details: { record: dmarcResult.record, recordId: dmarcResult.recordId },
      }

      // Update database
      await supabase
        .from('domains')
        .update({ dmarc_configured: true })
        .eq('id', domainDbId)
    } else {
      result.steps.dmarc = {
        success: false,
        message: dmarcResult.error || 'DMARC creation failed',
      }
    }

    // Step 5: Verification (run after a brief delay to allow DNS propagation)
    console.log(`[Orchestrator] Running health check for ${request.domain}`)

    // Quick verification - don't wait for full propagation
    const healthCheck = await runFullDomainHealthCheck(request.domain)

    result.steps.verification = {
      success: healthCheck.overallScore >= 50, // At least 50% means records were created
      message: healthCheck.overallScore >= 80
        ? 'All DNS records verified'
        : healthCheck.overallScore >= 50
          ? 'DNS records created, propagation in progress'
          : 'DNS verification pending',
      details: {
        score: healthCheck.overallScore,
        spf: healthCheck.spf.status,
        dkim: healthCheck.dkim.status,
        dmarc: healthCheck.dmarc.status,
      },
    }

    // Update health status in database
    const healthStatus = healthCheck.overallScore >= 80
      ? 'healthy'
      : healthCheck.overallScore >= 50
        ? 'warning'
        : 'pending'

    await supabase
      .from('domains')
      .update({ health_status: healthStatus })
      .eq('id', domainDbId)

    // Determine overall success
    result.success =
      result.steps.purchase.success &&
      result.steps.spf.success &&
      result.steps.dkim.success &&
      result.steps.dmarc.success

    console.log(
      `[Orchestrator] Domain setup ${result.success ? 'completed' : 'partially completed'} for ${request.domain}`
    )

    return result
  } catch (error) {
    console.error(`[Orchestrator] Domain setup failed for ${request.domain}:`, error)
    result.error = error instanceof Error ? error.message : 'Setup failed'
    return result
  }
}

/**
 * Configure DNS for an already-purchased domain
 * Use this when domain was purchased externally or DNS setup was skipped
 */
export async function configureDomainDNS(options: {
  domainId: string
  domain: string
  zoneId: string
  emailProviders?: ('google' | 'microsoft' | 'ses' | 'mailgun' | 'sendgrid')[]
  dmarcReportEmail?: string
}): Promise<{
  success: boolean
  steps: {
    spf: StepResult
    dkim: StepResult
    dmarc: StepResult
  }
}> {
  const { domainId, domain, zoneId, emailProviders, dmarcReportEmail } = options

  const supabase = createAdminClient()

  const steps = {
    spf: { success: false, message: 'Not started' } as StepResult,
    dkim: { success: false, message: 'Not started' } as StepResult,
    dmarc: { success: false, message: 'Not started' } as StepResult,
  }

  // SPF
  const spfResult = await createSPFRecord(domainId, zoneId, domain, emailProviders)
  if (spfResult.success) {
    steps.spf = { success: true, message: 'SPF configured', details: { record: spfResult.record } }
    await supabase.from('domains').update({ spf_configured: true }).eq('id', domainId)
  } else {
    steps.spf = { success: false, message: spfResult.error || 'SPF failed' }
  }

  // DKIM
  const dkimResult = await createDKIMRecord(domainId, zoneId, domain, 'coldforge')
  if (dkimResult.success) {
    steps.dkim = { success: true, message: 'DKIM configured', details: { selector: dkimResult.selector } }
    await supabase.from('domains').update({ dkim_configured: true }).eq('id', domainId)
  } else {
    steps.dkim = { success: false, message: dkimResult.error || 'DKIM failed' }
  }

  // DMARC
  const dmarcResult = await createDMARCRecord(domainId, zoneId, domain, dmarcReportEmail)
  if (dmarcResult.success) {
    steps.dmarc = { success: true, message: 'DMARC configured', details: { record: dmarcResult.record } }
    await supabase.from('domains').update({ dmarc_configured: true }).eq('id', domainId)
  } else {
    steps.dmarc = { success: false, message: dmarcResult.error || 'DMARC failed' }
  }

  return {
    success: steps.spf.success && steps.dkim.success && steps.dmarc.success,
    steps,
  }
}

/**
 * Verify DNS propagation for a domain
 * Returns verification status for all email authentication records
 */
export async function verifyDomainDNS(domain: string): Promise<{
  allVerified: boolean
  spf: { verified: boolean; record?: string; error?: string }
  dkim: { verified: boolean; record?: string; error?: string }
  dmarc: { verified: boolean; record?: string; error?: string }
}> {
  const [spf, dkim, dmarc] = await Promise.all([
    verifySPFRecord(domain),
    verifyDKIMRecord(domain, 'coldforge'),
    verifyDMARCRecord(domain),
  ])

  return {
    allVerified: spf.verified && dkim.verified && dmarc.verified,
    spf,
    dkim,
    dmarc,
  }
}

/**
 * Bulk domain search
 * Check availability and pricing for multiple domains at once
 */
export async function searchDomains(
  baseName: string,
  tlds: string[] = ['com', 'io', 'co', 'net', 'org']
): Promise<
  Array<{
    domain: string
    available: boolean
    price?: number
    premium?: boolean
  }>
> {
  const { checkDomainAvailability } = await import('./purchase')

  const results = await Promise.all(
    tlds.map(async (tld) => {
      const domain = `${baseName}.${tld}`
      const availability = await checkDomainAvailability(domain)
      return {
        domain,
        available: availability.available,
        price: availability.price,
        premium: availability.premium,
      }
    })
  )

  return results
}

/**
 * Get domain setup status for dashboard display
 */
export async function getDomainSetupStatus(domainId: string): Promise<{
  domain: string
  status: 'pending' | 'active' | 'error'
  steps: {
    purchased: boolean
    spfConfigured: boolean
    dkimConfigured: boolean
    dmarcConfigured: boolean
    verified: boolean
  }
  healthScore?: number
  expiresAt?: Date
}> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('domains')
    .select('*')
    .eq('id', domainId)
    .single()

  if (error || !data) {
    throw new Error('Domain not found')
  }

  // Run health check if records are configured
  let healthScore: number | undefined
  if (data.spf_configured && data.dkim_configured && data.dmarc_configured) {
    const health = await runFullDomainHealthCheck(data.domain)
    healthScore = health.overallScore
  }

  return {
    domain: data.domain,
    status: data.status,
    steps: {
      purchased: true,
      spfConfigured: data.spf_configured,
      dkimConfigured: data.dkim_configured,
      dmarcConfigured: data.dmarc_configured,
      verified: healthScore !== undefined && healthScore >= 80,
    },
    healthScore,
    expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkDnsHealth, DnsHealthResult } from '@/lib/dns'

interface RouteContext {
  params: Promise<{ id: string }>
}

// DomainResponse interface for type reference (used in comments)
// interface DomainResponse { id: string; domain: string; dkim_selector: string | null; ... }

// Check tracking domain CNAME
async function checkTrackingDomain(domain: string): Promise<{
  configured: boolean
  record: string | null
  expected: string
  issues: string[]
}> {
  const result = {
    configured: false,
    record: null as string | null,
    expected: 'tracking.instantscale.com',
    issues: [] as string[]
  }

  try {
    const { promises: dns } = await import('dns')
    const trackingDomain = `track.${domain}`

    try {
      const records = await dns.resolveCname(trackingDomain)
      const firstRecord = records?.[0]
      if (records && records.length > 0 && firstRecord) {
        result.record = firstRecord
        // Check if it points to the expected tracking server
        if (firstRecord.toLowerCase().includes('instantscale') ||
            firstRecord.toLowerCase().includes('tracking')) {
          result.configured = true
        } else {
          result.issues.push(`CNAME points to ${firstRecord}, expected tracking.instantscale.com`)
        }
      }
    } catch {
      result.issues.push('No tracking CNAME record found (track.' + domain + ')')
    }
  } catch (error) {
    result.issues.push('Failed to check tracking domain')
  }

  return result
}

// Calculate health score based on DNS configuration
function calculateHealthScore(
  dnsHealth: DnsHealthResult,
  trackingConfigured: boolean
): number {
  let score = 0
  const weights = {
    spf: 25,
    dkim: 25,
    dmarc: 25,
    mx: 15,
    tracking: 10
  }

  // SPF
  if (dnsHealth.spf.configured) {
    score += dnsHealth.spf.valid ? weights.spf : weights.spf * 0.5
  }

  // DKIM
  if (dnsHealth.dkim.configured) {
    score += dnsHealth.dkim.valid ? weights.dkim : weights.dkim * 0.5
  }

  // DMARC
  if (dnsHealth.dmarc.configured) {
    if (dnsHealth.dmarc.valid) {
      // Bonus for stricter policies
      if (dnsHealth.dmarc.policy === 'reject') {
        score += weights.dmarc
      } else if (dnsHealth.dmarc.policy === 'quarantine') {
        score += weights.dmarc * 0.9
      } else {
        score += weights.dmarc * 0.7
      }
    } else {
      score += weights.dmarc * 0.3
    }
  }

  // MX
  if (dnsHealth.mx.configured) {
    score += weights.mx
  }

  // Tracking
  if (trackingConfigured) {
    score += weights.tracking
  }

  return Math.round(score)
}

// POST /api/domains/[id]/verify - Comprehensive DNS verification
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get domain
    const { data: domain, error: fetchError } = await supabase
      .from('domains')
      .select('domain, dkim_selector')
      .eq('id', id)
      .single() as { data: { domain: string; dkim_selector: string | null } | null; error: unknown }

    if (fetchError || !domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    // Run all checks in parallel
    const [dnsHealth, trackingCheck] = await Promise.all([
      checkDnsHealth(domain.domain, domain.dkim_selector || undefined),
      checkTrackingDomain(domain.domain)
    ])

    // Calculate overall health score
    const healthScore = calculateHealthScore(dnsHealth, trackingCheck.configured)

    // Determine health status
    let healthStatus: 'healthy' | 'warning' | 'error' | 'pending' = 'pending'
    if (healthScore >= 80) {
      healthStatus = 'healthy'
    } else if (healthScore >= 50) {
      healthStatus = 'warning'
    } else if (healthScore > 0) {
      healthStatus = 'error'
    }

    // Update domain with health results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('domains') as any)
      .update({
        spf_configured: dnsHealth.spf.configured,
        dkim_configured: dnsHealth.dkim.configured,
        dkim_selector: dnsHealth.dkim.selector,
        dmarc_configured: dnsHealth.dmarc.configured,
        health_status: healthStatus,
        health_score: healthScore,
        last_health_check: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    // Build verification response
    const verification = {
      domain: domain.domain,
      healthScore,
      healthStatus,
      checkedAt: new Date().toISOString(),
      records: {
        spf: {
          status: dnsHealth.spf.configured ? (dnsHealth.spf.valid ? 'verified' : 'warning') : 'missing',
          configured: dnsHealth.spf.configured,
          valid: dnsHealth.spf.valid,
          record: dnsHealth.spf.record,
          issues: dnsHealth.spf.issues,
          expected: 'v=spf1 include:_spf.instantscale.com ~all'
        },
        dkim: {
          status: dnsHealth.dkim.configured ? (dnsHealth.dkim.valid ? 'verified' : 'warning') : 'missing',
          configured: dnsHealth.dkim.configured,
          valid: dnsHealth.dkim.valid,
          selector: dnsHealth.dkim.selector,
          record: dnsHealth.dkim.record,
          issues: dnsHealth.dkim.issues,
          expected: `${dnsHealth.dkim.selector || 'mail'}._domainkey.${domain.domain}`
        },
        dmarc: {
          status: dnsHealth.dmarc.configured ? (dnsHealth.dmarc.valid ? 'verified' : 'warning') : 'missing',
          configured: dnsHealth.dmarc.configured,
          valid: dnsHealth.dmarc.valid,
          policy: dnsHealth.dmarc.policy,
          record: dnsHealth.dmarc.record,
          issues: dnsHealth.dmarc.issues,
          expected: `v=DMARC1; p=none; rua=mailto:dmarc@${domain.domain}`
        },
        mx: {
          status: dnsHealth.mx.configured ? 'verified' : 'missing',
          configured: dnsHealth.mx.configured,
          records: dnsHealth.mx.records,
          issues: dnsHealth.mx.issues
        },
        tracking: {
          status: trackingCheck.configured ? 'verified' : 'missing',
          configured: trackingCheck.configured,
          record: trackingCheck.record,
          expected: trackingCheck.expected,
          issues: trackingCheck.issues,
          host: `track.${domain.domain}`,
          value: 'tracking.instantscale.com'
        }
      },
      recommendations: generateRecommendations(dnsHealth, trackingCheck)
    }

    return NextResponse.json(verification)
  } catch (error) {
    console.error('Failed to verify domain:', error)
    return NextResponse.json(
      { error: 'Failed to verify domain' },
      { status: 500 }
    )
  }
}

// Generate user-friendly recommendations
function generateRecommendations(
  dnsHealth: DnsHealthResult,
  trackingCheck: { configured: boolean; issues: string[] }
): string[] {
  const recommendations: string[] = []

  if (!dnsHealth.spf.configured) {
    recommendations.push('Add an SPF record to authorize InstantScale to send emails on your behalf')
  } else if (!dnsHealth.spf.valid) {
    recommendations.push('Your SPF record has issues. Consider updating it to include InstantScale\'s servers')
  }

  if (!dnsHealth.dkim.configured) {
    recommendations.push('Add a DKIM record to enable email signature verification')
  }

  if (!dnsHealth.dmarc.configured) {
    recommendations.push('Add a DMARC record to protect your domain from spoofing')
  } else if (dnsHealth.dmarc.policy === 'none') {
    recommendations.push('Consider upgrading your DMARC policy from "none" to "quarantine" or "reject" for better protection')
  }

  if (!trackingCheck.configured) {
    recommendations.push('Add a tracking CNAME record to enable click tracking for your campaigns')
  }

  if (recommendations.length === 0) {
    recommendations.push('Your domain is fully configured! Keep monitoring for any changes.')
  }

  return recommendations
}

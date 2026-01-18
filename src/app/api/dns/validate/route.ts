import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateAllDns } from '@/lib/dns-automation'
import { checkDnsHealth } from '@/lib/dns'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { domain, dkimSelector = 'mail' } = body

    if (!domain) {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 })
    }

    // Run both validation methods in parallel
    const [advancedValidation, basicHealth] = await Promise.all([
      validateAllDns(domain, dkimSelector),
      checkDnsHealth(domain, dkimSelector)
    ])

    // Get user's profile to update domain status
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (profile) {
      // Update domain DNS status
      const dnsStatus = advancedValidation.overall === 'valid' ? 'configured' :
                       advancedValidation.overall === 'partial' ? 'partial' : 'pending'

      await supabase.from('domains')
        .update({
          dns_status: dnsStatus,
          dns_health: basicHealth,
          last_dns_check: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('organization_id', profile.organization_id)
        .eq('domain', domain)
    }

    return NextResponse.json({
      success: true,
      domain,
      validation: advancedValidation,
      health: basicHealth,
      summary: {
        spfValid: advancedValidation.spf.valid,
        dkimValid: advancedValidation.dkim.valid,
        dmarcValid: advancedValidation.dmarc.valid,
        mxValid: advancedValidation.mx.valid,
        overall: advancedValidation.overall
      }
    })
  } catch (error) {
    console.error('DNS validation error:', error)
    return NextResponse.json(
      { error: 'Failed to validate DNS records' },
      { status: 500 }
    )
  }
}

// GET endpoint for quick validation
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const domain = searchParams.get('domain')
    const dkimSelector = searchParams.get('selector') || 'mail'

    if (!domain) {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 })
    }

    const health = await checkDnsHealth(domain, dkimSelector)

    return NextResponse.json({
      success: true,
      domain,
      health
    })
  } catch (error) {
    console.error('DNS health check error:', error)
    return NextResponse.json(
      { error: 'Failed to check DNS health' },
      { status: 500 }
    )
  }
}

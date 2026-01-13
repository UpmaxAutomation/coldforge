import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkDnsHealth } from '@/lib/dns'

// Type for domain response
interface DomainResponse {
  id: string
  domain: string
  registrar: 'cloudflare' | 'namecheap' | 'porkbun' | 'manual' | null
  dns_provider: string | null
  spf_configured: boolean
  dkim_configured: boolean
  dkim_selector: string | null
  dmarc_configured: boolean
  bimi_configured: boolean
  health_status: 'healthy' | 'warning' | 'error' | 'pending'
  last_health_check: string | null
  auto_purchased: boolean
  purchase_price: number | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

// GET /api/domains - List all domains for the org
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    // Get domains
    const { data: domains, error } = await supabase
      .from('domains')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false }) as { data: DomainResponse[] | null; error: unknown }

    if (error) {
      throw error
    }

    return NextResponse.json({ domains: domains || [] })
  } catch (error) {
    console.error('Failed to fetch domains:', error)
    return NextResponse.json(
      { error: 'Failed to fetch domains' },
      { status: 500 }
    )
  }
}

// POST /api/domains - Add a manual domain
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    const body = await request.json()
    const { domain, dns_provider } = body

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain is required' },
        { status: 400 }
      )
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/
    if (!domainRegex.test(domain)) {
      return NextResponse.json(
        { error: 'Invalid domain format' },
        { status: 400 }
      )
    }

    // Check DNS health for initial status
    let healthResult
    try {
      healthResult = await checkDnsHealth(domain)
    } catch {
      // DNS check failed, but we'll still add the domain
    }

    // Create domain
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newDomain, error } = await (supabase.from('domains') as any)
      .insert({
        organization_id: profile.organization_id,
        domain: domain.toLowerCase(),
        registrar: 'manual',
        dns_provider: dns_provider || null,
        spf_configured: healthResult?.spf.configured || false,
        dkim_configured: healthResult?.dkim.configured || false,
        dkim_selector: healthResult?.dkim.selector || null,
        dmarc_configured: healthResult?.dmarc.configured || false,
        bimi_configured: false,
        health_status: healthResult?.overall || 'pending',
        last_health_check: healthResult?.checkedAt || null,
        auto_purchased: false,
      })
      .select()
      .single() as { data: DomainResponse | null; error: { code?: string } | null }

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Domain already exists' },
          { status: 400 }
        )
      }
      throw error
    }

    return NextResponse.json({ domain: newDomain }, { status: 201 })
  } catch (error) {
    console.error('Failed to add domain:', error)
    return NextResponse.json(
      { error: 'Failed to add domain' },
      { status: 500 }
    )
  }
}

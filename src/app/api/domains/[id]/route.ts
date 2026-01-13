import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkDnsHealth, DnsHealthResult } from '@/lib/dns'

interface RouteContext {
  params: Promise<{ id: string }>
}

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

// GET /api/domains/[id] - Get a single domain
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: domain, error } = await supabase
      .from('domains')
      .select('*')
      .eq('id', id)
      .single() as { data: DomainResponse | null; error: unknown }

    if (error || !domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    return NextResponse.json({ domain })
  } catch (error) {
    console.error('Failed to fetch domain:', error)
    return NextResponse.json(
      { error: 'Failed to fetch domain' },
      { status: 500 }
    )
  }
}

// PATCH /api/domains/[id] - Update domain settings
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      dns_provider,
      dkim_selector,
    } = body

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (dns_provider !== undefined) updates.dns_provider = dns_provider
    if (dkim_selector !== undefined) updates.dkim_selector = dkim_selector

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: domain, error } = await (supabase.from('domains') as any)
      .update(updates)
      .eq('id', id)
      .select()
      .single() as { data: DomainResponse | null; error: unknown }

    if (error) {
      throw error
    }

    return NextResponse.json({ domain })
  } catch (error) {
    console.error('Failed to update domain:', error)
    return NextResponse.json(
      { error: 'Failed to update domain' },
      { status: 500 }
    )
  }
}

// DELETE /api/domains/[id] - Delete a domain
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('domains') as any)
      .delete()
      .eq('id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete domain:', error)
    return NextResponse.json(
      { error: 'Failed to delete domain' },
      { status: 500 }
    )
  }
}

// POST /api/domains/[id] - Verify/refresh DNS health
export async function POST(request: NextRequest, context: RouteContext) {
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

    // Check DNS health
    let healthResult: DnsHealthResult
    try {
      healthResult = await checkDnsHealth(domain.domain, domain.dkim_selector || undefined)
    } catch (error) {
      console.error('DNS check failed:', error)
      return NextResponse.json(
        { error: 'Failed to check DNS' },
        { status: 500 }
      )
    }

    // Update domain with health results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('domains') as any)
      .update({
        spf_configured: healthResult.spf.configured,
        dkim_configured: healthResult.dkim.configured,
        dkim_selector: healthResult.dkim.selector,
        dmarc_configured: healthResult.dmarc.configured,
        health_status: healthResult.overall,
        last_health_check: healthResult.checkedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({
      health: healthResult,
    })
  } catch (error) {
    console.error('Failed to verify domain:', error)
    return NextResponse.json(
      { error: 'Failed to verify domain' },
      { status: 500 }
    )
  }
}

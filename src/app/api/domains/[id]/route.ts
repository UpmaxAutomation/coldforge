import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkDnsHealth, DnsHealthResult } from '@/lib/dns'
import type { Database, Tables } from '@/types/database'

interface RouteContext {
  params: Promise<{ id: string }>
}

type DomainRow = Tables<'domains'>
type DomainUpdate = Database['public']['Tables']['domains']['Update']

// GET /api/domains/[id] - Get a single domain
export async function GET(_request: NextRequest, context: RouteContext) {
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
      .single() as unknown as { data: DomainRow | null; error: Error | null }

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

    const updates: DomainUpdate = {
      updated_at: new Date().toISOString(),
    }

    if (dns_provider !== undefined) updates.dns_provider = dns_provider
    if (dkim_selector !== undefined) updates.dkim_selector = dkim_selector

    const { data: domain, error } = await ((supabase
      .from('domains') as ReturnType<typeof supabase.from>)
      .update(updates)
      .eq('id', id)
      .select()
      .single() as unknown as Promise<{ data: DomainRow | null; error: Error | null }>)

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
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await (supabase
      .from('domains')
      .delete()
      .eq('id', id) as unknown as Promise<{ error: Error | null }>)

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
      .single() as unknown as { data: Pick<DomainRow, 'domain' | 'dkim_selector'> | null; error: Error | null }

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
    const healthUpdate: DomainUpdate = {
      spf_configured: healthResult.spf.configured,
      dkim_configured: healthResult.dkim.configured,
      dkim_selector: healthResult.dkim.selector,
      dmarc_configured: healthResult.dmarc.configured,
      health_status: healthResult.overall,
      last_health_check: healthResult.checkedAt,
      updated_at: new Date().toISOString(),
    }
    await ((supabase
      .from('domains') as ReturnType<typeof supabase.from>)
      .update(healthUpdate)
      .eq('id', id) as unknown as Promise<{ error: Error | null }>)

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

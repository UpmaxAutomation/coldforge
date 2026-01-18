import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  DnsRecord,
  generateSpfRecord,
  generateDkimRecord,
  generateDmarcRecord,
  generateAllRecords
} from '@/lib/domains/dns-config'
import type { Database, Tables } from '@/types/database'

interface RouteContext {
  params: Promise<{ id: string }>
}

type DomainRow = Tables<'domains'>
type DomainUpdate = Database['public']['Tables']['domains']['Update']

// GET /api/domains/[id]/dns - Get DNS records for a domain
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get domain details
    const { data: domain, error } = await supabase
      .from('domains')
      .select('id, domain, dkim_selector, dkim_public_key')
      .eq('id', id)
      .single() as unknown as { data: Pick<DomainRow, 'id' | 'domain' | 'dkim_selector' | 'dkim_public_key'> | null; error: Error | null }

    if (error || !domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    // Generate DNS records
    const records: DnsRecord[] = generateAllRecords(domain.domain, user.email || `dmarc@${domain.domain}`)

    // Add DKIM record if selector and public key exist
    if (domain.dkim_selector && domain.dkim_public_key) {
      records.push(generateDkimRecord(domain.domain, domain.dkim_selector, domain.dkim_public_key))
    }

    return NextResponse.json({
      domain: domain.domain,
      records,
      instructions: {
        spf: 'Add this TXT record to your DNS to authorize email sending servers',
        dkim: domain.dkim_selector
          ? 'Add this TXT record to enable DKIM signing for your emails'
          : 'DKIM record will be available after configuring a DKIM selector',
        dmarc: 'Add this TXT record to specify how receiving servers should handle failed authentication'
      }
    })
  } catch (error) {
    console.error('Failed to get DNS records:', error)
    return NextResponse.json(
      { error: 'Failed to get DNS records' },
      { status: 500 }
    )
  }
}

// POST /api/domains/[id]/dns - Configure DNS records
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { dkim_selector, dkim_public_key, report_email } = body

    // Get domain details
    const { data: domain, error: fetchError } = await supabase
      .from('domains')
      .select('id, domain')
      .eq('id', id)
      .single() as unknown as { data: Pick<DomainRow, 'id' | 'domain'> | null; error: Error | null }

    if (fetchError || !domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    // Prepare update data
    const updates: DomainUpdate = {
      updated_at: new Date().toISOString(),
    }

    if (dkim_selector !== undefined) updates.dkim_selector = dkim_selector
    if (dkim_public_key !== undefined) updates.dkim_public_key = dkim_public_key

    // Update domain with DKIM configuration
    const { error: updateError } = await ((supabase
      .from('domains') as ReturnType<typeof supabase.from>)
      .update(updates)
      .eq('id', id) as unknown as Promise<{ error: Error | null }>)

    if (updateError) {
      throw updateError
    }

    // Generate the records with updated configuration
    const records: DnsRecord[] = []

    // SPF record
    records.push(generateSpfRecord(domain.domain))

    // DMARC record
    const dmarcEmail = report_email || user.email || `dmarc@${domain.domain}`
    records.push(generateDmarcRecord(domain.domain, dmarcEmail))

    // DKIM record if selector and key provided
    if (dkim_selector && dkim_public_key) {
      records.push(generateDkimRecord(domain.domain, dkim_selector, dkim_public_key))
    }

    return NextResponse.json({
      success: true,
      domain: domain.domain,
      records,
      message: 'DNS configuration saved. Add these records to your DNS provider.'
    })
  } catch (error) {
    console.error('Failed to configure DNS:', error)
    return NextResponse.json(
      { error: 'Failed to configure DNS' },
      { status: 500 }
    )
  }
}

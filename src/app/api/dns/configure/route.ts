import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateDnsSetup, type DnsSetupOptions } from '@/lib/dns-automation'
import {
  createRegistrarClient,
  type RegistrarConfig,
  type RegistrarType
} from '@/lib/registrars'

interface DomainRegistrarConfig {
  registrar: RegistrarType
  zone_id: string
  config: RegistrarConfig
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      domainId,
      provider = 'custom',
      dkimSelector = 'mail',
      dmarcReportEmail,
      configureSpf = true,
      configureDkim = true,
      configureDmarc = true,
      configureMx = false
    } = body

    if (!domainId) {
      return NextResponse.json({ error: 'Domain ID is required' }, { status: 400 })
    }

    // Get domain and organization info
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get domain details including registrar config
    const { data: domain, error: domainError } = await supabase
      .from('domains')
      .select('*')
      .eq('id', domainId)
      .eq('organization_id', profile.organization_id)
      .single() as { data: {
        id: string
        domain: string
        registrar_config?: DomainRegistrarConfig
      } | null, error: Error | null }

    if (domainError || !domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    if (!domain.registrar_config) {
      return NextResponse.json({
        error: 'No registrar configuration found. Please configure registrar first.',
        needsSetup: true
      }, { status: 400 })
    }

    // Generate DNS records
    const options: DnsSetupOptions = {
      domain: domain.domain,
      provider,
      dkimSelector,
      dmarcReportEmail: dmarcReportEmail || `dmarc@${domain.domain}`
    }

    const dnsSetup = await generateDnsSetup(options)

    // Create registrar client
    const registrarClient = createRegistrarClient(
      domain.registrar_config.registrar,
      domain.registrar_config.config
    )

    if (!registrarClient) {
      return NextResponse.json({
        error: 'Failed to create registrar client'
      }, { status: 500 })
    }

    // Check if registrar supports DNS operations
    if (!registrarClient.addDnsRecord) {
      return NextResponse.json({
        error: 'Registrar does not support DNS management',
        manualInstructions: true,
        records: dnsSetup
      }, { status: 400 })
    }

    const zoneId = domain.registrar_config.zone_id
    const results: Array<{ record: string; success: boolean; error?: string; recordId?: string }> = []

    // Configure SPF
    if (configureSpf) {
      try {
        const result = await registrarClient.addDnsRecord(zoneId, {
          type: 'TXT',
          name: '@',
          content: dnsSetup.spf.value,
          ttl: dnsSetup.spf.ttl
        })
        results.push({ record: 'SPF', success: true, recordId: result.recordId })
      } catch (error) {
        results.push({
          record: 'SPF',
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add SPF record'
        })
      }
    }

    // Configure DKIM
    if (configureDkim) {
      try {
        const result = await registrarClient.addDnsRecord(zoneId, {
          type: 'TXT',
          name: dnsSetup.dkim.name,
          content: dnsSetup.dkim.value,
          ttl: dnsSetup.dkim.ttl
        })
        results.push({ record: 'DKIM', success: true, recordId: result.recordId })
      } catch (error) {
        results.push({
          record: 'DKIM',
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add DKIM record'
        })
      }
    }

    // Configure DMARC
    if (configureDmarc) {
      try {
        const result = await registrarClient.addDnsRecord(zoneId, {
          type: 'TXT',
          name: '_dmarc',
          content: dnsSetup.dmarc.value,
          ttl: dnsSetup.dmarc.ttl
        })
        results.push({ record: 'DMARC', success: true, recordId: result.recordId })
      } catch (error) {
        results.push({
          record: 'DMARC',
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add DMARC record'
        })
      }
    }

    // Configure MX records
    if (configureMx && dnsSetup.mx) {
      for (const mx of dnsSetup.mx) {
        try {
          const result = await registrarClient.addDnsRecord(zoneId, {
            type: 'MX',
            name: '@',
            content: mx.value,
            ttl: mx.ttl,
            priority: mx.priority
          })
          results.push({ record: `MX (${mx.priority})`, success: true, recordId: result.recordId })
        } catch (error) {
          results.push({
            record: `MX (${mx.priority})`,
            success: false,
            error: error instanceof Error ? error.message : 'Failed to add MX record'
          })
        }
      }
    }

    // Update domain status
    const successCount = results.filter(r => r.success).length
    const totalCount = results.length
    const dnsStatus = successCount === totalCount ? 'configured' :
                     successCount > 0 ? 'partial' : 'pending'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('domains') as any)
      .update({
        dns_status: dnsStatus,
        dns_config: dnsSetup,
        dns_records_configured: results,
        updated_at: new Date().toISOString()
      })
      .eq('id', domainId)

    return NextResponse.json({
      success: true,
      domain: domain.domain,
      results,
      summary: {
        total: totalCount,
        successful: successCount,
        failed: totalCount - successCount,
        status: dnsStatus
      }
    })
  } catch (error) {
    console.error('DNS configuration error:', error)
    return NextResponse.json(
      { error: 'Failed to configure DNS records' },
      { status: 500 }
    )
  }
}

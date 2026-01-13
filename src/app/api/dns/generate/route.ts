import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  generateDnsSetup,
  generateDnsInstructions,
  type DnsSetupOptions
} from '@/lib/dns-automation'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      domain,
      provider = 'custom',
      dkimSelector = 'mail',
      dmarcReportEmail,
      bimiSvgUrl,
      bimiVmcUrl,
      customSpf,
      customMx
    } = body

    if (!domain) {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 })
    }

    // Validate domain format
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
    if (!domainRegex.test(domain)) {
      return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 })
    }

    const options: DnsSetupOptions = {
      domain,
      provider,
      dkimSelector,
      dmarcReportEmail: dmarcReportEmail || `dmarc@${domain}`,
      bimiConfig: bimiSvgUrl ? { svgUrl: bimiSvgUrl, vmcUrl: bimiVmcUrl } : undefined,
      customSpf,
      customMx
    }

    const dnsSetup = await generateDnsSetup(options)
    const instructions = generateDnsInstructions(dnsSetup)

    // Store the generated records in the database
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (profile) {
      // Update domain with generated DNS config
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('domains') as any)
        .update({
          dns_config: dnsSetup,
          updated_at: new Date().toISOString()
        })
        .eq('organization_id', profile.organization_id)
        .eq('domain', domain)
    }

    return NextResponse.json({
      success: true,
      domain,
      records: {
        spf: dnsSetup.spf,
        dkim: dnsSetup.dkim,
        dmarc: dnsSetup.dmarc,
        bimi: dnsSetup.bimi,
        mx: dnsSetup.mx
      },
      instructions
    })
  } catch (error) {
    console.error('DNS generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate DNS records' },
      { status: 500 }
    )
  }
}

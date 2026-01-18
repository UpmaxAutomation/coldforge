import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createMailboxProviderClient,
  generateMailboxBatch,
  bulkProvisionMailboxes,
  type MailboxProviderType,
  type MailboxProviderConfig,
  type MailboxConfig,
} from '@/lib/mailbox-providers'

// POST /api/mailboxes/provision - Bulk provision mailboxes
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
      count = 1,
      mailboxes: providedMailboxes,
      provider = 'custom_smtp',
      warmupEnabled = true,
      initialSendingQuota = 20,
    } = body

    if (!domainId) {
      return NextResponse.json({ error: 'Domain ID is required' }, { status: 400 })
    }

    if (count > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 mailboxes can be provisioned at once' },
        { status: 400 }
      )
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get domain with provider config
    const { data: domain, error: domainError } = await supabase
      .from('domains')
      .select('*')
      .eq('id', domainId)
      .eq('organization_id', profile.organization_id)
      .single() as {
        data: {
          id: string
          domain: string
          provider_config: MailboxProviderConfig | null
          mailbox_provider: MailboxProviderType | null
        } | null
        error: Error | null
      }

    if (domainError || !domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    // Generate mailbox configs if not provided
    let mailboxConfigs: MailboxConfig[]
    if (providedMailboxes && Array.isArray(providedMailboxes)) {
      mailboxConfigs = providedMailboxes.map((m: Partial<MailboxConfig>) => ({
        email: m.email || '',
        firstName: m.firstName || '',
        lastName: m.lastName || '',
        password: m.password,
      }))
    } else {
      mailboxConfigs = generateMailboxBatch(domain.domain, count)
    }

    const results: Array<{
      email: string
      success: boolean
      error?: string
      id?: string
    }> = []

    // Check if provider supports automatic provisioning
    const providerType = domain.mailbox_provider || provider
    const hasProviderConfig = domain.provider_config &&
      (domain.provider_config.google_workspace || domain.provider_config.microsoft_365)

    // Use admin client for INSERT operations to bypass RLS
    const adminClient = createAdminClient()

    if (hasProviderConfig && providerType !== 'custom_smtp') {
      // Use provider API for provisioning
      const client = createMailboxProviderClient(
        providerType as MailboxProviderType,
        domain.provider_config!
      )

      if (client) {
        const provisionResult = await bulkProvisionMailboxes(client, mailboxConfigs, {
          stopOnError: false,
          delayMs: 1000, // 1 second delay between creations
        })

        // Create database records for successful provisions using admin client
        for (const result of provisionResult.results) {
          if (result.success) {
            const config = mailboxConfigs.find(m => m.email === result.email)

            const { data: mailbox, error: _dbError } = await adminClient.from('mailboxes')
              .insert({
                email: result.email,
                domain_id: domainId,
                provider: providerType,
                first_name: config?.firstName || '',
                last_name: config?.lastName || '',
                status: 'active',
                sending_quota: initialSendingQuota,
                emails_sent_today: 0,
                warmup_enabled: warmupEnabled,
                warmup_stage: 0,
              })
              .select('id')
              .single() as { data: { id: string } | null; error: Error | null }

            results.push({
              email: result.email,
              success: true,
              id: mailbox?.id,
            })
          } else {
            results.push({
              email: result.email,
              success: false,
              error: result.error,
            })
          }
        }
      }
    } else {
      // Manual/custom SMTP - just create database records
      for (const config of mailboxConfigs) {
        try {
          // Check if email already exists
          const { data: existing } = await supabase
            .from('mailboxes')
            .select('id')
            .eq('email', config.email)
            .single() as { data: { id: string } | null }

          if (existing) {
            results.push({
              email: config.email,
              success: false,
              error: 'Email already exists',
            })
            continue
          }

          const { data: mailbox, error: dbError } = await adminClient.from('mailboxes')
            .insert({
              email: config.email,
              domain_id: domainId,
              provider: 'custom_smtp',
              first_name: config.firstName,
              last_name: config.lastName,
              status: 'pending', // Needs manual setup
              sending_quota: initialSendingQuota,
              emails_sent_today: 0,
              warmup_enabled: warmupEnabled,
              warmup_stage: 0,
            })
            .select('id')
            .single() as { data: { id: string } | null; error: Error | null }

          if (dbError) {
            results.push({
              email: config.email,
              success: false,
              error: dbError.message,
            })
          } else {
            results.push({
              email: config.email,
              success: true,
              id: mailbox?.id,
            })
          }
        } catch (error) {
          results.push({
            email: config.email,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({
      success: failed === 0,
      summary: {
        total: results.length,
        successful,
        failed,
      },
      results,
      needsManualSetup: !hasProviderConfig || providerType === 'custom_smtp',
    })
  } catch (error) {
    console.error('Mailbox provisioning error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

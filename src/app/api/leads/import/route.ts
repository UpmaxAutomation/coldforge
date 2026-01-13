import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface LeadImportRow {
  email: string
  firstName?: string
  lastName?: string
  company?: string
  title?: string
  phone?: string
  linkedinUrl?: string
  customFields?: Record<string, string>
}

// POST /api/leads/import - Bulk import leads from array
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!userData?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    const body = await request.json()
    const { leads, listId, skipDuplicates = true, updateExisting = false } = body as {
      leads: LeadImportRow[]
      listId?: string
      skipDuplicates?: boolean
      updateExisting?: boolean
    }

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: 'Leads array is required' }, { status: 400 })
    }

    // Validate all leads have email
    const invalidLeads = leads.filter(lead => !lead.email)
    if (invalidLeads.length > 0) {
      return NextResponse.json({
        error: `${invalidLeads.length} leads missing email address`
      }, { status: 400 })
    }

    // If listId provided, verify it exists and belongs to org
    if (listId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: list } = await (supabase.from('lead_lists') as any)
        .select('id')
        .eq('id', listId)
        .eq('organization_id', userData.organization_id)
        .single()

      if (!list) {
        return NextResponse.json({ error: 'List not found' }, { status: 404 })
      }
    }

    let imported = 0
    let skipped = 0
    let updated = 0
    const errors: string[] = []

    // Process in batches of 100
    const batchSize = 100
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize)

      for (const lead of batch) {
        try {
          // Check for existing lead by email
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: existing } = await (supabase.from('leads') as any)
            .select('id')
            .eq('organization_id', userData.organization_id)
            .eq('email', lead.email.toLowerCase().trim())
            .single()

          if (existing) {
            if (skipDuplicates && !updateExisting) {
              skipped++
              continue
            }

            if (updateExisting) {
              // Update existing lead
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error: updateError } = await (supabase.from('leads') as any)
                .update({
                  first_name: lead.firstName || null,
                  last_name: lead.lastName || null,
                  company: lead.company || null,
                  title: lead.title || null,
                  phone: lead.phone || null,
                  linkedin_url: lead.linkedinUrl || null,
                  custom_fields: lead.customFields || {},
                  list_id: listId || null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id)

              if (updateError) {
                errors.push(`Failed to update ${lead.email}: ${updateError.message}`)
              } else {
                updated++
              }
              continue
            }
          }

          // Insert new lead
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: insertError } = await (supabase.from('leads') as any)
            .insert({
              organization_id: userData.organization_id,
              email: lead.email.toLowerCase().trim(),
              first_name: lead.firstName || null,
              last_name: lead.lastName || null,
              company: lead.company || null,
              title: lead.title || null,
              phone: lead.phone || null,
              linkedin_url: lead.linkedinUrl || null,
              custom_fields: lead.customFields || {},
              list_id: listId || null,
              status: 'active',
            })

          if (insertError) {
            errors.push(`Failed to insert ${lead.email}: ${insertError.message}`)
          } else {
            imported++
          }
        } catch (err) {
          errors.push(`Error processing ${lead.email}: ${err}`)
        }
      }
    }

    // Update list lead count if listId provided
    if (listId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase.from('leads') as any)
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', userData.organization_id)
        .eq('list_id', listId)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('lead_lists') as any)
        .update({
          lead_count: count || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', listId)
    }

    return NextResponse.json({
      success: errors.length === 0,
      totalRows: leads.length,
      imported,
      skipped,
      updated,
      errors: errors.slice(0, 100), // Limit errors in response
    })
  } catch (error) {
    console.error('Lead import error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

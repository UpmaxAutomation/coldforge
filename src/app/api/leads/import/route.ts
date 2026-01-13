import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  parseCSV,
  processImport,
  type ColumnMapping,
  type LeadImportConfig,
} from '@/lib/leads'

// Auto-detect column mapping from headers
function autoDetectMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {}

  const headerMappings: Record<string, Exclude<keyof ColumnMapping, 'customFields'>> = {
    'email': 'email',
    'e-mail': 'email',
    'email_address': 'email',
    'first_name': 'firstName',
    'firstname': 'firstName',
    'first': 'firstName',
    'last_name': 'lastName',
    'lastname': 'lastName',
    'last': 'lastName',
    'company': 'company',
    'company_name': 'company',
    'organization': 'company',
    'title': 'title',
    'job_title': 'title',
    'position': 'title',
    'phone': 'phone',
    'phone_number': 'phone',
    'mobile': 'phone',
    'linkedin': 'linkedinUrl',
    'linkedin_url': 'linkedinUrl',
    'website': 'website',
    'url': 'website',
  }

  for (const header of headers) {
    const normalizedHeader = header.toLowerCase().trim().replace(/\s+/g, '_')
    const mappedField = headerMappings[normalizedHeader]

    if (mappedField && !mapping[mappedField]) {
      mapping[mappedField] = header
    }
  }

  return mapping
}

// POST /api/leads/import - Import leads from CSV
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const configJson = formData.get('config') as string | null

    if (!file) {
      return NextResponse.json({ error: 'CSV file required' }, { status: 400 })
    }

    // Parse config
    let config: LeadImportConfig = {
      skipDuplicates: true,
      updateExisting: false,
      mapping: { email: 'email' },
    }

    if (configJson) {
      try {
        config = { ...config, ...JSON.parse(configJson) }
      } catch {
        return NextResponse.json({ error: 'Invalid config JSON' }, { status: 400 })
      }
    }

    // Read file content
    const csvContent = await file.text()
    const { headers, rows } = parseCSV(csvContent)

    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 })
    }

    // Auto-detect mapping if not provided
    if (!config.mapping.email || config.mapping.email === 'email') {
      const detected = autoDetectMapping(headers)
      config.mapping = { ...detected, ...config.mapping } as ColumnMapping
    }

    if (!config.mapping.email) {
      return NextResponse.json(
        { error: 'Could not detect email column. Please specify mapping.' },
        { status: 400 }
      )
    }

    // Process import with batching
    const result = await processImport(
      rows,
      config.mapping,
      config,
      profile.organization_id,
      100, // batch size
      async (leads) => {
        let inserted = 0
        let updated = 0
        const errors: string[] = []

        for (const lead of leads) {
          try {
            // Check for existing
            const { data: existing } = await supabase
              .from('leads')
              .select('id')
              .eq('organization_id', profile.organization_id)
              .eq('email', lead.email)
              .single() as { data: { id: string } | null }

            if (existing) {
              if (config.skipDuplicates) {
                continue
              }
              if (config.updateExisting) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase.from('leads') as any)
                  .update({
                    first_name: lead.first_name,
                    last_name: lead.last_name,
                    company: lead.company,
                    title: lead.title,
                    phone: lead.phone,
                    linkedin_url: lead.linkedin_url,
                    website: lead.website,
                    custom_fields: lead.custom_fields,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', existing.id)
                updated++
              }
            } else {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase.from('leads') as any).insert(lead)
              inserted++
            }
          } catch (err) {
            errors.push(`Failed to insert ${lead.email}: ${err}`)
          }
        }

        return { inserted, updated, errors }
      }
    )

    // Update list lead counts if needed
    if (config.listId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase.from('leads') as any)
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', profile.organization_id)
        .contains('list_ids', [config.listId])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('lead_lists') as any)
        .update({ lead_count: count || 0 })
        .eq('id', config.listId)
    }

    return NextResponse.json({
      success: result.success,
      totalRows: result.totalRows,
      imported: result.imported,
      skipped: result.skipped,
      updated: result.updated,
      errors: result.errors.slice(0, 100), // Limit error count
    })
  } catch (error) {
    console.error('Lead import error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

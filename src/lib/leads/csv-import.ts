// CSV Import Utilities

import type {
  ColumnMapping,
  ImportResult,
  LeadImportConfig,
  LeadSource,
} from './types'

interface ParsedRow {
  [key: string]: string
}

// Parse CSV string to array of objects
export function parseCSV(csvString: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = csvString.split(/\r?\n/).filter(line => line.trim())

  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }

  // Parse header row
  const headers = parseCSVLine(lines[0] ?? '')

  // Parse data rows
  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i] ?? '')
    if (values.length > 0) {
      const row: ParsedRow = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })
      rows.push(row)
    }
  }

  return { headers, rows }
}

// Parse a single CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"'
      i++ // Skip next quote
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  values.push(current.trim())
  return values
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Clean and normalize email
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

// Map CSV row to lead data
export function mapRowToLead(
  row: ParsedRow,
  mapping: ColumnMapping,
  organizationId: string,
  config: LeadImportConfig
): {
  valid: boolean
  lead?: LeadData
  error?: string
} {
  const emailField = mapping.email
  const rawEmail = row[emailField]

  if (!rawEmail) {
    return { valid: false, error: 'Email field is empty' }
  }

  const email = normalizeEmail(rawEmail)

  if (!isValidEmail(email)) {
    return { valid: false, error: `Invalid email format: ${email}` }
  }

  const lead: LeadData = {
    organization_id: organizationId,
    email,
    first_name: mapping.firstName ? row[mapping.firstName]?.trim() : undefined,
    last_name: mapping.lastName ? row[mapping.lastName]?.trim() : undefined,
    company: mapping.company ? row[mapping.company]?.trim() : undefined,
    title: mapping.title ? row[mapping.title]?.trim() : undefined,
    phone: mapping.phone ? row[mapping.phone]?.trim() : undefined,
    linkedin_url: mapping.linkedinUrl ? row[mapping.linkedinUrl]?.trim() : undefined,
    website: mapping.website ? row[mapping.website]?.trim() : undefined,
    custom_fields: {},
    tags: config.tags || [],
    list_ids: config.listId ? [config.listId] : [],
    status: 'new' as const,
    source: 'csv_import' as LeadSource,
  }

  // Map custom fields
  if (mapping.customFields) {
    for (const [fieldName, csvColumn] of Object.entries(mapping.customFields)) {
      const value = row[csvColumn]?.trim()
      if (value) {
        lead.custom_fields[fieldName] = value
      }
    }
  }

  return { valid: true, lead }
}

interface LeadData {
  organization_id: string
  email: string
  first_name?: string
  last_name?: string
  company?: string
  title?: string
  phone?: string
  linkedin_url?: string
  website?: string
  custom_fields: Record<string, string>
  tags: string[]
  list_ids: string[]
  status: 'new'
  source: LeadSource
}

// Auto-detect column mapping from headers
export function autoDetectMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {}

  const headerMappings: Record<string, Exclude<keyof ColumnMapping, 'customFields'>> = {
    // Email variations
    'email': 'email',
    'e-mail': 'email',
    'email_address': 'email',
    'emailaddress': 'email',
    'work_email': 'email',

    // First name variations
    'first_name': 'firstName',
    'firstname': 'firstName',
    'first': 'firstName',
    'given_name': 'firstName',
    'givenname': 'firstName',

    // Last name variations
    'last_name': 'lastName',
    'lastname': 'lastName',
    'last': 'lastName',
    'surname': 'lastName',
    'family_name': 'lastName',

    // Company variations
    'company': 'company',
    'company_name': 'company',
    'companyname': 'company',
    'organization': 'company',
    'org': 'company',
    'employer': 'company',

    // Title variations
    'title': 'title',
    'job_title': 'title',
    'jobtitle': 'title',
    'position': 'title',
    'role': 'title',

    // Phone variations
    'phone': 'phone',
    'phone_number': 'phone',
    'phonenumber': 'phone',
    'mobile': 'phone',
    'cell': 'phone',
    'telephone': 'phone',

    // LinkedIn variations
    'linkedin': 'linkedinUrl',
    'linkedin_url': 'linkedinUrl',
    'linkedinurl': 'linkedinUrl',
    'linkedin_profile': 'linkedinUrl',

    // Website variations
    'website': 'website',
    'url': 'website',
    'company_website': 'website',
    'web': 'website',
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

// Process import with batching
export async function processImport(
  rows: ParsedRow[],
  mapping: ColumnMapping,
  config: LeadImportConfig,
  organizationId: string,
  batchSize: number = 100,
  insertBatch: (leads: LeadData[]) => Promise<{ inserted: number; updated: number; errors: string[] }>
): Promise<ImportResult> {
  const result: ImportResult = {
    success: true,
    totalRows: rows.length,
    imported: 0,
    skipped: 0,
    updated: 0,
    errors: [],
  }

  const batch: LeadData[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) {
      result.skipped++
      continue
    }
    const { valid, lead, error } = mapRowToLead(row, mapping, organizationId, config)

    if (!valid || !lead) {
      result.errors.push({
        row: i + 2, // +2 for header row and 1-based index
        email: row[mapping.email],
        reason: error || 'Unknown error',
      })
      result.skipped++
      continue
    }

    batch.push(lead)

    // Process batch when full
    if (batch.length >= batchSize) {
      const batchResult = await insertBatch(batch)
      result.imported += batchResult.inserted
      result.updated += batchResult.updated

      for (const err of batchResult.errors) {
        result.errors.push({
          row: i + 2 - batch.length + 1,
          reason: err,
        })
      }

      batch.length = 0
    }
  }

  // Process remaining items
  if (batch.length > 0) {
    const batchResult = await insertBatch(batch)
    result.imported += batchResult.inserted
    result.updated += batchResult.updated

    for (const err of batchResult.errors) {
      result.errors.push({
        row: rows.length + 2 - batch.length,
        reason: err,
      })
    }
  }

  result.success = result.errors.length === 0

  return result
}

// Generate CSV template
export function generateCSVTemplate(): string {
  const headers = [
    'email',
    'first_name',
    'last_name',
    'company',
    'title',
    'phone',
    'linkedin_url',
    'website',
  ]

  const sampleRow = [
    'john@example.com',
    'John',
    'Doe',
    'Acme Inc',
    'CEO',
    '+1234567890',
    'https://linkedin.com/in/johndoe',
    'https://acme.com',
  ]

  return headers.join(',') + '\n' + sampleRow.join(',')
}

// Export leads to CSV
export function exportLeadsToCSV(
  leads: Array<{
    email: string
    firstName?: string
    lastName?: string
    company?: string
    title?: string
    phone?: string
    linkedinUrl?: string
    website?: string
    status: string
    tags: string[]
    customFields: Record<string, string>
  }>,
  includeCustomFields: boolean = true
): string {
  const baseHeaders = [
    'email',
    'first_name',
    'last_name',
    'company',
    'title',
    'phone',
    'linkedin_url',
    'website',
    'status',
    'tags',
  ]

  // Collect all custom field keys
  const customFieldKeys = new Set<string>()
  if (includeCustomFields) {
    for (const lead of leads) {
      for (const key of Object.keys(lead.customFields || {})) {
        customFieldKeys.add(key)
      }
    }
  }

  const headers = [...baseHeaders, ...Array.from(customFieldKeys)]

  const rows = leads.map(lead => {
    const baseRow = [
      escapeCSVField(lead.email),
      escapeCSVField(lead.firstName || ''),
      escapeCSVField(lead.lastName || ''),
      escapeCSVField(lead.company || ''),
      escapeCSVField(lead.title || ''),
      escapeCSVField(lead.phone || ''),
      escapeCSVField(lead.linkedinUrl || ''),
      escapeCSVField(lead.website || ''),
      escapeCSVField(lead.status),
      escapeCSVField(lead.tags.join('; ')),
    ]

    const customFields = Array.from(customFieldKeys).map(key =>
      escapeCSVField(lead.customFields?.[key] || '')
    )

    return [...baseRow, ...customFields].join(',')
  })

  return [headers.join(','), ...rows].join('\n')
}

function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

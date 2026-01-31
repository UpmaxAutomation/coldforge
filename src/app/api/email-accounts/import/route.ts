import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/encryption'
import { z } from 'zod'
import { parse } from 'csv-parse/sync'

/**
 * Email Account Import API
 *
 * Supports importing from:
 * - Mailscale.ai export format
 * - Instantly.ai export format
 * - Generic CSV with SMTP/IMAP credentials
 */

// Schema for a single email account import
const emailAccountSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  displayName: z.string().optional(),

  // SMTP settings
  smtpHost: z.string(),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUsername: z.string(),
  smtpPassword: z.string(),
  smtpSecure: z.boolean().optional().default(true),

  // IMAP settings (optional)
  imapHost: z.string().optional(),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapUsername: z.string().optional(),
  imapPassword: z.string().optional(),
  imapSecure: z.boolean().optional().default(true),

  // Warmup settings
  dailyLimit: z.number().int().min(1).max(500).optional().default(50),
  warmupEnabled: z.boolean().optional().default(true),
  warmupLimit: z.number().int().min(1).max(100).optional().default(25),
  warmupIncrement: z.number().int().min(1).max(10).optional().default(2),
})

// Schema for bulk import request
const bulkImportSchema = z.object({
  accounts: z.array(emailAccountSchema).min(1).max(100),
  skipDuplicates: z.boolean().optional().default(true),
  enableWarmup: z.boolean().optional().default(true),
})

// Mailscale/Instantly CSV header mapping
const CSV_HEADER_MAP: Record<string, string> = {
  'email': 'email',
  'first name': 'firstName',
  'last name': 'lastName',
  'imap username': 'imapUsername',
  'imap password': 'imapPassword',
  'imap host': 'imapHost',
  'imap port': 'imapPort',
  'smtp username': 'smtpUsername',
  'smtp password': 'smtpPassword',
  'smtp host': 'smtpHost',
  'smtp port': 'smtpPort',
  'daily limit': 'dailyLimit',
  'warmup enabled': 'warmupEnabled',
  'warmup limit': 'warmupLimit',
  'warmup increment': 'warmupIncrement',
}

/**
 * Parse CSV content from Mailscale/Instantly format
 */
function parseMailscaleCSV(csvContent: string): z.infer<typeof emailAccountSchema>[] {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true, // Handle BOM character
  })

  return records.map((record: Record<string, string>) => {
    // Normalize headers to lowercase
    const normalized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(record)) {
      const normalizedKey = key.toLowerCase().trim()
      const mappedKey = CSV_HEADER_MAP[normalizedKey] || normalizedKey

      // Parse values appropriately
      if (mappedKey === 'imapPort' || mappedKey === 'smtpPort' ||
          mappedKey === 'dailyLimit' || mappedKey === 'warmupLimit' ||
          mappedKey === 'warmupIncrement') {
        normalized[mappedKey] = parseInt(value, 10) || undefined
      } else if (mappedKey === 'warmupEnabled') {
        normalized[mappedKey] = value.toLowerCase() === 'true'
      } else {
        normalized[mappedKey] = value || undefined
      }
    }

    // Generate display name from first/last name
    if (normalized.firstName || normalized.lastName) {
      normalized.displayName = [normalized.firstName, normalized.lastName]
        .filter(Boolean)
        .join(' ')
    }

    // Use SMTP credentials as fallback for IMAP if not provided
    if (!normalized.imapUsername && normalized.smtpUsername) {
      normalized.imapUsername = normalized.smtpUsername
    }
    if (!normalized.imapPassword && normalized.smtpPassword) {
      normalized.imapPassword = normalized.smtpPassword
    }

    return normalized as z.infer<typeof emailAccountSchema>
  })
}

// POST /api/email-accounts/import - Import email accounts from JSON
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      }, { status: 401 })
    }

    // Get user's organization
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!userData?.organization_id) {
      return NextResponse.json({
        error: { code: 'NO_ORGANIZATION', message: 'No organization found' }
      }, { status: 400 })
    }

    const organizationId = userData.organization_id

    // Parse request body
    const contentType = request.headers.get('content-type') || ''
    let accounts: z.infer<typeof emailAccountSchema>[]
    let skipDuplicates = true
    let enableWarmup = true

    if (contentType.includes('multipart/form-data')) {
      // Handle CSV file upload
      const formData = await request.formData()
      const file = formData.get('file') as File

      if (!file) {
        return NextResponse.json({
          error: { code: 'NO_FILE', message: 'CSV file is required' }
        }, { status: 400 })
      }

      const csvContent = await file.text()
      accounts = parseMailscaleCSV(csvContent)
      skipDuplicates = formData.get('skipDuplicates') !== 'false'
      enableWarmup = formData.get('enableWarmup') !== 'false'
    } else {
      // Handle JSON body
      const body = await request.json()
      const validation = bulkImportSchema.safeParse(body)

      if (!validation.success) {
        return NextResponse.json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.flatten()
          }
        }, { status: 400 })
      }

      accounts = validation.data.accounts
      skipDuplicates = validation.data.skipDuplicates
      enableWarmup = validation.data.enableWarmup
    }

    // Validate all accounts
    const validatedAccounts: z.infer<typeof emailAccountSchema>[] = []
    const validationErrors: { email: string; error: string }[] = []

    for (const account of accounts) {
      const result = emailAccountSchema.safeParse(account)
      if (result.success) {
        validatedAccounts.push(result.data)
      } else {
        validationErrors.push({
          email: account.email || 'unknown',
          error: result.error.issues.map(i => i.message).join(', ')
        })
      }
    }

    if (validatedAccounts.length === 0) {
      return NextResponse.json({
        error: {
          code: 'NO_VALID_ACCOUNTS',
          message: 'No valid accounts to import',
          details: validationErrors
        }
      }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Check for existing accounts if skipDuplicates is true
    const emails = validatedAccounts.map(a => a.email)
    const { data: existingAccounts } = await adminClient
      .from('email_accounts')
      .select('email')
      .eq('organization_id', organizationId)
      .in('email', emails)

    const existingEmails = new Set((existingAccounts || []).map(a => a.email))

    // Prepare accounts for insertion
    const accountsToInsert = validatedAccounts
      .filter(a => !skipDuplicates || !existingEmails.has(a.email))
      .map(account => ({
        organization_id: organizationId,
        email: account.email,
        display_name: account.displayName || account.email.split('@')[0],
        provider: 'smtp' as const,
        status: 'pending' as const,

        // SMTP settings
        smtp_host: account.smtpHost,
        smtp_port: account.smtpPort,
        smtp_username: account.smtpUsername,
        smtp_password_encrypted: encrypt(account.smtpPassword),
        smtp_secure: account.smtpSecure,

        // IMAP settings
        imap_host: account.imapHost || account.smtpHost.replace('smtp.', 'imap.'),
        imap_port: account.imapPort || 993,

        // Limits and warmup
        daily_limit: account.dailyLimit,
        warmup_enabled: enableWarmup && account.warmupEnabled,
        warmup_limit: account.warmupLimit,
        warmup_increment: account.warmupIncrement,

        // Initialize counters
        sent_today: 0,
        health_score: 100,
        reputation_score: 0,

        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))

    if (accountsToInsert.length === 0) {
      return NextResponse.json({
        data: {
          imported: 0,
          skipped: existingEmails.size,
          errors: validationErrors,
          message: 'All accounts already exist'
        }
      }, { status: 200 })
    }

    // Insert accounts in batches of 50
    const BATCH_SIZE = 50
    let insertedCount = 0
    const insertErrors: { email: string; error: string }[] = []

    for (let i = 0; i < accountsToInsert.length; i += BATCH_SIZE) {
      const batch = accountsToInsert.slice(i, i + BATCH_SIZE)

      const { data: inserted, error: insertError } = await adminClient
        .from('email_accounts')
        .insert(batch)
        .select('id, email')

      if (insertError) {
        // Try inserting one by one to identify specific failures
        for (const account of batch) {
          const { error: singleError } = await adminClient
            .from('email_accounts')
            .insert(account)

          if (singleError) {
            insertErrors.push({
              email: account.email,
              error: singleError.message
            })
          } else {
            insertedCount++
          }
        }
      } else {
        insertedCount += inserted?.length || 0
      }
    }

    return NextResponse.json({
      data: {
        imported: insertedCount,
        skipped: validatedAccounts.length - accountsToInsert.length,
        failed: insertErrors.length,
        total: accounts.length,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        insertErrors: insertErrors.length > 0 ? insertErrors : undefined,
        message: `Successfully imported ${insertedCount} email accounts`
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Import email accounts error:', error)
    return NextResponse.json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    }, { status: 500 })
  }
}

// GET /api/email-accounts/import/template - Get CSV template
export async function GET() {
  const template = `Email,First Name,Last Name,IMAP Username,IMAP Password,IMAP Host,IMAP Port,SMTP Username,SMTP Password,SMTP Host,SMTP Port,Daily Limit,Warmup Enabled,Warmup Limit,Warmup Increment,Created Date
example@domain.com,John,Doe,example@domain.com,password123,imap.domain.com,993,example@domain.com,password123,smtp.domain.com,465,50,TRUE,25,2,2025-01-20`

  return new NextResponse(template, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="email-accounts-template.csv"'
    }
  })
}

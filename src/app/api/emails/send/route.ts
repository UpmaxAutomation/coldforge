import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addJob, QUEUES } from '@/lib/queue'
import { z } from 'zod'

// Request validation schema
const sendEmailSchema = z.object({
  to: z.string().email('Invalid recipient email'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  accountId: z.string().uuid('Invalid account ID'),
  // Optional fields
  toName: z.string().optional(),
  fromName: z.string().optional(),
  replyTo: z.string().email().optional(),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  isPlainText: z.boolean().optional().default(false),
  trackOpens: z.boolean().optional().default(true),
  trackClicks: z.boolean().optional().default(true),
  headers: z.record(z.string()).optional(),
  // Campaign context
  campaignId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  sequenceStepId: z.string().uuid().optional(),
  // Scheduling
  scheduledAt: z.string().datetime().optional(),
})

// POST /api/emails/send - Send an email directly
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

    // Parse and validate request body
    const body = await request.json()
    const validation = sendEmailSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validation.error.flatten()
        }
      }, { status: 400 })
    }

    const data = validation.data

    // Verify email account exists and belongs to org
    const { data: account, error: accountError } = await supabase
      .from('email_accounts')
      .select('id, email, display_name, status, daily_limit, sent_today')
      .eq('id', data.accountId)
      .eq('organization_id', userData.organization_id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Email account not found' }
      }, { status: 404 })
    }

    if (account.status !== 'active') {
      return NextResponse.json({
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: `Email account is ${account.status}. Cannot send emails.`
        }
      }, { status: 400 })
    }

    // Check daily limit
    if (account.sent_today >= account.daily_limit) {
      return NextResponse.json({
        error: {
          code: 'DAILY_LIMIT_REACHED',
          message: `Daily sending limit of ${account.daily_limit} reached`
        }
      }, { status: 429 })
    }

    // Build job data
    const jobData = {
      to: data.to,
      from: account.email,
      subject: data.subject,
      body: data.body,
      accountId: data.accountId,
      organizationId: userData.organization_id,
      toName: data.toName,
      fromName: data.fromName || account.display_name,
      replyTo: data.replyTo,
      cc: data.cc,
      bcc: data.bcc,
      isPlainText: data.isPlainText,
      trackOpens: data.trackOpens,
      trackClicks: data.trackClicks,
      headers: data.headers,
      campaignId: data.campaignId,
      leadId: data.leadId,
      sequenceStepId: data.sequenceStepId,
    }

    // Add job to queue
    let job
    if (data.scheduledAt) {
      // Schedule for later
      const scheduledTime = new Date(data.scheduledAt)
      const delay = Math.max(0, scheduledTime.getTime() - Date.now())

      job = await addJob('EMAIL_SEND', 'send-email', jobData, { delay })

      return NextResponse.json({
        data: {
          jobId: job.id,
          status: 'scheduled',
          scheduledAt: data.scheduledAt,
          from: account.email,
          to: data.to,
        }
      }, { status: 202 })
    } else {
      // Send immediately
      job = await addJob('EMAIL_SEND', 'send-email', jobData)

      return NextResponse.json({
        data: {
          jobId: job.id,
          status: 'queued',
          from: account.email,
          to: data.to,
        }
      }, { status: 202 })
    }
  } catch (error) {
    console.error('Send email error:', error)
    return NextResponse.json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    }, { status: 500 })
  }
}

// GET /api/emails/send - Get send status (for polling)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      }, { status: 401 })
    }

    const jobId = request.nextUrl.searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json({
        error: { code: 'MISSING_PARAM', message: 'jobId parameter required' }
      }, { status: 400 })
    }

    // Check sent_emails table for the result
    const { data: sentEmail } = await supabase
      .from('sent_emails')
      .select('id, status, message_id, error_message, sent_at')
      .eq('id', jobId)
      .single()

    if (sentEmail) {
      return NextResponse.json({
        data: {
          jobId,
          status: sentEmail.status,
          messageId: sentEmail.message_id,
          error: sentEmail.error_message,
          sentAt: sentEmail.sent_at,
        }
      })
    }

    // Job still processing
    return NextResponse.json({
      data: {
        jobId,
        status: 'processing',
      }
    })
  } catch (error) {
    console.error('Get email status error:', error)
    return NextResponse.json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    }, { status: 500 })
  }
}

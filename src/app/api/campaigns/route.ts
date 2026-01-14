import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  DEFAULT_CAMPAIGN_SETTINGS,
  INITIAL_CAMPAIGN_STATS,
  type CampaignStatus,
} from '@/lib/campaigns'
import {
  createCampaignSchema,
  listCampaignsQuerySchema,
} from '@/lib/schemas'
import { logAuditEventAsync, getRequestMetadata } from '@/lib/audit'
import {
  apiLimiter,
  writeLimiter,
  applyRateLimit,
  addRateLimitHeaders,
} from '@/lib/rate-limit/middleware'
import { invalidateCampaignCache } from '@/lib/cache/queries'
import { getCampaignsWithStats } from '@/lib/db/queries'
import {
  AuthenticationError,
  BadRequestError,
  DatabaseError,
  ValidationError,
} from '@/lib/errors'
import { handleApiError } from '@/lib/errors/handler'

// GET /api/campaigns - List campaigns
// Optimized: Uses aggregated counts in single query instead of N+1
export async function GET(request: NextRequest) {
  // Apply rate limiting
  const { limited, response, result } = applyRateLimit(request, apiLimiter)
  if (limited) return response!

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new AuthenticationError()
    }

    // Get user's organization
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!userData?.organization_id) {
      throw new BadRequestError('No organization found')
    }

    // Parse and validate query parameters
    const queryResult = listCampaignsQuerySchema.safeParse({
      page: request.nextUrl.searchParams.get('page'),
      limit: request.nextUrl.searchParams.get('limit'),
      status: request.nextUrl.searchParams.get('status'),
    })

    const { page, limit, status } = queryResult.success
      ? queryResult.data
      : { page: 1, limit: 20, status: undefined }

    const statusFilter = status as CampaignStatus[] | undefined

    // Use optimized query with aggregated counts
    const { data: campaigns, error, count } = await getCampaignsWithStats(
      userData.organization_id,
      { page, limit, status: statusFilter }
    )

    if (error) {
      throw new DatabaseError('Failed to fetch campaigns', { originalError: String(error) })
    }

    const jsonResponse = NextResponse.json({
      campaigns: campaigns?.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        type: c.type,
        settings: c.settings,
        stats: c.stats,
        leadListIds: c.lead_list_ids,
        mailboxIds: c.mailbox_ids,
        scheduleId: c.schedule_id,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        startedAt: c.started_at,
        pausedAt: c.paused_at,
        completedAt: c.completed_at,
        // Include aggregated counts
        leadsCount: c.leads_count,
        sentEmailsCount: c.sent_emails_count,
        repliesCount: c.replies_count,
      })) || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: count ? Math.ceil(count / limit) : 0,
      },
    })
    return addRateLimitHeaders(jsonResponse, result)
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/campaigns - Create campaign
export async function POST(request: NextRequest) {
  // Apply stricter rate limiting for write operations
  const { limited, response, result } = applyRateLimit(request, writeLimiter)
  if (limited) return response!

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      throw new AuthenticationError()
    }

    const body = await request.json()

    // Validate request body with Zod schema
    const validationResult = createCampaignSchema.safeParse(body)
    if (!validationResult.success) {
      throw new ValidationError(
        validationResult.error.issues[0]?.message || 'Invalid request body',
        { issues: validationResult.error.issues }
      )
    }

    const { name, type, settings, leadListIds, mailboxIds } = validationResult.data

    // Get user's organization
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!userData?.organization_id) {
      throw new BadRequestError('No organization found')
    }

    // Create campaign
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: campaign, error: createError } = await (supabase.from('campaigns') as any)
      .insert({
        organization_id: userData.organization_id,
        name,
        type,
        status: 'draft',
        settings: { ...DEFAULT_CAMPAIGN_SETTINGS, ...settings },
        stats: INITIAL_CAMPAIGN_STATS,
        lead_list_ids: leadListIds || [],
        mailbox_ids: mailboxIds || [],
      })
      .select()
      .single()

    if (createError) {
      throw new DatabaseError('Failed to create campaign', { originalError: String(createError) })
    }

    // Invalidate campaign cache
    invalidateCampaignCache(userData.organization_id)

    // Audit log campaign creation
    const reqMetadata = getRequestMetadata(request)
    logAuditEventAsync({
      user_id: user.id,
      organization_id: userData.organization_id,
      action: 'create',
      resource_type: 'campaign',
      resource_id: campaign.id,
      details: { name: campaign.name, type: campaign.type },
      ...reqMetadata
    })

    return addRateLimitHeaders(
      NextResponse.json({
        campaign: {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          type: campaign.type,
          settings: campaign.settings,
          stats: campaign.stats,
          leadListIds: campaign.lead_list_ids,
          mailboxIds: campaign.mailbox_ids,
          createdAt: campaign.created_at,
          updatedAt: campaign.updated_at,
        },
      }, { status: 201 }),
      result
    )
  } catch (error) {
    return handleApiError(error)
  }
}

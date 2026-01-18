import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 1x1 transparent GIF
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

// Simple in-memory rate limiter (IP -> { count, resetAt })
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100 // 100 requests per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)

  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }

  entry.count++
  return entry.count > RATE_LIMIT_MAX_REQUESTS
}

// Validate UUID format
function isValidUuid(id: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
}

// Pixel response helper
function pixelResponse(): NextResponse {
  return new NextResponse(TRACKING_PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': TRACKING_PIXEL.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}

// GET /api/track/open - Track email opens
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const campaignId = searchParams.get('campaign')
    const leadId = searchParams.get('lead')
    const messageId = searchParams.get('mid')

    // Get IP for rate limiting
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                      request.headers.get('x-real-ip') ||
                      'unknown'

    // Rate limit check - still return pixel to avoid detection
    if (isRateLimited(ipAddress)) {
      console.warn(`Rate limit exceeded for IP: ${ipAddress}`)
      return pixelResponse()
    }

    // Validate required params exist and have valid UUID format
    if (!campaignId || !leadId) {
      return pixelResponse()
    }

    // Validate ID formats to prevent injection
    if (!isValidUuid(campaignId) || !isValidUuid(leadId)) {
      return pixelResponse()
    }

    // Record the open event asynchronously
    const supabase = await createClient()

    // Get user agent for analytics (ipAddress already defined above for rate limiting)
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Check if already opened (avoid duplicate counts)
    const { data: existing } = await supabase
      .from('email_events')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('lead_id', leadId)
      .eq('event_type', 'opened')
      .single()

    if (!existing) {
      // Get organization from campaign
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('organization_id')
        .eq('id', campaignId)
        .single()

      if (campaign) {
        // Use admin client for insert to bypass RLS
        const adminClient = createAdminClient()
        // Record open event
        await adminClient
          .from('email_events')
          .insert({
            organization_id: campaign.organization_id,
            campaign_id: campaignId,
            lead_id: leadId,
            message_id: messageId || null,
            event_type: 'opened',
            recipient_email: '',
            ip_address: ipAddress,
            user_agent: userAgent,
            occurred_at: new Date().toISOString(),
          })

        // Update campaign stats
        await supabase.rpc('increment_campaign_stat', {
          p_campaign_id: campaignId,
          p_stat: 'opened',
        })
      }
    }

    return pixelResponse()
  } catch (error) {
    console.error('Track open error:', error)
    // Still return pixel even on error
    return new NextResponse(TRACKING_PIXEL, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
      },
    })
  }
}

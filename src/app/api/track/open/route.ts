import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 1x1 transparent GIF
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

// GET /api/track/open - Track email opens
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const campaignId = searchParams.get('campaign')
    const leadId = searchParams.get('lead')
    const messageId = searchParams.get('mid')

    // Always return the tracking pixel, even if tracking fails
    const response = new NextResponse(TRACKING_PIXEL, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Content-Length': TRACKING_PIXEL.length.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })

    if (!campaignId || !leadId) {
      return response
    }

    // Record the open event asynchronously
    const supabase = await createClient()

    // Get IP and user agent for analytics
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                      request.headers.get('x-real-ip') ||
                      'unknown'
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
        .single() as { data: { organization_id: string } | null }

      if (campaign) {
        // Record open event
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('email_events') as any)
          .insert({
            organization_id: campaign.organization_id,
            campaign_id: campaignId,
            lead_id: leadId,
            message_id: messageId || null,
            event_type: 'opened',
            ip_address: ipAddress,
            user_agent: userAgent,
            timestamp: new Date().toISOString(),
          })

        // Update campaign stats
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)('increment_campaign_stat', {
          p_campaign_id: campaignId,
          p_stat: 'opened',
        })
      }
    }

    return response
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

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/track/click - Track link clicks and redirect
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const encodedUrl = searchParams.get('url')
    const campaignId = searchParams.get('campaign')
    const leadId = searchParams.get('lead')

    // Default redirect URL
    const fallbackUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://example.com'

    if (!encodedUrl) {
      return NextResponse.redirect(fallbackUrl)
    }

    // Decode the original URL
    const originalUrl = decodeURIComponent(encodedUrl)

    // Validate URL
    let targetUrl: URL
    try {
      targetUrl = new URL(originalUrl)
    } catch {
      return NextResponse.redirect(fallbackUrl)
    }

    // Record the click event if we have campaign and lead info
    if (campaignId && leadId) {
      try {
        const supabase = await createClient()

        // Get IP and user agent
        const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                          request.headers.get('x-real-ip') ||
                          'unknown'
        const userAgent = request.headers.get('user-agent') || 'unknown'

        // Get organization from campaign
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('organization_id')
          .eq('id', campaignId)
          .single() as { data: { organization_id: string } | null }

        if (campaign) {
          // Record click event
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('email_events') as any)
            .insert({
              organization_id: campaign.organization_id,
              campaign_id: campaignId,
              lead_id: leadId,
              event_type: 'clicked',
              event_data: {
                url: originalUrl,
                domain: targetUrl.hostname,
              },
              ip_address: ipAddress,
              user_agent: userAgent,
              timestamp: new Date().toISOString(),
            })

          // Update campaign stats
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.rpc as any)('increment_campaign_stat', {
            p_campaign_id: campaignId,
            p_stat: 'clicked',
          })
        }
      } catch (trackError) {
        // Log but don't block redirect
        console.error('Error tracking click:', trackError)
      }
    }

    // Redirect to original URL
    return NextResponse.redirect(targetUrl.toString())
  } catch (error) {
    console.error('Track click error:', error)
    return NextResponse.redirect(process.env.NEXT_PUBLIC_APP_URL || 'https://example.com')
  }
}

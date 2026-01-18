import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordEmailClick } from '@/lib/smtp/tracking'

// Simple in-memory rate limiter (IP -> { count, resetAt })
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 200 // 200 click requests per minute per IP (higher than opens)

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

// Validate tracking ID format (32 character hex string)
function isValidTrackingId(trackingId: string): boolean {
  return /^[a-f0-9]{32}$/i.test(trackingId)
}

// Validate UUID format
function isValidUuid(id: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
}

// Blocked URL patterns to prevent SSRF
const BLOCKED_URL_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/0\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/169\.254\./,
  /^https?:\/\/\[::1\]/,
  /^https?:\/\/\[fe80:/i,
  /^file:/i,
  /^javascript:/i,
  /^data:/i,
]

// Validate URL is safe for redirect (prevent SSRF)
function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url)

    // Only allow http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }

    // Check against blocked patterns
    for (const pattern of BLOCKED_URL_PATTERNS) {
      if (pattern.test(url)) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

// GET /api/track/click - Track link clicks and redirect
// Supports two tracking methods:
// 1. Legacy: ?url=<encoded>&campaign=<id>&lead=<id>
// 2. New: ?t=<trackingId>&u=<base64url>
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const fallbackUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://example.com'

    // Get IP for rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') ||
               'unknown'

    // Rate limit check
    if (isRateLimited(ip)) {
      console.warn(`Click rate limit exceeded for IP: ${ip}`)
      return NextResponse.redirect(fallbackUrl, { status: 302 })
    }

    // Check for new tracking format first
    const trackingId = searchParams.get('t')
    const base64Url = searchParams.get('u')

    if (trackingId && base64Url) {
      // Validate tracking ID format
      if (!isValidTrackingId(trackingId)) {
        return NextResponse.redirect(fallbackUrl, { status: 302 })
      }

      // New tracking format
      let originalUrl: string
      try {
        originalUrl = Buffer.from(base64Url, 'base64url').toString('utf-8')
        new URL(originalUrl) // Validate URL format
      } catch {
        return NextResponse.redirect(fallbackUrl)
      }

      // Validate URL is safe for redirect (prevent SSRF)
      if (!isValidRedirectUrl(originalUrl)) {
        console.warn(`Blocked unsafe redirect URL: ${originalUrl}`)
        return NextResponse.redirect(fallbackUrl, { status: 302 })
      }

      // Record click asynchronously
      recordEmailClick(trackingId, originalUrl, request).catch((err) => {
        console.error('Failed to record email click:', err)
      })

      return NextResponse.redirect(originalUrl, { status: 302 })
    }

    // Legacy tracking format
    const encodedUrl = searchParams.get('url')
    const campaignId = searchParams.get('campaign')
    const leadId = searchParams.get('lead')

    if (!encodedUrl) {
      return NextResponse.redirect(fallbackUrl)
    }

    // Decode the original URL
    const originalUrl = decodeURIComponent(encodedUrl)

    // Validate URL format
    let targetUrl: URL
    try {
      targetUrl = new URL(originalUrl)
    } catch {
      return NextResponse.redirect(fallbackUrl)
    }

    // Validate URL is safe for redirect (prevent SSRF)
    if (!isValidRedirectUrl(originalUrl)) {
      console.warn(`Blocked unsafe redirect URL: ${originalUrl}`)
      return NextResponse.redirect(fallbackUrl, { status: 302 })
    }

    // Validate campaign/lead IDs if provided
    if (campaignId && !isValidUuid(campaignId)) {
      return NextResponse.redirect(targetUrl.toString())
    }
    if (leadId && !isValidUuid(leadId)) {
      return NextResponse.redirect(targetUrl.toString())
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
          .single()

        if (campaign) {
          // Use admin client for insert to bypass RLS
          const adminClient = createAdminClient()
          // Record click event
          await adminClient
            .from('email_events')
            .insert({
              organization_id: campaign.organization_id,
              campaign_id: campaignId,
              lead_id: leadId,
              event_type: 'clicked',
              recipient_email: '',
              clicked_url: originalUrl,
              event_data: {
                domain: targetUrl.hostname,
              },
              ip_address: ipAddress,
              user_agent: userAgent,
              occurred_at: new Date().toISOString(),
            })

          // Update campaign stats
          await supabase.rpc('increment_campaign_stat', {
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

// Email Tracking Utilities
// Generate tracking pixels and click wrappers, process tracking events

import { createClient } from '../supabase/server';
import { randomBytes } from 'crypto';

// Base URL for tracking endpoints (set in env)
const TRACKING_BASE_URL = process.env.TRACKING_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '';

// Generate a unique tracking ID
export function generateTrackingId(): string {
  return randomBytes(16).toString('hex');
}

// Generate tracking pixel HTML for email opens
export function generateTrackingPixel(trackingId: string): string {
  const pixelUrl = `${TRACKING_BASE_URL}/api/track/open/${trackingId}`;
  return `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;border:0;height:1px;width:1px;" />`;
}

// Generate click-wrapped URL
export function generateClickWrapper(
  originalUrl: string,
  trackingId: string,
  linkIndex?: number
): string {
  const params = new URLSearchParams({
    t: trackingId,
    u: Buffer.from(originalUrl).toString('base64url'),
  });
  if (linkIndex !== undefined) {
    params.set('i', linkIndex.toString());
  }
  return `${TRACKING_BASE_URL}/api/track/click?${params.toString()}`;
}

// Process all links in HTML and wrap them for tracking
export function wrapLinksForTracking(html: string, trackingId: string): string {
  let linkIndex = 0;

  // Match href attributes in anchor tags
  return html.replace(
    /<a([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
    (match, before, url, after) => {
      // Skip mailto, tel, and anchor links
      if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {
        return match;
      }

      // Skip unsubscribe links (keep them direct for compliance)
      if (url.includes('unsubscribe') || url.includes('optout')) {
        return match;
      }

      const wrappedUrl = generateClickWrapper(url, trackingId, linkIndex++);
      return `<a${before}href="${wrappedUrl}"${after}>`;
    }
  );
}

// Add tracking pixel to HTML email
export function addTrackingToEmail(
  html: string,
  trackingId: string,
  options: {
    trackOpens?: boolean;
    trackClicks?: boolean;
  } = {}
): string {
  const { trackOpens = true, trackClicks = true } = options;

  let trackedHtml = html;

  // Wrap links for click tracking
  if (trackClicks) {
    trackedHtml = wrapLinksForTracking(trackedHtml, trackingId);
  }

  // Add open tracking pixel before closing body tag
  if (trackOpens) {
    const pixel = generateTrackingPixel(trackingId);

    if (trackedHtml.includes('</body>')) {
      trackedHtml = trackedHtml.replace('</body>', `${pixel}</body>`);
    } else {
      // No body tag, append to end
      trackedHtml = `${trackedHtml}${pixel}`;
    }
  }

  return trackedHtml;
}

// Process tracking event from webhook or tracking endpoint
export async function processTrackingEvent(
  trackingId: string,
  eventType: 'opened' | 'clicked',
  metadata: {
    clickedUrl?: string;
    userAgent?: string;
    ipAddress?: string;
    timestamp?: Date;
  } = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    // Find the email by tracking ID
    const { data: email, error: findError } = await supabase
      .from('email_queue')
      .select('id, workspace_id, campaign_id, lead_id, to_email, message_id')
      .eq('tracking_id', trackingId)
      .single();

    if (findError || !email) {
      return { success: false, error: 'Tracking ID not found' };
    }

    // Parse user agent for device info
    const deviceInfo = parseUserAgent(metadata.userAgent);

    // Get geo location from IP (simplified - would use MaxMind or similar in production)
    const geoInfo = await getGeoFromIP(metadata.ipAddress);

    // Check for duplicate events (within 5 minutes for opens, always for clicks)
    const dedupeWindow = eventType === 'opened' ? 5 * 60 * 1000 : 0;

    if (dedupeWindow > 0) {
      const { data: recentEvent } = await supabase
        .from('email_events')
        .select('id')
        .eq('tracking_id', trackingId)
        .eq('event_type', eventType)
        .gte('occurred_at', new Date(Date.now() - dedupeWindow).toISOString())
        .limit(1)
        .single();

      if (recentEvent) {
        // Skip duplicate open
        return { success: true };
      }
    }

    // Record the event
    const { error: insertError } = await supabase.from('email_events').insert({
      workspace_id: email.workspace_id,
      email_queue_id: email.id,
      campaign_id: email.campaign_id,
      message_id: email.message_id,
      tracking_id: trackingId,
      event_type: eventType,
      recipient_email: email.to_email,
      lead_id: email.lead_id,
      clicked_url: metadata.clickedUrl,
      user_agent: metadata.userAgent,
      ip_address: metadata.ipAddress,
      geo_country: geoInfo?.country,
      geo_city: geoInfo?.city,
      device_type: deviceInfo?.deviceType,
      occurred_at: (metadata.timestamp || new Date()).toISOString(),
    });

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Convenience function for recording opens
export async function recordEmailOpen(
  trackingId: string,
  request: { headers: Headers }
): Promise<{ success: boolean }> {
  const userAgent = request.headers.get('user-agent') || undefined;
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                   request.headers.get('x-real-ip') ||
                   undefined;

  return processTrackingEvent(trackingId, 'opened', {
    userAgent,
    ipAddress,
    timestamp: new Date(),
  });
}

// Convenience function for recording clicks
export async function recordEmailClick(
  trackingId: string,
  url: string,
  request: { headers: Headers }
): Promise<{ success: boolean }> {
  const userAgent = request.headers.get('user-agent') || undefined;
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                   request.headers.get('x-real-ip') ||
                   undefined;

  return processTrackingEvent(trackingId, 'clicked', {
    clickedUrl: url,
    userAgent,
    ipAddress,
    timestamp: new Date(),
  });
}

// Parse user agent for device type
function parseUserAgent(userAgent?: string): { deviceType: string } | null {
  if (!userAgent) return null;

  const ua = userAgent.toLowerCase();

  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return { deviceType: 'mobile' };
  }
  if (ua.includes('tablet') || ua.includes('ipad')) {
    return { deviceType: 'tablet' };
  }
  if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
    return { deviceType: 'bot' };
  }

  return { deviceType: 'desktop' };
}

// Get geo location from IP (stub - use MaxMind GeoIP2 in production)
async function getGeoFromIP(
  ipAddress?: string
): Promise<{ country?: string; city?: string } | null> {
  if (!ipAddress) return null;

  // In production, integrate with MaxMind GeoIP2 or similar service
  // For now, return null
  return null;
}

// Get tracking statistics for a campaign or email
export async function getTrackingStats(
  workspaceId: string,
  filters: {
    campaignId?: string;
    emailQueueId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<{
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}> {
  const supabase = await createClient();

  // Build query for email queue stats
  let queueQuery = supabase
    .from('email_queue')
    .select('status', { count: 'exact' })
    .eq('workspace_id', workspaceId);

  if (filters.campaignId) {
    queueQuery = queueQuery.eq('campaign_id', filters.campaignId);
  }
  if (filters.startDate) {
    queueQuery = queueQuery.gte('sent_at', filters.startDate.toISOString());
  }
  if (filters.endDate) {
    queueQuery = queueQuery.lte('sent_at', filters.endDate.toISOString());
  }

  // Get counts by status
  const statuses = ['sent', 'delivered', 'bounced'];
  const counts: Record<string, number> = {};

  for (const status of statuses) {
    const { count } = await supabase
      .from('email_queue')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', status)
      .match(filters.campaignId ? { campaign_id: filters.campaignId } : {});

    counts[status] = count || 0;
  }

  // Get event counts
  let eventsQuery = supabase
    .from('email_events')
    .select('event_type', { count: 'exact' })
    .eq('workspace_id', workspaceId);

  if (filters.campaignId) {
    eventsQuery = eventsQuery.eq('campaign_id', filters.campaignId);
  }

  const eventTypes = ['opened', 'clicked', 'complained'];
  const eventCounts: Record<string, number> = {};

  for (const eventType of eventTypes) {
    const { count } = await supabase
      .from('email_events')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('event_type', eventType)
      .match(filters.campaignId ? { campaign_id: filters.campaignId } : {});

    eventCounts[eventType] = count || 0;
  }

  const sent = counts.sent + counts.delivered + counts.bounced;
  const delivered = counts.delivered;
  const opened = eventCounts.opened;
  const clicked = eventCounts.clicked;
  const bounced = counts.bounced;
  const complained = eventCounts.complained;

  return {
    sent,
    delivered,
    opened,
    clicked,
    bounced,
    complained,
    openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
    clickRate: delivered > 0 ? (clicked / delivered) * 100 : 0,
    bounceRate: sent > 0 ? (bounced / sent) * 100 : 0,
  };
}

// Get unique opens/clicks (by recipient)
export async function getUniqueTrackingStats(
  workspaceId: string,
  campaignId?: string
): Promise<{
  uniqueOpens: number;
  uniqueClicks: number;
  uniqueOpenRate: number;
  uniqueClickRate: number;
  totalDelivered: number;
}> {
  const supabase = await createClient();

  // Get total delivered
  let deliveredQuery = supabase
    .from('email_queue')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'delivered');

  if (campaignId) {
    deliveredQuery = deliveredQuery.eq('campaign_id', campaignId);
  }

  const { count: totalDelivered } = await deliveredQuery;

  // Get unique opens (distinct recipients)
  const { data: uniqueOpensData } = await supabase.rpc(
    'count_unique_recipients',
    {
      p_workspace_id: workspaceId,
      p_campaign_id: campaignId,
      p_event_type: 'opened',
    }
  );

  // Get unique clicks (distinct recipients)
  const { data: uniqueClicksData } = await supabase.rpc(
    'count_unique_recipients',
    {
      p_workspace_id: workspaceId,
      p_campaign_id: campaignId,
      p_event_type: 'clicked',
    }
  );

  const uniqueOpens = uniqueOpensData || 0;
  const uniqueClicks = uniqueClicksData || 0;
  const delivered = totalDelivered || 0;

  return {
    uniqueOpens,
    uniqueClicks,
    uniqueOpenRate: delivered > 0 ? (uniqueOpens / delivered) * 100 : 0,
    uniqueClickRate: delivered > 0 ? (uniqueClicks / delivered) * 100 : 0,
    totalDelivered: delivered,
  };
}

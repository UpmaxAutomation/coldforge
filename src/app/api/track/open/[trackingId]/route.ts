// Email Open Tracking Endpoint
// Returns a 1x1 transparent pixel and records the open event

import { NextRequest, NextResponse } from 'next/server';
import { recordEmailOpen } from '@/lib/smtp/tracking';

// 1x1 transparent GIF pixel
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// Simple in-memory rate limiter (IP -> { count, resetAt })
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

// Validate tracking ID format (32 character hex string)
function isValidTrackingId(trackingId: string): boolean {
  return /^[a-f0-9]{32}$/i.test(trackingId);
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
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> }
) {
  const { trackingId } = await params;

  // Get IP for rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
             request.headers.get('x-real-ip') ||
             'unknown';

  // Rate limit check - still return pixel to avoid detection
  if (isRateLimited(ip)) {
    console.warn(`Rate limit exceeded for IP: ${ip}`);
    return pixelResponse();
  }

  // Validate tracking ID format before database lookup
  if (!isValidTrackingId(trackingId)) {
    // Invalid format - return pixel but don't record
    return pixelResponse();
  }

  // Record the open event asynchronously (don't block response)
  recordEmailOpen(trackingId, request).catch((err) => {
    console.error('Failed to record email open:', err);
  });

  // Return the tracking pixel
  return pixelResponse();
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkDomainAvailability } from '@/lib/domains/purchase'
import {
  AuthenticationError,
  ValidationError,
} from '@/lib/errors'
import { handleApiError } from '@/lib/errors/handler'

// GET /api/domains/check?domain=example.com - Check domain availability
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new AuthenticationError()
    }

    // Get domain from query params
    const { searchParams } = new URL(request.url)
    const domain = searchParams.get('domain')

    if (!domain) {
      throw new ValidationError('Domain query parameter is required')
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/
    if (!domainRegex.test(domain)) {
      throw new ValidationError('Invalid domain format')
    }

    // Check availability
    const availability = await checkDomainAvailability(domain.toLowerCase())

    return NextResponse.json({
      domain: domain.toLowerCase(),
      available: availability.available,
      price: availability.price,
      currency: availability.currency || 'USD',
      premium: availability.premium || false
    })
  } catch (error) {
    return handleApiError(error)
  }
}

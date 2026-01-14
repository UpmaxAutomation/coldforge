import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createLeadSchema,
  listLeadsQuerySchema,
} from '@/lib/schemas'
import {
  apiLimiter,
  writeLimiter,
  applyRateLimit,
  addRateLimitHeaders,
} from '@/lib/rate-limit/middleware'
import {
  AuthenticationError,
  BadRequestError,
  DatabaseError,
  ValidationError,
} from '@/lib/errors'
import { handleApiError } from '@/lib/errors/handler'

// GET /api/leads - List all leads
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
    const { searchParams } = new URL(request.url)
    const queryResult = listLeadsQuerySchema.safeParse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
      listId: searchParams.get('listId'),
    })

    const { page, limit, listId } = queryResult.success
      ? queryResult.data
      : { page: 1, limit: 50, listId: undefined }

    const offset = (page - 1) * limit

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from('leads') as any)
      .select('*', { count: 'exact' })
      .eq('organization_id', userData.organization_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (listId) {
      query = query.eq('list_id', listId)
    }

    const { data: leads, error, count } = await query

    if (error) {
      throw new DatabaseError('Failed to fetch leads', { originalError: String(error) })
    }

    const jsonResponse = NextResponse.json({
      leads,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
    return addRateLimitHeaders(jsonResponse, result)
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/leads - Create a new lead
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

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: { organization_id: string } | null }

    if (!userData?.organization_id) {
      throw new BadRequestError('No organization found')
    }

    const body = await request.json()

    // Validate request body with Zod schema
    const validationResult = createLeadSchema.safeParse(body)
    if (!validationResult.success) {
      throw new ValidationError(
        validationResult.error.issues[0]?.message || 'Invalid request body',
        { issues: validationResult.error.issues }
      )
    }

    const { email, firstName, lastName, company, title, phone, linkedinUrl, listId, customFields } = validationResult.data

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error } = await (supabase.from('leads') as any)
      .insert({
        organization_id: userData.organization_id,
        email,
        first_name: firstName,
        last_name: lastName,
        company,
        title,
        phone,
        linkedin_url: linkedinUrl,
        list_id: listId,
        custom_fields: customFields || {},
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      throw new DatabaseError('Failed to create lead', { originalError: String(error) })
    }

    const jsonResponse = NextResponse.json({ lead }, { status: 201 })
    return addRateLimitHeaders(jsonResponse, result)
  } catch (error) {
    return handleApiError(error)
  }
}

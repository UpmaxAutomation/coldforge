import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  purchaseDomain,
  type DomainPurchaseRequest
} from '@/lib/domains/purchase'
import {
  AuthenticationError,
  BadRequestError,
  ConflictError,
  DatabaseError,
  ValidationError,
} from '@/lib/errors'
import { handleApiError } from '@/lib/errors/handler'
import type { Database, Tables } from '@/types/database'

type DomainRow = Tables<'domains'>
type UserRow = Tables<'users'>
type DomainInsert = Database['public']['Tables']['domains']['Insert']

// POST /api/domains/purchase - Purchase a new domain
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new AuthenticationError()
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single() as { data: Pick<UserRow, 'organization_id'> | null }

    if (!profile?.organization_id) {
      throw new BadRequestError('No organization found')
    }

    const body = await request.json()
    const { domain, registrar, years } = body as Partial<DomainPurchaseRequest>

    // Validate required fields
    if (!domain) {
      throw new ValidationError('Domain is required')
    }

    if (!registrar || !['cloudflare', 'namecheap', 'porkbun'].includes(registrar)) {
      throw new ValidationError('Valid registrar is required (cloudflare, namecheap, or porkbun)')
    }

    if (!years || years < 1 || years > 10) {
      throw new ValidationError('Years must be between 1 and 10')
    }

    // Check if domain already exists in organization
    const { data: existingDomain } = await supabase
      .from('domains')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('domain', domain.toLowerCase())
      .single()

    if (existingDomain) {
      throw new ConflictError('Domain already exists in your organization')
    }

    // Attempt to purchase domain
    const purchaseResult = await purchaseDomain({
      domain: domain.toLowerCase(),
      registrar,
      years,
      orgId: profile.organization_id
    })

    if (!purchaseResult.success) {
      throw new BadRequestError(purchaseResult.error || 'Domain purchase failed')
    }

    // Store domain in database using admin client to bypass RLS
    const adminClient = createAdminClient()
    const domainInsert: DomainInsert = {
      organization_id: profile.organization_id,
      domain: domain.toLowerCase(),
      registrar,
      dns_provider: registrar, // Same as registrar for purchased domains
      spf_configured: false,
      dkim_configured: false,
      dkim_selector: null,
      dmarc_configured: false,
      bimi_configured: false,
      health_status: 'pending',
      last_health_check: null,
      auto_purchased: true,
      purchase_price: null, // Would be set from actual API response
      expires_at: purchaseResult.expiresAt?.toISOString() || null,
    }
    const { data: newDomain, error } = await ((adminClient
      .from('domains') as ReturnType<typeof adminClient.from>)
      .insert(domainInsert)
      .select()
      .single() as unknown as Promise<{ data: DomainRow | null; error: Error | null }>)

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictError('Domain already exists')
      }
      throw new DatabaseError('Failed to store domain', { originalError: String(error) })
    }

    return NextResponse.json({
      success: true,
      domain: newDomain,
      purchase: {
        registrar: purchaseResult.registrar,
        expiresAt: purchaseResult.expiresAt
      }
    }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkDomainHealth } from '@/lib/domains/health'
import {
  AuthenticationError,
  BadRequestError,
  NotFoundError,
} from '@/lib/errors'
import { handleApiError } from '@/lib/errors/handler'

// GET /api/domains/[id]/health - Check domain health
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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
      .single() as { data: { organization_id: string } | null }

    if (!profile?.organization_id) {
      throw new BadRequestError('No organization found')
    }

    // Get domain
    const { data: domain, error } = await supabase
      .from('domains')
      .select('*')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .single() as { data: { id: string; domain: string } | null; error: unknown }

    if (error || !domain) {
      throw new NotFoundError('Domain', id)
    }

    // Check domain health
    const health = await checkDomainHealth(domain.domain)

    // Update domain health status in database
    await (supabase
      .from('domains') as unknown as { update: (data: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<void> } })
      .update({
        spf_configured: health.checks.spf.valid,
        dkim_configured: health.checks.dkim.valid,
        dmarc_configured: health.checks.dmarc.valid,
        health_status: health.overallScore >= 90 ? 'healthy' : health.overallScore >= 50 ? 'warning' : 'error',
        last_health_check: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({ health })
  } catch (error) {
    return handleApiError(error)
  }
}

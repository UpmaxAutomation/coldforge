import { createClient } from '@/lib/supabase/server'

export type BounceType = 'hard' | 'soft' | 'complaint' | 'unsubscribe'

export interface BounceEvent {
  email: string
  type: BounceType
  reason: string
  timestamp: Date
}

export function classifyBounce(errorMessage: string): { type: BounceType; reason: string } {
  const lower = errorMessage.toLowerCase()

  if (lower.includes('does not exist') || lower.includes('user unknown') || lower.includes('no such user')) {
    return { type: 'hard', reason: 'Email address does not exist' }
  }
  if (lower.includes('mailbox full') || lower.includes('quota exceeded')) {
    return { type: 'soft', reason: 'Mailbox full' }
  }
  if (lower.includes('spam') || lower.includes('blocked')) {
    return { type: 'hard', reason: 'Blocked as spam' }
  }
  if (lower.includes('temporarily') || lower.includes('try again')) {
    return { type: 'soft', reason: 'Temporary failure' }
  }

  return { type: 'soft', reason: 'Unknown error' }
}

/**
 * Process bounces for a lead and update their status accordingly
 * - Hard bounce: Mark lead as bounced (permanent failure)
 * - Soft bounce: Increment soft bounce counter, mark as bounced after 3 soft bounces
 * - Complaint: Mark lead as complained
 * - Unsubscribe: Mark lead as unsubscribed
 */
export async function processBouncesForLead(leadId: string, bounceType: BounceType): Promise<void> {
  const supabase = await createClient()

  // Get current lead data
  const { data: lead, error: fetchError } = await supabase
    .from('leads')
    .select('id, status, custom_fields')
    .eq('id', leadId)
    .single()

  if (fetchError || !lead) {
    console.error('Failed to fetch lead for bounce processing:', fetchError)
    return
  }

  // Don't update if lead is already in a terminal state
  if (lead.status === 'bounced' || lead.status === 'complained') {
    return
  }

  const customFields = (lead.custom_fields as Record<string, unknown>) || {}

  switch (bounceType) {
    case 'hard':
      // Hard bounce - immediately mark as bounced
      await supabase
        .from('leads')
        .update({
          status: 'bounced',
          validation_status: 'invalid',
          custom_fields: {
            ...customFields,
            bounce_type: 'hard',
            bounced_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)

      // Also update any campaign_leads entries for this lead
      await supabase
        .from('campaign_leads')
        .update({ status: 'bounced' })
        .eq('lead_id', leadId)
        .neq('status', 'completed')
      break

    case 'soft':
      // Soft bounce - track count and mark as bounced after 3 soft bounces
      const softBounceCount = ((customFields.soft_bounce_count as number) || 0) + 1

      if (softBounceCount >= 3) {
        // Too many soft bounces, treat as hard bounce
        await supabase
          .from('leads')
          .update({
            status: 'bounced',
            validation_status: 'invalid',
            custom_fields: {
              ...customFields,
              bounce_type: 'soft_exceeded',
              soft_bounce_count: softBounceCount,
              bounced_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', leadId)

        await supabase
          .from('campaign_leads')
          .update({ status: 'bounced' })
          .eq('lead_id', leadId)
          .neq('status', 'completed')
      } else {
        // Just increment counter, keep lead active for retry
        await supabase
          .from('leads')
          .update({
            custom_fields: {
              ...customFields,
              soft_bounce_count: softBounceCount,
              last_soft_bounce_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', leadId)
      }
      break

    case 'complaint':
      // Spam complaint - mark as complained and stop all campaigns
      await supabase
        .from('leads')
        .update({
          status: 'complained',
          custom_fields: {
            ...customFields,
            complained_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)

      // Stop all campaigns for this lead
      await supabase
        .from('campaign_leads')
        .update({ status: 'unsubscribed' })
        .eq('lead_id', leadId)
        .neq('status', 'completed')
      break

    case 'unsubscribe':
      // Unsubscribe - mark as unsubscribed
      await supabase
        .from('leads')
        .update({
          status: 'unsubscribed',
          custom_fields: {
            ...customFields,
            unsubscribed_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)

      // Stop all campaigns for this lead
      await supabase
        .from('campaign_leads')
        .update({ status: 'unsubscribed' })
        .eq('lead_id', leadId)
        .neq('status', 'completed')
      break
  }
}

import { createClient } from '@/lib/supabase/server'

export interface AuditEvent {
  user_id: string
  organization_id?: string
  action: AuditAction
  resource_type: ResourceType
  resource_id?: string
  details?: Record<string, unknown>
  ip_address?: string
  user_agent?: string
}

export type AuditAction =
  | 'create' | 'read' | 'update' | 'delete'
  | 'login' | 'logout' | 'password_change' | 'email_change'
  | 'api_key_create' | 'api_key_revoke'
  | 'invite_user' | 'remove_user' | 'role_change'
  | 'settings_change' | 'billing_change'
  | 'campaign_start' | 'campaign_pause' | 'campaign_delete'
  | 'export_data' | 'import_data'

export type ResourceType =
  | 'user' | 'organization' | 'campaign' | 'lead'
  | 'email_account' | 'domain' | 'mailbox'
  | 'api_key' | 'webhook' | 'settings'

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const supabase = await createClient()

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[AUDIT]', JSON.stringify(event, null, 2))
    }

    // Insert into audit_logs table (if it exists)
    // If table doesn't exist, just log to console
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('audit_logs') as any).insert({
      ...event,
      created_at: new Date().toISOString()
    }).catch(() => {
      // Table might not exist yet - that's OK
      console.log('[AUDIT] (no table)', JSON.stringify(event))
    })
  } catch (error) {
    // Never fail the request due to audit logging
    console.error('[AUDIT ERROR]', error)
  }
}

// Helper for common patterns
export function createAuditLogger(userId: string, organizationId?: string) {
  return {
    log: (
      action: AuditAction,
      resourceType: ResourceType,
      resourceId?: string,
      details?: Record<string, unknown>
    ) => logAuditEvent({
      user_id: userId,
      organization_id: organizationId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details
    })
  }
}

// Async version that doesn't block
export function logAuditEventAsync(event: AuditEvent): void {
  // Fire and forget - don't await
  logAuditEvent(event).catch(err => {
    console.error('[AUDIT ASYNC ERROR]', err)
  })
}

// Helper to extract request metadata
export function getRequestMetadata(request: Request): { ip_address?: string; user_agent?: string } {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const userAgent = request.headers.get('user-agent')

  return {
    ip_address: forwardedFor?.split(',')[0]?.trim() || undefined,
    user_agent: userAgent || undefined
  }
}

import { NextRequest } from 'next/server'
import { logAuditEvent, AuditAction, ResourceType } from '.'

export function withAuditLog(
  action: AuditAction,
  resourceType: ResourceType,
  extractResourceId?: (req: NextRequest) => string | undefined
) {
  return async (req: NextRequest, userId: string, orgId?: string) => {
    await logAuditEvent({
      user_id: userId,
      organization_id: orgId,
      action,
      resource_type: resourceType,
      resource_id: extractResourceId?.(req),
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || undefined,
      user_agent: req.headers.get('user-agent') || undefined
    })
  }
}

// Pre-configured audit loggers for common operations
export const auditLoggers = {
  // Campaign operations
  campaignCreate: withAuditLog('create', 'campaign'),
  campaignUpdate: withAuditLog('update', 'campaign', (req) => req.nextUrl.pathname.split('/').pop()),
  campaignDelete: withAuditLog('campaign_delete', 'campaign', (req) => req.nextUrl.pathname.split('/').pop()),
  campaignStart: withAuditLog('campaign_start', 'campaign', (req) => req.nextUrl.pathname.split('/')[3]),
  campaignPause: withAuditLog('campaign_pause', 'campaign', (req) => req.nextUrl.pathname.split('/')[3]),

  // Email account operations
  emailAccountCreate: withAuditLog('create', 'email_account'),
  emailAccountUpdate: withAuditLog('update', 'email_account', (req) => req.nextUrl.pathname.split('/').pop()),
  emailAccountDelete: withAuditLog('delete', 'email_account', (req) => req.nextUrl.pathname.split('/').pop()),

  // API key operations
  apiKeyCreate: withAuditLog('api_key_create', 'api_key'),
  apiKeyRevoke: withAuditLog('api_key_revoke', 'api_key'),

  // Organization operations
  organizationUpdate: withAuditLog('settings_change', 'organization'),

  // User operations
  userInvite: withAuditLog('invite_user', 'user'),
  userRemove: withAuditLog('remove_user', 'user'),
  roleChange: withAuditLog('role_change', 'user'),

  // Auth operations
  login: withAuditLog('login', 'user'),
  logout: withAuditLog('logout', 'user'),
}

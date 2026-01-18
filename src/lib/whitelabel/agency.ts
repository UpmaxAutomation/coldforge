// Agency Management
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import type {
  Agency,
  AgencyPlan,
  AgencySettings,
  AgencyBranding,
  AgencyMember,
  AgencyRole,
  AgencyPermission,
  AgencyInvitation,
  AgencyAnalytics,
  AGENCY_PLAN_LIMITS,
  DEFAULT_BRANDING,
  DEFAULT_AGENCY_SETTINGS,
} from './types';

// Create Agency
export async function createAgency(
  ownerId: string,
  options: {
    name: string;
    slug?: string;
    plan?: AgencyPlan;
    branding?: Partial<AgencyBranding>;
    settings?: Partial<AgencySettings>;
  }
): Promise<Agency> {
  const supabase = await createClient();

  // Generate slug if not provided
  const slug =
    options.slug || options.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

  // Check if slug is available
  const { data: existing } = await supabase
    .from('agencies')
    .select('id')
    .eq('slug', slug)
    .single();

  if (existing) {
    throw new Error('Agency slug already exists');
  }

  const plan = options.plan || 'starter';
  const limits = AGENCY_PLAN_LIMITS[plan];

  const { data, error } = await supabase
    .from('agencies')
    .insert({
      name: options.name,
      slug,
      owner_id: ownerId,
      plan,
      status: 'trial',
      branding: { ...DEFAULT_BRANDING, ...options.branding },
      settings: { ...DEFAULT_AGENCY_SETTINGS, ...options.settings },
      limits,
    })
    .select()
    .single();

  if (error) throw error;

  // Add owner as agency member
  await supabase.from('agency_members').insert({
    agency_id: data.id,
    user_id: ownerId,
    role: 'owner',
    permissions: [
      'manage_agency',
      'manage_billing',
      'manage_members',
      'manage_subaccounts',
      'access_all_subaccounts',
      'manage_branding',
      'manage_domains',
      'view_analytics',
      'export_data',
      'impersonate_users',
    ],
    sub_account_access: 'all',
  });

  return mapAgency(data);
}

// Get Agency by ID
export async function getAgency(agencyId: string): Promise<Agency | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('agencies')
    .select('*')
    .eq('id', agencyId)
    .single();

  if (error || !data) return null;

  return mapAgency(data);
}

// Get Agency by Slug
export async function getAgencyBySlug(slug: string): Promise<Agency | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('agencies')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !data) return null;

  return mapAgency(data);
}

// Get Agencies for User
export async function getUserAgencies(userId: string): Promise<Agency[]> {
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from('agency_members')
    .select('agency_id')
    .eq('user_id', userId);

  if (!memberships?.length) return [];

  const agencyIds = memberships.map((m) => m.agency_id);

  const { data: agencies } = await supabase
    .from('agencies')
    .select('*')
    .in('id', agencyIds)
    .order('created_at', { ascending: false });

  return (agencies || []).map(mapAgency);
}

// Update Agency
export async function updateAgency(
  agencyId: string,
  updates: {
    name?: string;
    settings?: Partial<AgencySettings>;
    branding?: Partial<AgencyBranding>;
  }
): Promise<Agency> {
  const supabase = await createClient();

  const { data: current } = await supabase
    .from('agencies')
    .select('settings, branding')
    .eq('id', agencyId)
    .single();

  if (!current) {
    throw new Error('Agency not found');
  }

  const updateData: Record<string, unknown> = {};

  if (updates.name) {
    updateData.name = updates.name;
  }

  if (updates.settings) {
    updateData.settings = { ...current.settings, ...updates.settings };
  }

  if (updates.branding) {
    updateData.branding = { ...current.branding, ...updates.branding };
  }

  const { data, error } = await supabase
    .from('agencies')
    .update(updateData)
    .eq('id', agencyId)
    .select()
    .single();

  if (error) throw error;

  return mapAgency(data);
}

// Update Agency Plan
export async function updateAgencyPlan(
  agencyId: string,
  plan: AgencyPlan,
  customLimits?: Partial<typeof AGENCY_PLAN_LIMITS.custom>
): Promise<Agency> {
  const supabase = await createClient();

  const limits = plan === 'custom' && customLimits
    ? { ...AGENCY_PLAN_LIMITS.custom, ...customLimits }
    : AGENCY_PLAN_LIMITS[plan];

  const { data, error } = await supabase
    .from('agencies')
    .update({ plan, limits, status: 'active' })
    .eq('id', agencyId)
    .select()
    .single();

  if (error) throw error;

  return mapAgency(data);
}

// Suspend Agency
export async function suspendAgency(
  agencyId: string,
  reason?: string
): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('agencies')
    .update({
      status: 'suspended',
      suspension_reason: reason,
      suspended_at: new Date().toISOString(),
    })
    .eq('id', agencyId);

  // Also suspend all sub-accounts
  await supabase
    .from('sub_accounts')
    .update({ status: 'suspended' })
    .eq('agency_id', agencyId);
}

// Reactivate Agency
export async function reactivateAgency(agencyId: string): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('agencies')
    .update({
      status: 'active',
      suspension_reason: null,
      suspended_at: null,
    })
    .eq('id', agencyId);

  // Reactivate sub-accounts
  await supabase
    .from('sub_accounts')
    .update({ status: 'active' })
    .eq('agency_id', agencyId)
    .eq('status', 'suspended');
}

// ============================================
// Agency Members
// ============================================

// Get Agency Members
export async function getAgencyMembers(
  agencyId: string
): Promise<AgencyMember[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('agency_members')
    .select('*, users(email, full_name, avatar_url)')
    .eq('agency_id', agencyId)
    .order('joined_at', { ascending: true });

  if (error) throw error;

  return (data || []).map(mapAgencyMember);
}

// Get Agency Member
export async function getAgencyMember(
  agencyId: string,
  userId: string
): Promise<AgencyMember | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('agency_members')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  return mapAgencyMember(data);
}

// Check if user has agency permission
export async function hasAgencyPermission(
  agencyId: string,
  userId: string,
  permission: AgencyPermission
): Promise<boolean> {
  const member = await getAgencyMember(agencyId, userId);
  if (!member) return false;

  // Owner has all permissions
  if (member.role === 'owner') return true;

  return member.permissions.includes(permission);
}

// Update Agency Member
export async function updateAgencyMember(
  agencyId: string,
  userId: string,
  updates: {
    role?: AgencyRole;
    permissions?: AgencyPermission[];
    subAccountAccess?: 'all' | 'assigned' | 'none';
    assignedSubAccounts?: string[];
  }
): Promise<AgencyMember> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('agency_members')
    .update({
      role: updates.role,
      permissions: updates.permissions,
      sub_account_access: updates.subAccountAccess,
      assigned_sub_accounts: updates.assignedSubAccounts,
    })
    .eq('agency_id', agencyId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;

  return mapAgencyMember(data);
}

// Remove Agency Member
export async function removeAgencyMember(
  agencyId: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();

  // Check if owner
  const member = await getAgencyMember(agencyId, userId);
  if (member?.role === 'owner') {
    throw new Error('Cannot remove agency owner');
  }

  await supabase
    .from('agency_members')
    .delete()
    .eq('agency_id', agencyId)
    .eq('user_id', userId);
}

// ============================================
// Agency Invitations
// ============================================

// Create Invitation
export async function createAgencyInvitation(
  agencyId: string,
  invitedBy: string,
  options: {
    email: string;
    role: AgencyRole;
    permissions: AgencyPermission[];
    subAccountAccess?: 'all' | 'assigned' | 'none';
    assignedSubAccounts?: string[];
  }
): Promise<AgencyInvitation> {
  const supabase = await createClient();

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const { data, error } = await supabase
    .from('agency_invitations')
    .insert({
      agency_id: agencyId,
      email: options.email.toLowerCase(),
      role: options.role,
      permissions: options.permissions,
      sub_account_access: options.subAccountAccess || 'none',
      assigned_sub_accounts: options.assignedSubAccounts,
      token,
      expires_at: expiresAt.toISOString(),
      invited_by: invitedBy,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;

  return mapAgencyInvitation(data);
}

// Accept Invitation
export async function acceptAgencyInvitation(
  token: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();

  // Get invitation
  const { data: invitation } = await supabase
    .from('agency_invitations')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .single();

  if (!invitation) {
    throw new Error('Invalid or expired invitation');
  }

  if (new Date(invitation.expires_at) < new Date()) {
    await supabase
      .from('agency_invitations')
      .update({ status: 'expired' })
      .eq('id', invitation.id);
    throw new Error('Invitation has expired');
  }

  // Add as member
  await supabase.from('agency_members').insert({
    agency_id: invitation.agency_id,
    user_id: userId,
    role: invitation.role,
    permissions: invitation.permissions,
    sub_account_access: invitation.sub_account_access,
    assigned_sub_accounts: invitation.assigned_sub_accounts,
    invited_by: invitation.invited_by,
    invited_at: invitation.created_at,
  });

  // Mark invitation as accepted
  await supabase
    .from('agency_invitations')
    .update({ status: 'accepted' })
    .eq('id', invitation.id);
}

// Revoke Invitation
export async function revokeAgencyInvitation(
  invitationId: string
): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('agency_invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId);
}

// Get Pending Invitations
export async function getPendingInvitations(
  agencyId: string
): Promise<AgencyInvitation[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('agency_invitations')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(mapAgencyInvitation);
}

// ============================================
// Agency Analytics
// ============================================

export async function getAgencyAnalytics(
  agencyId: string,
  period?: string // YYYY-MM
): Promise<AgencyAnalytics> {
  const supabase = await createClient();
  const currentPeriod = period || new Date().toISOString().slice(0, 7);

  // Get sub-account metrics
  const { data: subAccounts } = await supabase
    .from('sub_accounts')
    .select('id, status, created_at')
    .eq('agency_id', agencyId);

  const subAccountMetrics = {
    total: subAccounts?.length || 0,
    active: subAccounts?.filter((s) => s.status === 'active').length || 0,
    suspended: subAccounts?.filter((s) => s.status === 'suspended').length || 0,
    new:
      subAccounts?.filter(
        (s) => s.created_at.startsWith(currentPeriod)
      ).length || 0,
    churned: 0, // Would need historical data
  };

  // Get email metrics from all sub-accounts
  const subAccountIds = subAccounts?.map((s) => s.id) || [];

  const { data: emailStats } = await supabase
    .from('daily_metrics')
    .select('*')
    .in('workspace_id', subAccountIds)
    .gte('date', `${currentPeriod}-01`)
    .lte('date', `${currentPeriod}-31`);

  const emailMetrics = {
    totalSent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    replied: 0,
    bounced: 0,
  };

  emailStats?.forEach((stat) => {
    emailMetrics.totalSent += stat.emails_sent || 0;
    emailMetrics.delivered += Math.round(
      (stat.emails_sent || 0) * (stat.delivery_rate || 0)
    );
    emailMetrics.opened += Math.round(
      (stat.emails_sent || 0) * (stat.open_rate || 0)
    );
    emailMetrics.clicked += Math.round(
      (stat.emails_sent || 0) * (stat.click_rate || 0)
    );
    emailMetrics.replied += Math.round(
      (stat.emails_sent || 0) * (stat.reply_rate || 0)
    );
    emailMetrics.bounced += Math.round(
      (stat.emails_sent || 0) * (stat.bounce_rate || 0)
    );
  });

  // Get usage metrics
  const { count: mailboxCount } = await supabase
    .from('mailboxes')
    .select('id', { count: 'exact', head: true })
    .in('workspace_id', subAccountIds);

  const { count: leadCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .in('workspace_id', subAccountIds);

  const { count: campaignCount } = await supabase
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .in('workspace_id', subAccountIds);

  return {
    agencyId,
    period: currentPeriod,
    subAccountMetrics,
    emailMetrics,
    revenueMetrics: {
      mrr: 0, // Would need billing integration
      arr: 0,
      newRevenue: 0,
      churnedRevenue: 0,
      netRevenue: 0,
    },
    usageMetrics: {
      totalMailboxes: mailboxCount || 0,
      totalLeads: leadCount || 0,
      totalCampaigns: campaignCount || 0,
      apiRequests: 0, // Would need API logs
      storageUsedGb: 0, // Would need storage tracking
    },
  };
}

// ============================================
// Mappers
// ============================================

function mapAgency(data: Record<string, unknown>): Agency {
  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    ownerId: data.owner_id as string,
    plan: data.plan as AgencyPlan,
    status: data.status as Agency['status'],
    settings: data.settings as AgencySettings,
    branding: data.branding as AgencyBranding,
    limits: data.limits as Agency['limits'],
    createdAt: new Date(data.created_at as string),
    updatedAt: new Date(data.updated_at as string),
  };
}

function mapAgencyMember(data: Record<string, unknown>): AgencyMember {
  return {
    id: data.id as string,
    agencyId: data.agency_id as string,
    userId: data.user_id as string,
    role: data.role as AgencyRole,
    permissions: data.permissions as AgencyPermission[],
    subAccountAccess: data.sub_account_access as AgencyMember['subAccountAccess'],
    assignedSubAccounts: data.assigned_sub_accounts as string[] | undefined,
    invitedBy: data.invited_by as string | undefined,
    invitedAt: data.invited_at ? new Date(data.invited_at as string) : undefined,
    joinedAt: new Date(data.joined_at as string),
  };
}

function mapAgencyInvitation(data: Record<string, unknown>): AgencyInvitation {
  return {
    id: data.id as string,
    agencyId: data.agency_id as string,
    email: data.email as string,
    role: data.role as AgencyRole,
    permissions: data.permissions as AgencyPermission[],
    subAccountAccess: data.sub_account_access as AgencyInvitation['subAccountAccess'],
    assignedSubAccounts: data.assigned_sub_accounts as string[] | undefined,
    token: data.token as string,
    expiresAt: new Date(data.expires_at as string),
    invitedBy: data.invited_by as string,
    status: data.status as AgencyInvitation['status'],
    createdAt: new Date(data.created_at as string),
  };
}

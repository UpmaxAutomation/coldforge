// Sub-Account Management
import { createClient } from '@/lib/supabase/server';
import {
  SubAccount,
  SubAccountStatus,
  SubAccountSettings,
  SubAccountLimits,
  SubAccountUsage,
  SubAccountBilling,
  SubAccountInvitation,
  Agency,
  AgencyBranding,
  DEFAULT_AGENCY_SETTINGS,
} from './types';

// Create a new sub-account
export async function createSubAccount(
  agencyId: string,
  options: {
    name: string;
    slug?: string;
    ownerId?: string;
    settings?: Partial<SubAccountSettings>;
    limits?: Partial<SubAccountLimits>;
    billingOverride?: SubAccountBilling;
  }
): Promise<SubAccount> {
  const supabase = await createClient();

  // Get agency to check limits and get defaults
  const { data: agency, error: agencyError } = await supabase
    .from('agencies')
    .select('*')
    .eq('id', agencyId)
    .single();

  if (agencyError || !agency) {
    throw new Error('Agency not found');
  }

  // Check sub-account limit
  const { count } = await supabase
    .from('sub_accounts')
    .select('*', { count: 'exact', head: true })
    .eq('agency_id', agencyId)
    .neq('status', 'canceled');

  if (agency.limits.maxSubAccounts !== -1 && (count || 0) >= agency.limits.maxSubAccounts) {
    throw new Error('Sub-account limit reached');
  }

  // Generate slug if not provided
  const slug = options.slug || generateSlug(options.name);

  // Check slug uniqueness within agency
  const { data: existingSlug } = await supabase
    .from('sub_accounts')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('slug', slug)
    .single();

  if (existingSlug) {
    throw new Error('Sub-account slug already exists');
  }

  // Default settings
  const defaultSettings: SubAccountSettings = {
    allowExternalUsers: false,
    requireApproval: true,
    showAgencyBranding: true,
    notificationEmails: [],
    timezone: 'UTC',
    language: 'en',
  };

  // Default limits based on agency settings
  const defaultLimits: SubAccountLimits = {
    maxUsers: agency.settings.maxSubAccounts > 0 ? 5 : 10,
    maxMailboxes: agency.settings.defaultMailboxQuota,
    maxLeads: agency.settings.defaultLeadQuota,
    maxCampaigns: agency.settings.defaultCampaignQuota,
    maxEmailsPerMonth: 10000,
    maxTemplates: 50,
    maxSequences: 20,
  };

  // Initial usage
  const initialUsage: SubAccountUsage = {
    users: 0,
    mailboxes: 0,
    leads: 0,
    campaigns: 0,
    emailsSentThisMonth: 0,
    templates: 0,
    sequences: 0,
    storageUsedMb: 0,
  };

  const subAccountData = {
    agency_id: agencyId,
    name: options.name,
    slug,
    owner_id: options.ownerId || null,
    status: 'active' as SubAccountStatus,
    settings: { ...defaultSettings, ...options.settings },
    limits: { ...defaultLimits, ...options.limits },
    usage: initialUsage,
    billing_override: options.billingOverride || null,
  };

  const { data: subAccount, error } = await supabase
    .from('sub_accounts')
    .insert(subAccountData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create sub-account: ${error.message}`);
  }

  // Create workspace for the sub-account
  const { error: workspaceError } = await supabase
    .from('workspaces')
    .insert({
      id: subAccount.id, // Use same ID for simplicity
      name: options.name,
      slug,
      owner_id: options.ownerId,
      settings: {
        sub_account_id: subAccount.id,
        agency_id: agencyId,
      },
    });

  if (workspaceError) {
    // Rollback sub-account creation
    await supabase.from('sub_accounts').delete().eq('id', subAccount.id);
    throw new Error(`Failed to create workspace: ${workspaceError.message}`);
  }

  return mapSubAccount(subAccount);
}

// Get sub-account by ID
export async function getSubAccount(subAccountId: string): Promise<SubAccount | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sub_accounts')
    .select('*')
    .eq('id', subAccountId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapSubAccount(data);
}

// Get sub-account by slug within agency
export async function getSubAccountBySlug(
  agencyId: string,
  slug: string
): Promise<SubAccount | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sub_accounts')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('slug', slug)
    .single();

  if (error || !data) {
    return null;
  }

  return mapSubAccount(data);
}

// Get all sub-accounts for an agency
export async function getAgencySubAccounts(
  agencyId: string,
  options: {
    status?: SubAccountStatus;
    page?: number;
    limit?: number;
    search?: string;
  } = {}
): Promise<{ subAccounts: SubAccount[]; total: number }> {
  const supabase = await createClient();
  const { status, page = 1, limit = 20, search } = options;

  let query = supabase
    .from('sub_accounts')
    .select('*', { count: 'exact' })
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
  }

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to get sub-accounts: ${error.message}`);
  }

  return {
    subAccounts: (data || []).map(mapSubAccount),
    total: count || 0,
  };
}

// Update sub-account
export async function updateSubAccount(
  subAccountId: string,
  updates: {
    name?: string;
    settings?: Partial<SubAccountSettings>;
    limits?: Partial<SubAccountLimits>;
    billingOverride?: SubAccountBilling | null;
  }
): Promise<SubAccount> {
  const supabase = await createClient();

  // Get current sub-account
  const { data: current, error: getError } = await supabase
    .from('sub_accounts')
    .select('*')
    .eq('id', subAccountId)
    .single();

  if (getError || !current) {
    throw new Error('Sub-account not found');
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name) {
    updateData.name = updates.name;
  }

  if (updates.settings) {
    updateData.settings = { ...current.settings, ...updates.settings };
  }

  if (updates.limits) {
    updateData.limits = { ...current.limits, ...updates.limits };
  }

  if (updates.billingOverride !== undefined) {
    updateData.billing_override = updates.billingOverride;
  }

  const { data, error } = await supabase
    .from('sub_accounts')
    .update(updateData)
    .eq('id', subAccountId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update sub-account: ${error.message}`);
  }

  return mapSubAccount(data);
}

// Update sub-account usage
export async function updateSubAccountUsage(
  subAccountId: string,
  usageUpdates: Partial<SubAccountUsage>
): Promise<SubAccountUsage> {
  const supabase = await createClient();

  const { data: current, error: getError } = await supabase
    .from('sub_accounts')
    .select('usage')
    .eq('id', subAccountId)
    .single();

  if (getError || !current) {
    throw new Error('Sub-account not found');
  }

  const newUsage = { ...current.usage, ...usageUpdates };

  const { data, error } = await supabase
    .from('sub_accounts')
    .update({
      usage: newUsage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subAccountId)
    .select('usage')
    .single();

  if (error) {
    throw new Error(`Failed to update usage: ${error.message}`);
  }

  return data.usage;
}

// Suspend sub-account
export async function suspendSubAccount(
  subAccountId: string,
  reason?: string
): Promise<SubAccount> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sub_accounts')
    .update({
      status: 'suspended',
      settings: supabase.rpc('jsonb_set', {
        target: 'settings',
        path: '{suspensionReason}',
        value: JSON.stringify(reason || 'Suspended by agency'),
      }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', subAccountId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to suspend sub-account: ${error.message}`);
  }

  // Pause all active campaigns
  await supabase
    .from('campaigns')
    .update({ status: 'paused' })
    .eq('workspace_id', subAccountId)
    .eq('status', 'active');

  return mapSubAccount(data);
}

// Reactivate sub-account
export async function reactivateSubAccount(subAccountId: string): Promise<SubAccount> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sub_accounts')
    .update({
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', subAccountId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to reactivate sub-account: ${error.message}`);
  }

  return mapSubAccount(data);
}

// Cancel sub-account
export async function cancelSubAccount(subAccountId: string): Promise<SubAccount> {
  const supabase = await createClient();

  // Stop all campaigns
  await supabase
    .from('campaigns')
    .update({ status: 'stopped' })
    .eq('workspace_id', subAccountId)
    .in('status', ['active', 'paused']);

  const { data, error } = await supabase
    .from('sub_accounts')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', subAccountId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to cancel sub-account: ${error.message}`);
  }

  return mapSubAccount(data);
}

// Transfer sub-account to new owner
export async function transferSubAccount(
  subAccountId: string,
  newOwnerId: string
): Promise<SubAccount> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sub_accounts')
    .update({
      owner_id: newOwnerId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subAccountId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to transfer sub-account: ${error.message}`);
  }

  // Update workspace owner
  await supabase
    .from('workspaces')
    .update({ owner_id: newOwnerId })
    .eq('id', subAccountId);

  return mapSubAccount(data);
}

// Check if sub-account is within limits
export async function checkSubAccountLimits(
  subAccountId: string,
  resource: keyof SubAccountLimits,
  requestedAmount: number = 1
): Promise<{ allowed: boolean; current: number; limit: number; remaining: number }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sub_accounts')
    .select('limits, usage')
    .eq('id', subAccountId)
    .single();

  if (error || !data) {
    throw new Error('Sub-account not found');
  }

  const usageKey = resource.replace('max', '').charAt(0).toLowerCase() +
    resource.replace('max', '').slice(1);

  const limit = data.limits[resource] as number;
  const current = (data.usage[usageKey as keyof SubAccountUsage] as number) || 0;

  // -1 means unlimited
  if (limit === -1) {
    return { allowed: true, current, limit: -1, remaining: -1 };
  }

  const remaining = limit - current;
  const allowed = current + requestedAmount <= limit;

  return { allowed, current, limit, remaining };
}

// Get effective branding for sub-account
export async function getSubAccountBranding(subAccountId: string): Promise<AgencyBranding> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sub_accounts')
    .select(`
      settings,
      agencies:agency_id (
        branding
      )
    `)
    .eq('id', subAccountId)
    .single();

  if (error || !data) {
    throw new Error('Sub-account not found');
  }

  const agencyBranding = (data.agencies as unknown as Agency)?.branding;
  const customBranding = data.settings?.customBranding;
  const showAgencyBranding = data.settings?.showAgencyBranding ?? true;

  if (!showAgencyBranding && customBranding) {
    return { ...agencyBranding, ...customBranding } as AgencyBranding;
  }

  return agencyBranding;
}

// Sub-Account Invitations

// Create invitation for sub-account
export async function createSubAccountInvitation(
  subAccountId: string,
  invitedBy: string,
  options: {
    email: string;
    role: 'admin' | 'member' | 'viewer';
    expiresInDays?: number;
  }
): Promise<SubAccountInvitation> {
  const supabase = await createClient();

  // Check if user already exists in sub-account
  const { data: existingMember } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', subAccountId)
    .eq('user_id', (
      await supabase
        .from('users')
        .select('id')
        .eq('email', options.email)
        .single()
    ).data?.id)
    .single();

  if (existingMember) {
    throw new Error('User is already a member of this sub-account');
  }

  // Check for pending invitation
  const { data: existingInvite } = await supabase
    .from('sub_account_invitations')
    .select('id')
    .eq('sub_account_id', subAccountId)
    .eq('email', options.email)
    .eq('status', 'pending')
    .single();

  if (existingInvite) {
    throw new Error('Pending invitation already exists for this email');
  }

  const token = generateSecureToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (options.expiresInDays || 7));

  const { data, error } = await supabase
    .from('sub_account_invitations')
    .insert({
      sub_account_id: subAccountId,
      email: options.email,
      role: options.role,
      token,
      expires_at: expiresAt.toISOString(),
      invited_by: invitedBy,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create invitation: ${error.message}`);
  }

  return mapSubAccountInvitation(data);
}

// Accept sub-account invitation
export async function acceptSubAccountInvitation(
  token: string,
  userId: string
): Promise<SubAccount> {
  const supabase = await createClient();

  // Find invitation
  const { data: invitation, error: inviteError } = await supabase
    .from('sub_account_invitations')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .single();

  if (inviteError || !invitation) {
    throw new Error('Invalid or expired invitation');
  }

  if (new Date(invitation.expires_at) < new Date()) {
    await supabase
      .from('sub_account_invitations')
      .update({ status: 'expired' })
      .eq('id', invitation.id);
    throw new Error('Invitation has expired');
  }

  // Verify user email matches invitation
  const { data: user } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .single();

  if (user?.email !== invitation.email) {
    throw new Error('Invitation is for a different email address');
  }

  // Add user to workspace
  const { error: memberError } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: invitation.sub_account_id,
      user_id: userId,
      role: invitation.role,
      invited_by: invitation.invited_by,
    });

  if (memberError) {
    throw new Error(`Failed to add member: ${memberError.message}`);
  }

  // Update invitation status
  await supabase
    .from('sub_account_invitations')
    .update({ status: 'accepted' })
    .eq('id', invitation.id);

  // Update usage
  const { data: subAccount } = await supabase
    .from('sub_accounts')
    .select('usage')
    .eq('id', invitation.sub_account_id)
    .single();

  if (subAccount) {
    await supabase
      .from('sub_accounts')
      .update({
        usage: {
          ...subAccount.usage,
          users: (subAccount.usage.users || 0) + 1,
        },
      })
      .eq('id', invitation.sub_account_id);
  }

  const result = await getSubAccount(invitation.sub_account_id);
  if (!result) {
    throw new Error('Sub-account not found');
  }

  return result;
}

// Revoke sub-account invitation
export async function revokeSubAccountInvitation(invitationId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('sub_account_invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId);

  if (error) {
    throw new Error(`Failed to revoke invitation: ${error.message}`);
  }
}

// Get pending invitations for sub-account
export async function getSubAccountPendingInvitations(
  subAccountId: string
): Promise<SubAccountInvitation[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sub_account_invitations')
    .select('*')
    .eq('sub_account_id', subAccountId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get invitations: ${error.message}`);
  }

  return (data || []).map(mapSubAccountInvitation);
}

// Get sub-account members
export async function getSubAccountMembers(
  subAccountId: string
): Promise<Array<{
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  joinedAt: Date;
}>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      id,
      user_id,
      role,
      created_at,
      users:user_id (
        email,
        name
      )
    `)
    .eq('workspace_id', subAccountId);

  if (error) {
    throw new Error(`Failed to get members: ${error.message}`);
  }

  return (data || []).map(member => ({
    id: member.id,
    userId: member.user_id,
    email: (member.users as unknown as { email: string })?.email || '',
    name: (member.users as unknown as { name: string })?.name || '',
    role: member.role,
    joinedAt: new Date(member.created_at),
  }));
}

// Remove member from sub-account
export async function removeSubAccountMember(
  subAccountId: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', subAccountId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to remove member: ${error.message}`);
  }

  // Update usage
  const { data: subAccount } = await supabase
    .from('sub_accounts')
    .select('usage')
    .eq('id', subAccountId)
    .single();

  if (subAccount) {
    await supabase
      .from('sub_accounts')
      .update({
        usage: {
          ...subAccount.usage,
          users: Math.max(0, (subAccount.usage.users || 0) - 1),
        },
      })
      .eq('id', subAccountId);
  }
}

// Helper functions

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

function generateSecureToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function mapSubAccount(data: Record<string, unknown>): SubAccount {
  return {
    id: data.id as string,
    agencyId: data.agency_id as string,
    name: data.name as string,
    slug: data.slug as string,
    ownerId: data.owner_id as string | undefined,
    status: data.status as SubAccountStatus,
    settings: data.settings as SubAccountSettings,
    limits: data.limits as SubAccountLimits,
    usage: data.usage as SubAccountUsage,
    billingOverride: data.billing_override as SubAccountBilling | undefined,
    createdAt: new Date(data.created_at as string),
    updatedAt: new Date(data.updated_at as string),
  };
}

function mapSubAccountInvitation(data: Record<string, unknown>): SubAccountInvitation {
  return {
    id: data.id as string,
    subAccountId: data.sub_account_id as string,
    email: data.email as string,
    role: data.role as 'admin' | 'member' | 'viewer',
    token: data.token as string,
    expiresAt: new Date(data.expires_at as string),
    invitedBy: data.invited_by as string,
    status: data.status as 'pending' | 'accepted' | 'expired' | 'revoked',
    createdAt: new Date(data.created_at as string),
  };
}

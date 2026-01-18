// Mailbox Provisioning Orchestrator
// Orchestrates mailbox creation across Google Workspace and Microsoft 365

import { createClient } from '../supabase/server';
import { encrypt } from '../encryption';
import {
  createGoogleMailbox,
  createGoogleAlias,
  setGoogleProfilePhoto,
  getGoogleConfig,
  GoogleWorkspaceConfig,
} from './google-workspace';
import {
  createMicrosoft365Mailbox,
  createMicrosoft365Alias,
  setMicrosoft365ProfilePhoto,
  getMicrosoft365Config,
  Microsoft365Config,
} from './microsoft-365';
import {
  generateIdentity,
  generateIdentities,
  generateUniqueEmail,
  generateAliases,
  generateSecurePassword,
  updateNameUsage,
  GeneratedIdentity,
} from './name-generator';

export type ProviderType = 'google' | 'microsoft';

export interface ProvisioningOptions {
  workspaceId: string;
  providerConfigId: string;
  domain: string;

  // Identity options
  generateName?: boolean;
  firstName?: string;
  lastName?: string;
  emailPrefix?: string;

  // Feature flags
  generateAliases?: boolean;
  aliasCount?: number;
  setProfilePhoto?: boolean;
  setSignature?: boolean;
  signatureTemplateId?: string;
  startWarmup?: boolean;

  // Password options
  generatePassword?: boolean;
  password?: string;

  // Recovery options
  recoveryEmail?: string;
  recoveryPhone?: string;
}

export interface ProvisioningResult {
  success: boolean;
  mailboxId?: string;
  email?: string;
  password?: string;
  aliases?: string[];
  error?: string;
}

export interface BulkProvisioningOptions extends Omit<ProvisioningOptions, 'firstName' | 'lastName' | 'emailPrefix'> {
  count: number;
  nameGender?: 'male' | 'female' | 'neutral';
  nameRegion?: 'us' | 'uk' | 'generic';
}

export interface BulkProvisioningResult {
  success: boolean;
  jobId?: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  mailboxes: ProvisioningResult[];
  errors: Array<{ index: number; error: string }>;
}

// Get provider config
async function getProviderConfig(
  configId: string
): Promise<{ type: ProviderType; config: GoogleWorkspaceConfig | Microsoft365Config } | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('email_provider_configs')
    .select('provider')
    .eq('id', configId)
    .single();

  if (error || !data) return null;

  if (data.provider === 'google') {
    const config = await getGoogleConfig(configId);
    return config ? { type: 'google', config } : null;
  } else if (data.provider === 'microsoft') {
    const config = await getMicrosoft365Config(configId);
    return config ? { type: 'microsoft', config } : null;
  }

  return null;
}

// Get random profile photo
async function getRandomProfilePhoto(
  workspaceId: string,
  gender?: string
): Promise<{ url: string; id: string } | null> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('profile_photos_pool')
      .select('id, photo_url')
      .eq('is_active', true)
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`);

    if (gender && gender !== 'neutral') {
      query = query.or(`gender.eq.${gender},gender.eq.neutral`);
    }

    query = query.order('times_used', { ascending: true }).limit(10);

    const { data, error } = await query;

    if (error || !data || data.length === 0) return null;

    // Pick random from least used photos
    const photo = data[Math.floor(Math.random() * data.length)];

    // Update usage
    await supabase
      .from('profile_photos_pool')
      .update({
        times_used: (photo as { times_used?: number }).times_used || 0 + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', photo.id);

    return { url: photo.photo_url, id: photo.id };
  } catch {
    return null;
  }
}

// Get signature template
async function getSignatureTemplate(
  templateId: string | null,
  workspaceId: string
): Promise<{ html: string; plain: string } | null> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('signature_templates')
      .select('html_template, plain_template')
      .eq('is_active', true);

    if (templateId) {
      query = query.eq('id', templateId);
    } else {
      // Get default template
      query = query
        .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
        .eq('is_default', true);
    }

    const { data, error } = await query.single();

    if (error || !data) return null;

    return {
      html: data.html_template,
      plain: data.plain_template,
    };
  } catch {
    return null;
  }
}

// Render signature with variables
function renderSignature(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;

  // Replace simple variables {{var}}
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  }

  // Handle conditionals {{#if var}}...{{/if}}
  const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(conditionalRegex, (_, varName, content) => {
    return variables[varName] ? content : '';
  });

  return result;
}

// Provision a single mailbox
export async function provisionMailbox(
  options: ProvisioningOptions
): Promise<ProvisioningResult> {
  try {
    const supabase = await createClient();

    // Get provider configuration
    const providerInfo = await getProviderConfig(options.providerConfigId);
    if (!providerInfo) {
      return { success: false, error: 'Provider configuration not found' };
    }

    // Generate or use provided identity
    let identity: GeneratedIdentity;
    if (options.generateName) {
      identity = await generateIdentity({ workspaceId: options.workspaceId });
    } else {
      identity = {
        firstName: options.firstName || 'User',
        lastName: options.lastName || 'Account',
        displayName: `${options.firstName || 'User'} ${options.lastName || 'Account'}`,
        emailPrefix: options.emailPrefix || `${(options.firstName || 'user').toLowerCase()}.${(options.lastName || 'account').toLowerCase()}`,
        emailVariants: [options.emailPrefix || `${(options.firstName || 'user').toLowerCase()}.${(options.lastName || 'account').toLowerCase()}`],
      };
    }

    // Generate unique email
    const email = await generateUniqueEmail(identity, options.domain);

    // Generate or use provided password
    const password = options.generatePassword
      ? generateSecurePassword()
      : options.password || generateSecurePassword();

    // Create queue entry
    const { data: queueEntry, error: queueError } = await supabase
      .from('mailbox_provisioning_queue')
      .insert({
        workspace_id: options.workspaceId,
        provider_config_id: options.providerConfigId,
        email_address: email,
        display_name: identity.displayName,
        first_name: identity.firstName,
        last_name: identity.lastName,
        password,
        generate_aliases: options.generateAliases ?? true,
        alias_count: options.aliasCount ?? 2,
        set_profile_photo: options.setProfilePhoto ?? true,
        set_signature: options.setSignature ?? true,
        start_warmup: options.startWarmup ?? true,
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (queueError) {
      return { success: false, error: 'Failed to create queue entry' };
    }

    // Create mailbox with provider
    let providerResult: { success: boolean; userId?: string; email?: string; error?: string };

    if (providerInfo.type === 'google') {
      providerResult = await createGoogleMailbox(
        providerInfo.config as GoogleWorkspaceConfig,
        {
          email,
          firstName: identity.firstName,
          lastName: identity.lastName,
          password,
          recoveryEmail: options.recoveryEmail,
          recoveryPhone: options.recoveryPhone,
        }
      );
    } else {
      providerResult = await createMicrosoft365Mailbox(
        providerInfo.config as Microsoft365Config,
        {
          email,
          displayName: identity.displayName,
          firstName: identity.firstName,
          lastName: identity.lastName,
          password,
        }
      );
    }

    if (!providerResult.success) {
      // Update queue with error
      await supabase
        .from('mailbox_provisioning_queue')
        .update({
          status: 'failed',
          error_message: providerResult.error,
          attempts: 1,
        })
        .eq('id', queueEntry.id);

      return { success: false, error: providerResult.error };
    }

    // Create mailbox record
    const { data: mailbox, error: mailboxError } = await supabase
      .from('provisioned_mailboxes')
      .insert({
        workspace_id: options.workspaceId,
        provider_config_id: options.providerConfigId,
        email_address: email,
        display_name: identity.displayName,
        first_name: identity.firstName,
        last_name: identity.lastName,
        provider_user_id: providerResult.userId,
        password_encrypted: encrypt(password),
        recovery_email: options.recoveryEmail,
        recovery_phone: options.recoveryPhone,
        status: 'active',
        provisioned_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (mailboxError) {
      return { success: false, error: 'Failed to create mailbox record' };
    }

    // Generate and create aliases
    let aliases: string[] = [];
    if (options.generateAliases !== false) {
      const count = options.aliasCount ?? 2;
      aliases = await generateAliases(identity, options.domain, count, options.workspaceId);

      for (const alias of aliases) {
        if (providerInfo.type === 'google') {
          await createGoogleAlias(providerInfo.config as GoogleWorkspaceConfig, email, alias);
        } else {
          await createMicrosoft365Alias(providerInfo.config as Microsoft365Config, email, alias);
        }
      }

      // Update mailbox with aliases
      await supabase
        .from('provisioned_mailboxes')
        .update({ aliases })
        .eq('id', mailbox.id);
    }

    // Set profile photo
    if (options.setProfilePhoto !== false) {
      const photo = await getRandomProfilePhoto(options.workspaceId);
      if (photo) {
        try {
          // Fetch photo data
          const response = await fetch(photo.url);
          const buffer = Buffer.from(await response.arrayBuffer());
          const base64 = buffer.toString('base64');

          if (providerInfo.type === 'google') {
            await setGoogleProfilePhoto(providerInfo.config as GoogleWorkspaceConfig, email, base64);
          } else {
            await setMicrosoft365ProfilePhoto(providerInfo.config as Microsoft365Config, email, buffer);
          }

          await supabase
            .from('provisioned_mailboxes')
            .update({ profile_photo_url: photo.url })
            .eq('id', mailbox.id);
        } catch {
          // Photo setting is non-critical, continue
        }
      }
    }

    // Set signature
    if (options.setSignature !== false) {
      const template = await getSignatureTemplate(options.signatureTemplateId ?? null, options.workspaceId);
      if (template) {
        const signatureVars: Record<string, string> = {
          firstName: identity.firstName,
          lastName: identity.lastName,
          email,
          title: '',
          company: '',
          phone: options.recoveryPhone || '',
          website: '',
        };

        const signatureHtml = renderSignature(template.html, signatureVars);
        const signaturePlain = renderSignature(template.plain, signatureVars);

        await supabase
          .from('provisioned_mailboxes')
          .update({
            signature_html: signatureHtml,
            signature_plain: signaturePlain,
          })
          .eq('id', mailbox.id);

        // Note: Setting signature in Gmail/Outlook requires additional API calls
        // and user-level OAuth tokens, which is typically done via the web app
      }
    }

    // Start warmup if requested
    if (options.startWarmup !== false) {
      await supabase
        .from('provisioned_mailboxes')
        .update({
          warmup_status: 'in_progress',
          warmup_started_at: new Date().toISOString(),
        })
        .eq('id', mailbox.id);
    }

    // Update queue entry
    await supabase
      .from('mailbox_provisioning_queue')
      .update({
        status: 'completed',
        provisioned_mailbox_id: mailbox.id,
        completed_at: new Date().toISOString(),
      })
      .eq('id', queueEntry.id);

    // Update name usage stats
    await updateNameUsage(identity.firstName, identity.lastName);

    // Update provider config count
    await supabase
      .from('email_provider_configs')
      .update({
        mailboxes_created: supabase.rpc('increment', { x: 1 }),
      })
      .eq('id', options.providerConfigId);

    return {
      success: true,
      mailboxId: mailbox.id,
      email,
      password,
      aliases,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during provisioning',
    };
  }
}

// Provision multiple mailboxes
export async function bulkProvisionMailboxes(
  options: BulkProvisioningOptions
): Promise<BulkProvisioningResult> {
  const supabase = await createClient();

  // Create bulk job entry
  const { data: job, error: jobError } = await supabase
    .from('bulk_provisioning_jobs')
    .insert({
      workspace_id: options.workspaceId,
      provider_config_id: options.providerConfigId,
      name: `Bulk provision ${options.count} mailboxes`,
      mailbox_count: options.count,
      total_count: options.count,
      settings: {
        generateAliases: options.generateAliases ?? true,
        aliasCount: options.aliasCount ?? 2,
        setProfilePhotos: options.setProfilePhoto ?? true,
        setSignatures: options.setSignature ?? true,
        signatureTemplateId: options.signatureTemplateId,
        startWarmup: options.startWarmup ?? true,
        nameGender: options.nameGender,
        nameRegion: options.nameRegion,
      },
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (jobError) {
    return {
      success: false,
      totalCount: options.count,
      completedCount: 0,
      failedCount: options.count,
      mailboxes: [],
      errors: [{ index: -1, error: 'Failed to create bulk job' }],
    };
  }

  // Generate identities upfront
  const identities = await generateIdentities(options.count, {
    workspaceId: options.workspaceId,
    gender: options.nameGender,
    region: options.nameRegion,
  });

  const results: ProvisioningResult[] = [];
  const errors: Array<{ index: number; error: string }> = [];
  const createdMailboxIds: string[] = [];

  // Process each mailbox
  for (let i = 0; i < options.count; i++) {
    const identity = identities[i];

    const result = await provisionMailbox({
      workspaceId: options.workspaceId,
      providerConfigId: options.providerConfigId,
      domain: options.domain,
      generateName: false,
      firstName: identity.firstName,
      lastName: identity.lastName,
      emailPrefix: identity.emailPrefix,
      generateAliases: options.generateAliases,
      aliasCount: options.aliasCount,
      setProfilePhoto: options.setProfilePhoto,
      setSignature: options.setSignature,
      signatureTemplateId: options.signatureTemplateId,
      startWarmup: options.startWarmup,
      generatePassword: true,
    });

    results.push(result);

    if (result.success && result.mailboxId) {
      createdMailboxIds.push(result.mailboxId);
    } else {
      errors.push({ index: i, error: result.error || 'Unknown error' });
    }

    // Update job progress
    await supabase
      .from('bulk_provisioning_jobs')
      .update({
        completed_count: results.filter(r => r.success).length,
        failed_count: errors.length,
        created_mailbox_ids: createdMailboxIds,
        errors: errors,
      })
      .eq('id', job.id);
  }

  // Finalize job
  const completedCount = results.filter(r => r.success).length;
  const failedCount = errors.length;

  await supabase
    .from('bulk_provisioning_jobs')
    .update({
      status: failedCount === options.count ? 'failed' : 'completed',
      completed_count: completedCount,
      failed_count: failedCount,
      completed_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  return {
    success: completedCount > 0,
    jobId: job.id,
    totalCount: options.count,
    completedCount,
    failedCount,
    mailboxes: results,
    errors,
  };
}

// Get mailbox status
export async function getMailboxStatus(
  mailboxId: string
): Promise<{
  status: string;
  email: string;
  warmupStatus: string;
  emailsSentToday: number;
  emailsSentTotal: number;
} | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('provisioned_mailboxes')
    .select('status, email_address, warmup_status, emails_sent_today, emails_sent_total')
    .eq('id', mailboxId)
    .single();

  if (error || !data) return null;

  return {
    status: data.status,
    email: data.email_address,
    warmupStatus: data.warmup_status,
    emailsSentToday: data.emails_sent_today,
    emailsSentTotal: data.emails_sent_total,
  };
}

// Get bulk job status
export async function getBulkJobStatus(
  jobId: string
): Promise<{
  status: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  estimatedCompletion?: Date;
} | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('bulk_provisioning_jobs')
    .select('status, total_count, completed_count, failed_count, estimated_completion')
    .eq('id', jobId)
    .single();

  if (error || !data) return null;

  return {
    status: data.status,
    totalCount: data.total_count,
    completedCount: data.completed_count,
    failedCount: data.failed_count,
    estimatedCompletion: data.estimated_completion ? new Date(data.estimated_completion) : undefined,
  };
}

// List workspace mailboxes
export async function listWorkspaceMailboxes(
  workspaceId: string,
  options: {
    status?: string;
    warmupStatus?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{
  mailboxes: Array<{
    id: string;
    email: string;
    displayName: string;
    status: string;
    warmupStatus: string;
    createdAt: string;
  }>;
  total: number;
}> {
  const supabase = await createClient();

  let query = supabase
    .from('provisioned_mailboxes')
    .select('id, email_address, display_name, status, warmup_status, created_at', { count: 'exact' })
    .eq('workspace_id', workspaceId);

  if (options.status) {
    query = query.eq('status', options.status);
  }

  if (options.warmupStatus) {
    query = query.eq('warmup_status', options.warmupStatus);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(options.offset || 0, (options.offset || 0) + (options.limit || 50) - 1);

  const { data, error, count } = await query;

  if (error) {
    return { mailboxes: [], total: 0 };
  }

  return {
    mailboxes: (data || []).map(m => ({
      id: m.id,
      email: m.email_address,
      displayName: m.display_name,
      status: m.status,
      warmupStatus: m.warmup_status,
      createdAt: m.created_at,
    })),
    total: count || 0,
  };
}

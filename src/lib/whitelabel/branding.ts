// White-Label Branding System
import { createClient } from '@/lib/supabase/server';
import {
  AgencyBranding,
  WhiteLabelEmailConfig,
  DEFAULT_BRANDING,
} from './types';

// Update agency branding
export async function updateAgencyBranding(
  agencyId: string,
  branding: Partial<AgencyBranding>
): Promise<AgencyBranding> {
  const supabase = await createClient();

  const { data: current, error: getError } = await supabase
    .from('agencies')
    .select('branding')
    .eq('id', agencyId)
    .single();

  if (getError || !current) {
    throw new Error('Agency not found');
  }

  const updatedBranding = { ...current.branding, ...branding };

  const { data, error } = await supabase
    .from('agencies')
    .update({
      branding: updatedBranding,
      updated_at: new Date().toISOString(),
    })
    .eq('id', agencyId)
    .select('branding')
    .single();

  if (error) {
    throw new Error(`Failed to update branding: ${error.message}`);
  }

  return data.branding;
}

// Get branding for a context (agency or workspace)
export async function getBranding(options: {
  agencyId?: string;
  workspaceId?: string;
  domain?: string;
}): Promise<AgencyBranding> {
  const supabase = await createClient();

  // If domain provided, look up the associated agency/workspace
  if (options.domain) {
    const { data: customDomain } = await supabase
      .from('custom_domains')
      .select('agency_id, workspace_id')
      .eq('domain', options.domain)
      .eq('status', 'verified')
      .single();

    if (customDomain) {
      options.agencyId = customDomain.agency_id || undefined;
      options.workspaceId = customDomain.workspace_id || undefined;
    }
  }

  // If workspace provided, get agency branding with possible overrides
  if (options.workspaceId) {
    const { data: subAccount } = await supabase
      .from('sub_accounts')
      .select(`
        settings,
        agencies:agency_id (
          branding
        )
      `)
      .eq('id', options.workspaceId)
      .single();

    if (subAccount) {
      const agencyBranding = (subAccount.agencies as unknown as { branding: AgencyBranding })?.branding || DEFAULT_BRANDING;
      const customBranding = subAccount.settings?.customBranding;
      const showAgencyBranding = subAccount.settings?.showAgencyBranding ?? true;

      if (!showAgencyBranding && customBranding) {
        return { ...agencyBranding, ...customBranding };
      }

      return agencyBranding;
    }
  }

  // Get agency branding directly
  if (options.agencyId) {
    const { data: agency } = await supabase
      .from('agencies')
      .select('branding')
      .eq('id', options.agencyId)
      .single();

    if (agency) {
      return agency.branding;
    }
  }

  // Return default branding
  return DEFAULT_BRANDING;
}

// Upload logo and get URL
export async function uploadLogo(
  agencyId: string,
  file: File,
  type: 'logo' | 'logoLight' | 'favicon'
): Promise<string> {
  const supabase = await createClient();

  // Validate file type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type. Allowed: PNG, JPEG, SVG, ICO, WebP');
  }

  // Validate file size (max 2MB)
  const maxSize = 2 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error('File too large. Maximum size is 2MB');
  }

  // Generate unique filename
  const ext = file.name.split('.').pop();
  const filename = `${agencyId}/${type}-${Date.now()}.${ext}`;

  // Upload to storage
  const { data, error } = await supabase.storage
    .from('branding')
    .upload(filename, file, {
      cacheControl: '31536000', // 1 year
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload logo: ${error.message}`);
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('branding')
    .getPublicUrl(data.path);

  return publicUrl;
}

// Delete logo
export async function deleteLogo(
  agencyId: string,
  type: 'logo' | 'logoLight' | 'favicon'
): Promise<void> {
  const supabase = await createClient();

  // Get current branding to find the file
  const { data: agency } = await supabase
    .from('agencies')
    .select('branding')
    .eq('id', agencyId)
    .single();

  if (!agency) {
    throw new Error('Agency not found');
  }

  const urlKey = type === 'logoLight' ? 'logoLightUrl' : `${type}Url`;
  const currentUrl = agency.branding[urlKey];

  if (currentUrl) {
    // Extract path from URL
    const path = currentUrl.split('/branding/')[1];
    if (path) {
      await supabase.storage.from('branding').remove([path]);
    }
  }

  // Update branding to remove URL
  const updatedBranding = { ...agency.branding };
  delete updatedBranding[urlKey];

  await supabase
    .from('agencies')
    .update({
      branding: updatedBranding,
      updated_at: new Date().toISOString(),
    })
    .eq('id', agencyId);
}

// Validate color format
export function validateColor(color: string): boolean {
  // Hex color
  if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
    return true;
  }

  // RGB/RGBA
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(,\s*[\d.]+)?\s*\)$/.test(color)) {
    return true;
  }

  // HSL/HSLA
  if (/^hsla?\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?(,\s*[\d.]+)?\s*\)$/.test(color)) {
    return true;
  }

  return false;
}

// Generate CSS variables from branding
export function generateCssVariables(branding: AgencyBranding): string {
  const vars: string[] = [];

  if (branding.primaryColor) {
    vars.push(`--primary-color: ${branding.primaryColor};`);
    vars.push(`--primary-color-rgb: ${hexToRgb(branding.primaryColor)};`);
  }

  if (branding.secondaryColor) {
    vars.push(`--secondary-color: ${branding.secondaryColor};`);
  }

  if (branding.accentColor) {
    vars.push(`--accent-color: ${branding.accentColor};`);
  }

  return `:root {\n  ${vars.join('\n  ')}\n}`;
}

// Convert hex to RGB
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0, 0, 0';

  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

// White-Label Email Configuration

// Get email configuration
export async function getEmailConfig(agencyId: string): Promise<WhiteLabelEmailConfig | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('whitelabel_email_configs')
    .select('*')
    .eq('agency_id', agencyId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapEmailConfig(data);
}

// Create or update email configuration
export async function upsertEmailConfig(
  agencyId: string,
  config: Partial<WhiteLabelEmailConfig>
): Promise<WhiteLabelEmailConfig> {
  const supabase = await createClient();

  // Check if exists
  const { data: existing } = await supabase
    .from('whitelabel_email_configs')
    .select('id')
    .eq('agency_id', agencyId)
    .single();

  if (existing) {
    // Update
    const { data, error } = await supabase
      .from('whitelabel_email_configs')
      .update({
        ...config,
        updated_at: new Date().toISOString(),
      })
      .eq('agency_id', agencyId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update email config: ${error.message}`);
    }

    return mapEmailConfig(data);
  } else {
    // Insert
    const { data, error } = await supabase
      .from('whitelabel_email_configs')
      .insert({
        agency_id: agencyId,
        from_name: config.fromName || 'ColdForge',
        from_email: config.fromEmail || 'noreply@coldforge.io',
        ...config,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create email config: ${error.message}`);
    }

    return mapEmailConfig(data);
  }
}

// Generate email template with branding
export async function renderBrandedEmail(
  agencyId: string,
  templateType: keyof WhiteLabelEmailConfig['templates'],
  variables: Record<string, string>
): Promise<string> {
  const [branding, emailConfig] = await Promise.all([
    getBranding({ agencyId }),
    getEmailConfig(agencyId),
  ]);

  // Get template
  const template = emailConfig?.templates?.[templateType] || getDefaultTemplate(templateType);

  // Replace variables
  let html = template;

  // Add branding variables
  const allVariables = {
    ...variables,
    companyName: branding.companyName,
    logoUrl: branding.logoUrl || '',
    primaryColor: branding.primaryColor,
    supportEmail: branding.supportEmail || '',
    supportUrl: branding.supportUrl || '',
    termsUrl: branding.termsUrl || '',
    privacyUrl: branding.privacyUrl || '',
    footer: emailConfig?.footer || branding.emailFooter || '',
  };

  for (const [key, value] of Object.entries(allVariables)) {
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  }

  // Add custom CSS if provided
  if (branding.customCss) {
    html = html.replace('</head>', `<style>${branding.customCss}</style></head>`);
  }

  return html;
}

// Get default email template
function getDefaultTemplate(type: string): string {
  const baseTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; }
    .logo { max-height: 50px; }
    .content { padding: 20px 0; }
    .button { display: inline-block; padding: 12px 24px; background: {{primaryColor}}; color: white; text-decoration: none; border-radius: 6px; }
    .footer { text-align: center; color: #666; font-size: 12px; padding: 20px 0; border-top: 1px solid #eee; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      {{#if logoUrl}}<img src="{{logoUrl}}" alt="{{companyName}}" class="logo">{{/if}}
    </div>
    <div class="content">
      {{content}}
    </div>
    <div class="footer">
      {{footer}}
      <p>&copy; {{companyName}}</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const templates: Record<string, string> = {
    welcome: baseTemplate.replace('{{content}}', `
      <h1>Welcome to {{companyName}}!</h1>
      <p>Hello {{userName}},</p>
      <p>Your account has been created. Click the button below to get started.</p>
      <p style="text-align: center;">
        <a href="{{loginUrl}}" class="button">Get Started</a>
      </p>
    `),
    passwordReset: baseTemplate.replace('{{content}}', `
      <h1>Reset Your Password</h1>
      <p>Hello {{userName}},</p>
      <p>We received a request to reset your password. Click the button below to create a new password.</p>
      <p style="text-align: center;">
        <a href="{{resetUrl}}" class="button">Reset Password</a>
      </p>
      <p style="font-size: 12px; color: #666;">If you didn't request this, you can safely ignore this email.</p>
    `),
    invitation: baseTemplate.replace('{{content}}', `
      <h1>You've Been Invited!</h1>
      <p>Hello,</p>
      <p>{{inviterName}} has invited you to join {{workspaceName}} on {{companyName}}.</p>
      <p style="text-align: center;">
        <a href="{{inviteUrl}}" class="button">Accept Invitation</a>
      </p>
    `),
    notification: baseTemplate.replace('{{content}}', `
      <h1>{{notificationTitle}}</h1>
      <p>{{notificationBody}}</p>
      {{#if actionUrl}}
      <p style="text-align: center;">
        <a href="{{actionUrl}}" class="button">{{actionText}}</a>
      </p>
      {{/if}}
    `),
  };

  return templates[type] || templates.notification;
}

// Preview branding
export async function previewBranding(
  branding: Partial<AgencyBranding>
): Promise<{
  cssVariables: string;
  preview: {
    header: string;
    button: string;
    link: string;
  };
}> {
  const merged = { ...DEFAULT_BRANDING, ...branding };

  const cssVariables = generateCssVariables(merged);

  const preview = {
    header: `<div style="background: ${merged.primaryColor}; color: white; padding: 20px; text-align: center;">
      ${merged.logoUrl ? `<img src="${merged.logoUrl}" alt="${merged.companyName}" style="max-height: 40px;">` : merged.companyName}
    </div>`,
    button: `<button style="background: ${merged.primaryColor}; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer;">
      Sample Button
    </button>`,
    link: `<a href="#" style="color: ${merged.accentColor || merged.primaryColor};">Sample Link</a>`,
  };

  return { cssVariables, preview };
}

function mapEmailConfig(data: Record<string, unknown>): WhiteLabelEmailConfig {
  return {
    agencyId: data.agency_id as string,
    fromName: data.from_name as string,
    fromEmail: data.from_email as string,
    replyTo: data.reply_to as string | undefined,
    domain: data.domain as string | undefined,
    dkimSelector: data.dkim_selector as string | undefined,
    dkimPrivateKey: data.dkim_private_key as string | undefined,
    templates: data.templates as WhiteLabelEmailConfig['templates'],
    footer: data.footer as string | undefined,
  };
}

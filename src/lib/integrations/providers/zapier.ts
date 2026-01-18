// Zapier/Make/n8n Integration - Automation Platform Webhooks
import type { IntegrationCredentials } from '../types';
import { getIntegrationCredentials } from '../manager';

interface AutomationPayload {
  event: string;
  timestamp: string;
  workspaceId: string;
  data: Record<string, unknown>;
}

interface TriggerResult {
  success: boolean;
  statusCode?: number;
  response?: unknown;
  error?: string;
}

// Trigger a Zapier webhook
export async function triggerZapierWebhook(
  webhookUrl: string,
  payload: AutomationPayload
): Promise<TriggerResult> {
  return triggerAutomationWebhook(webhookUrl, payload, 'zapier');
}

// Trigger a Make (Integromat) webhook
export async function triggerMakeWebhook(
  webhookUrl: string,
  payload: AutomationPayload
): Promise<TriggerResult> {
  return triggerAutomationWebhook(webhookUrl, payload, 'make');
}

// Trigger an n8n webhook
export async function triggerN8nWebhook(
  webhookUrl: string,
  payload: AutomationPayload,
  credentials?: IntegrationCredentials
): Promise<TriggerResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // n8n can have auth on webhooks
  if (credentials?.apiKey) {
    headers['X-N8N-API-KEY'] = credentials.apiKey;
  }

  return triggerAutomationWebhook(webhookUrl, payload, 'n8n', headers);
}

// Generic automation webhook trigger
async function triggerAutomationWebhook(
  webhookUrl: string,
  payload: AutomationPayload,
  platform: 'zapier' | 'make' | 'n8n',
  additionalHeaders: Record<string, string> = {}
): Promise<TriggerResult> {
  try {
    // Validate URL
    const url = new URL(webhookUrl);

    // Platform-specific URL validation
    const validDomains: Record<string, string[]> = {
      zapier: ['hooks.zapier.com'],
      make: ['hook.integromat.com', 'hook.make.com', 'hook.eu1.make.com', 'hook.us1.make.com'],
      n8n: [], // n8n can be self-hosted
    };

    if (validDomains[platform].length > 0) {
      if (!validDomains[platform].some((domain) => url.hostname.includes(domain))) {
        return {
          success: false,
          error: `Invalid ${platform} webhook URL`,
        };
      }
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ColdForge/1.0',
        ...additionalHeaders,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    let responseData: unknown;
    try {
      responseData = await response.json();
    } catch {
      responseData = await response.text();
    }

    return {
      success: response.ok,
      statusCode: response.status,
      response: responseData,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

// Create event payloads for common events

export function createLeadCreatedPayload(
  workspaceId: string,
  lead: Record<string, unknown>
): AutomationPayload {
  return {
    event: 'lead.created',
    timestamp: new Date().toISOString(),
    workspaceId,
    data: {
      leadId: lead.id,
      email: lead.email,
      firstName: lead.first_name,
      lastName: lead.last_name,
      company: lead.company,
      title: lead.title,
      source: lead.source,
      customFields: lead.custom_fields,
    },
  };
}

export function createEmailSentPayload(
  workspaceId: string,
  emailData: {
    leadId: string;
    leadEmail: string;
    campaignId: string;
    campaignName: string;
    subject: string;
    sequenceStep: number;
    mailboxEmail: string;
  }
): AutomationPayload {
  return {
    event: 'email.sent',
    timestamp: new Date().toISOString(),
    workspaceId,
    data: emailData,
  };
}

export function createEmailRepliedPayload(
  workspaceId: string,
  replyData: {
    leadId: string;
    leadEmail: string;
    campaignId: string;
    campaignName: string;
    subject: string;
    snippet: string;
    sentiment?: string;
    isPositive?: boolean;
  }
): AutomationPayload {
  return {
    event: 'email.replied',
    timestamp: new Date().toISOString(),
    workspaceId,
    data: replyData,
  };
}

export function createEmailBouncedPayload(
  workspaceId: string,
  bounceData: {
    leadId: string;
    leadEmail: string;
    campaignId?: string;
    bounceType: 'hard' | 'soft';
    reason: string;
    mailboxEmail: string;
  }
): AutomationPayload {
  return {
    event: 'email.bounced',
    timestamp: new Date().toISOString(),
    workspaceId,
    data: bounceData,
  };
}

export function createCampaignStartedPayload(
  workspaceId: string,
  campaignData: {
    campaignId: string;
    campaignName: string;
    totalLeads: number;
    startedAt: string;
  }
): AutomationPayload {
  return {
    event: 'campaign.started',
    timestamp: new Date().toISOString(),
    workspaceId,
    data: campaignData,
  };
}

export function createCampaignCompletedPayload(
  workspaceId: string,
  campaignData: {
    campaignId: string;
    campaignName: string;
    totalSent: number;
    totalOpened: number;
    totalReplied: number;
    totalBounced: number;
    completedAt: string;
  }
): AutomationPayload {
  return {
    event: 'campaign.completed',
    timestamp: new Date().toISOString(),
    workspaceId,
    data: campaignData,
  };
}

// Trigger automation for workspace integration
export async function triggerWorkspaceAutomation(
  integrationId: string,
  event: string,
  data: Record<string, unknown>
): Promise<TriggerResult> {
  const { createClient } = await import('@/lib/supabase/server');
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const supabase = await createClient();

  // Get integration details
  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('id', integrationId)
    .eq('status', 'connected')
    .single();

  if (!integration) {
    return { success: false, error: 'Integration not found or not connected' };
  }

  const webhookUrl = integration.config?.webhookUrl as string;
  if (!webhookUrl) {
    return { success: false, error: 'No webhook URL configured' };
  }

  const payload: AutomationPayload = {
    event,
    timestamp: new Date().toISOString(),
    workspaceId: integration.workspace_id,
    data,
  };

  let result: TriggerResult;

  switch (integration.provider) {
    case 'zapier':
      result = await triggerZapierWebhook(webhookUrl, payload);
      break;
    case 'make':
      result = await triggerMakeWebhook(webhookUrl, payload);
      break;
    case 'n8n':
      const credentials = await getIntegrationCredentials(integrationId);
      result = await triggerN8nWebhook(webhookUrl, payload, credentials || undefined);
      break;
    default:
      return { success: false, error: 'Unknown automation provider' };
  }

  // Log the trigger using admin client to bypass RLS
  const adminClient = createAdminClient();
  await adminClient.from('integration_logs').insert({
    integration_id: integrationId,
    action: 'webhook_trigger',
    status: result.success ? 'success' : 'failed',
    message: result.error || `Triggered ${event}`,
    details: {
      event,
      statusCode: result.statusCode,
      response: result.response,
    },
  });

  return result;
}

// Batch trigger for multiple automation integrations
export async function triggerAllAutomations(
  workspaceId: string,
  event: string,
  data: Record<string, unknown>
): Promise<{ triggered: number; failed: number; results: TriggerResult[] }> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  // Get all automation integrations for workspace
  const { data: integrations } = await supabase
    .from('integrations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('type', 'automation')
    .eq('status', 'connected');

  if (!integrations || integrations.length === 0) {
    return { triggered: 0, failed: 0, results: [] };
  }

  const results = await Promise.all(
    integrations.map((integration) =>
      triggerWorkspaceAutomation(integration.id, event, data)
    )
  );

  const triggered = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return { triggered, failed, results };
}

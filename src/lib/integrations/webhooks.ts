// Webhook Management System

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';
import type {
  Webhook,
  WebhookEvent,
  WebhookDelivery,
  RetryPolicy,
} from './types';

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  retryDelayMs: 5000,
  backoffMultiplier: 2,
};

// Get webhook by ID
export async function getWebhook(webhookId: string): Promise<Webhook | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('webhooks')
    .select('*')
    .eq('id', webhookId)
    .single();

  if (error || !data) return null;

  return mapWebhook(data);
}

// Get webhooks for workspace
export async function getWorkspaceWebhooks(
  workspaceId: string,
  options: {
    event?: WebhookEvent;
    isActive?: boolean;
  } = {}
): Promise<Webhook[]> {
  const supabase = await createClient();

  let query = supabase
    .from('webhooks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (options.isActive !== undefined) {
    query = query.eq('is_active', options.isActive);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  let webhooks = data.map(mapWebhook);

  // Filter by event if specified
  if (options.event) {
    webhooks = webhooks.filter(
      (w) => w.events.includes(options.event!) || w.events.includes('all')
    );
  }

  return webhooks;
}

// Create webhook
export async function createWebhook(
  workspaceId: string,
  webhook: {
    name: string;
    url: string;
    events: WebhookEvent[];
    headers?: Record<string, string>;
    retryPolicy?: RetryPolicy;
  }
): Promise<{ success: boolean; webhookId?: string; secret?: string; error?: string }> {
  // Use admin client for INSERT operations to bypass RLS
  const adminClient = createAdminClient();

  // Generate webhook secret
  const secret = generateWebhookSecret();

  const { data, error } = await adminClient
    .from('webhooks')
    .insert({
      workspace_id: workspaceId,
      name: webhook.name,
      url: webhook.url,
      secret,
      events: webhook.events,
      is_active: true,
      headers: webhook.headers || {},
      retry_policy: webhook.retryPolicy || DEFAULT_RETRY_POLICY,
      failure_count: 0,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, webhookId: data.id, secret };
}

// Update webhook
export async function updateWebhook(
  webhookId: string,
  updates: {
    name?: string;
    url?: string;
    events?: WebhookEvent[];
    isActive?: boolean;
    headers?: Record<string, string>;
    retryPolicy?: RetryPolicy;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name) updateData.name = updates.name;
  if (updates.url) updateData.url = updates.url;
  if (updates.events) updateData.events = updates.events;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
  if (updates.headers) updateData.headers = updates.headers;
  if (updates.retryPolicy) updateData.retry_policy = updates.retryPolicy;

  const { error } = await supabase
    .from('webhooks')
    .update(updateData)
    .eq('id', webhookId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Delete webhook
export async function deleteWebhook(
  webhookId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Delete deliveries first
  await supabase
    .from('webhook_deliveries')
    .delete()
    .eq('webhook_id', webhookId);

  const { error } = await supabase
    .from('webhooks')
    .delete()
    .eq('id', webhookId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Regenerate webhook secret
export async function regenerateWebhookSecret(
  webhookId: string
): Promise<{ success: boolean; secret?: string; error?: string }> {
  const supabase = await createClient();

  const secret = generateWebhookSecret();

  const { error } = await supabase
    .from('webhooks')
    .update({
      secret,
      updated_at: new Date().toISOString(),
    })
    .eq('id', webhookId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, secret };
}

// Trigger webhook for event
export async function triggerWebhook(
  workspaceId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<{ triggered: number; errors: string[] }> {
  const webhooks = await getWorkspaceWebhooks(workspaceId, {
    event,
    isActive: true,
  });

  let triggered = 0;
  const errors: string[] = [];

  for (const webhook of webhooks) {
    try {
      await queueWebhookDelivery(webhook, event, payload);
      triggered++;
    } catch (error) {
      errors.push(`${webhook.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { triggered, errors };
}

// Queue webhook delivery
async function queueWebhookDelivery(
  webhook: Webhook,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<string> {
  // Use admin client for INSERT operations to bypass RLS
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from('webhook_deliveries')
    .insert({
      webhook_id: webhook.id,
      event,
      payload,
      status: 'pending',
      attempts: 0,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  // Process immediately (in production, use a queue)
  processWebhookDelivery(data.id).catch(console.error);

  return data.id;
}

// Process webhook delivery
export async function processWebhookDelivery(
  deliveryId: string
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const supabase = await createClient();

  // Get delivery and webhook
  const { data: delivery, error: fetchError } = await supabase
    .from('webhook_deliveries')
    .select(`
      *,
      webhooks (*)
    `)
    .eq('id', deliveryId)
    .single();

  if (fetchError || !delivery) {
    return { success: false, error: 'Delivery not found' };
  }

  const webhook = delivery.webhooks as Record<string, unknown>;
  const retryPolicy = (webhook.retry_policy as RetryPolicy) || DEFAULT_RETRY_POLICY;

  // Check if max retries exceeded
  if (delivery.attempts >= retryPolicy.maxRetries) {
    await supabase
      .from('webhook_deliveries')
      .update({ status: 'failed' })
      .eq('id', deliveryId);

    await incrementFailureCount(webhook.id as string);
    return { success: false, error: 'Max retries exceeded' };
  }

  // Prepare request
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = generateSignature(
    JSON.stringify(delivery.payload),
    webhook.secret as string,
    timestamp
  );

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': signature,
    'X-Webhook-Timestamp': timestamp.toString(),
    'X-Webhook-Event': delivery.event,
    'X-Webhook-Delivery-Id': deliveryId,
    ...((webhook.headers as Record<string, string>) || {}),
  };

  try {
    // Increment attempt counter
    await supabase
      .from('webhook_deliveries')
      .update({
        attempts: delivery.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId);

    // Send webhook
    const response = await fetch(webhook.url as string, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: delivery.event,
        timestamp: new Date().toISOString(),
        data: delivery.payload,
      }),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    const responseText = await response.text();

    if (response.ok) {
      // Success
      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'success',
          status_code: response.status,
          response: responseText.substring(0, 1000),
          delivered_at: new Date().toISOString(),
        })
        .eq('id', deliveryId);

      // Update webhook last triggered
      await supabase
        .from('webhooks')
        .update({
          last_triggered_at: new Date().toISOString(),
          failure_count: 0, // Reset failure count on success
        })
        .eq('id', webhook.id);

      return { success: true, statusCode: response.status };
    } else {
      // Failed - schedule retry
      const nextRetryDelay =
        retryPolicy.retryDelayMs *
        Math.pow(retryPolicy.backoffMultiplier, delivery.attempts);

      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'pending',
          status_code: response.status,
          response: responseText.substring(0, 1000),
          next_retry_at: new Date(Date.now() + nextRetryDelay).toISOString(),
        })
        .eq('id', deliveryId);

      return { success: false, statusCode: response.status, error: responseText };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    // Schedule retry
    const nextRetryDelay =
      retryPolicy.retryDelayMs *
      Math.pow(retryPolicy.backoffMultiplier, delivery.attempts);

    await supabase
      .from('webhook_deliveries')
      .update({
        status: 'pending',
        response: message,
        next_retry_at: new Date(Date.now() + nextRetryDelay).toISOString(),
      })
      .eq('id', deliveryId);

    return { success: false, error: message };
  }
}

// Retry failed deliveries
export async function retryFailedDeliveries(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Get pending deliveries that are due for retry
  const { data: deliveries } = await supabase
    .from('webhook_deliveries')
    .select('id')
    .eq('status', 'pending')
    .lt('next_retry_at', now)
    .limit(100);

  if (!deliveries || deliveries.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    const result = await processWebhookDelivery(delivery.id);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return {
    processed: deliveries.length,
    succeeded,
    failed,
  };
}

// Get delivery history
export async function getWebhookDeliveries(
  webhookId: string,
  options: {
    status?: 'pending' | 'success' | 'failed';
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
  const supabase = await createClient();
  const { status, limit = 50, offset = 0 } = options;

  let query = supabase
    .from('webhook_deliveries')
    .select('*', { count: 'exact' })
    .eq('webhook_id', webhookId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, count, error } = await query;

  if (error || !data) {
    return { deliveries: [], total: 0 };
  }

  return {
    deliveries: data.map((d) => ({
      id: d.id,
      webhookId: d.webhook_id,
      event: d.event,
      payload: d.payload,
      status: d.status,
      statusCode: d.status_code,
      response: d.response,
      attempts: d.attempts,
      nextRetryAt: d.next_retry_at ? new Date(d.next_retry_at) : undefined,
      createdAt: new Date(d.created_at),
      deliveredAt: d.delivered_at ? new Date(d.delivered_at) : undefined,
    })),
    total: count ?? 0,
  };
}

// Verify webhook signature
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  timestamp: number,
  toleranceSeconds: number = 300
): boolean {
  // Check timestamp is within tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  // Verify signature
  const expectedSignature = generateSignature(payload, secret, timestamp);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Generate webhook signature
function generateSignature(
  payload: string,
  secret: string,
  timestamp: number
): string {
  const signedPayload = `${timestamp}.${payload}`;
  return crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
}

// Generate webhook secret
function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

// Increment failure count
async function incrementFailureCount(webhookId: string): Promise<void> {
  const supabase = await createClient();

  // Get current failure count
  const { data: webhook } = await supabase
    .from('webhooks')
    .select('failure_count')
    .eq('id', webhookId)
    .single();

  const newCount = (webhook?.failure_count || 0) + 1;

  // Update failure count
  await supabase
    .from('webhooks')
    .update({
      failure_count: newCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', webhookId);

  // Disable webhook if too many failures
  if (newCount >= 10) {
    await supabase
      .from('webhooks')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', webhookId);
  }
}

// Helper to map database row to Webhook type
function mapWebhook(data: Record<string, unknown>): Webhook {
  return {
    id: data.id as string,
    workspaceId: data.workspace_id as string,
    name: data.name as string,
    url: data.url as string,
    secret: data.secret as string,
    events: data.events as WebhookEvent[],
    isActive: data.is_active as boolean,
    headers: data.headers as Record<string, string>,
    retryPolicy: (data.retry_policy as RetryPolicy) || DEFAULT_RETRY_POLICY,
    lastTriggeredAt: data.last_triggered_at
      ? new Date(data.last_triggered_at as string)
      : undefined,
    failureCount: (data.failure_count as number) || 0,
    createdAt: new Date(data.created_at as string),
    updatedAt: new Date(data.updated_at as string),
  };
}

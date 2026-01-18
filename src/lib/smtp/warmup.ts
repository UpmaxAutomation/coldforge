// Email Warmup System
// Gradual warmup to build sender reputation for new mailboxes

import { createClient } from '../supabase/server';
import { sendEmail, createSmtpClient } from './client';
import { decrypt } from '../encryption';
import type { SmtpProviderConfig, SmtpProviderType, EmailMessage } from './types';

// Warmup email templates
const WARMUP_SUBJECTS = [
  'Quick question about your availability',
  'Following up on our last conversation',
  'Checking in - hope you are doing well',
  'Re: Meeting notes from last week',
  'Quick update on the project',
  'Thanks for the introduction',
  'Re: Your thoughts on this?',
  'Circling back on our discussion',
  'Just wanted to follow up',
  'Any updates on your end?',
  'Great catching up yesterday',
  'Re: Quick favor to ask',
  'Thinking about our conversation',
  'Hope this finds you well',
  'Following up as promised',
];

const WARMUP_BODIES = [
  'Hope you are having a great week! Just wanted to check in and see how things are going on your end.',
  'Thanks for getting back to me so quickly. Really appreciate you taking the time to help with this.',
  'It was great catching up yesterday. Looking forward to continuing our conversation soon.',
  'Just a quick note to say thank you for the introduction. I will reach out to them this week.',
  'Wanted to follow up on our last discussion. Let me know if you have any updates.',
  'Hope you had a good weekend! Just circling back on our conversation from last week.',
  'Thanks for thinking of me for this. I will take a look and get back to you shortly.',
  'Really enjoyed our chat the other day. Let me know when you are free to continue.',
  'Just wanted to send a quick update on where things stand. More details to come.',
  'Appreciate you getting back to me. This is really helpful information.',
];

// Generate warmup email content
function generateWarmupContent(): { subject: string; body: string } {
  const subject = WARMUP_SUBJECTS[Math.floor(Math.random() * WARMUP_SUBJECTS.length)];
  const bodyTemplate = WARMUP_BODIES[Math.floor(Math.random() * WARMUP_BODIES.length)];

  // Add some variation to avoid spam detection
  const greetings = ['Hi', 'Hey', 'Hello', 'Hi there'];
  const closings = ['Best', 'Thanks', 'Cheers', 'Talk soon'];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];
  const closing = closings[Math.floor(Math.random() * closings.length)];

  const body = `${greeting},\n\n${bodyTemplate}\n\n${closing}`;

  return { subject, body };
}

// Get warmup schedule for a mailbox based on day
export function getWarmupLimits(day: number): {
  minPerDay: number;
  maxPerDay: number;
  rampUpFactor: number;
} {
  // 30-day warmup schedule
  const schedules = [
    { day: 1, min: 2, max: 5 },
    { day: 2, min: 3, max: 7 },
    { day: 3, min: 5, max: 10 },
    { day: 4, min: 7, max: 15 },
    { day: 5, min: 10, max: 20 },
    { day: 6, min: 12, max: 25 },
    { day: 7, min: 15, max: 30 },
    { day: 8, min: 18, max: 35 },
    { day: 9, min: 20, max: 40 },
    { day: 10, min: 25, max: 45 },
    { day: 11, min: 28, max: 50 },
    { day: 12, min: 30, max: 55 },
    { day: 13, min: 32, max: 60 },
    { day: 14, min: 35, max: 65 },
    { day: 15, min: 38, max: 70 },
    { day: 16, min: 40, max: 75 },
    { day: 17, min: 42, max: 80 },
    { day: 18, min: 45, max: 85 },
    { day: 19, min: 48, max: 90 },
    { day: 20, min: 50, max: 95 },
    { day: 21, min: 52, max: 100 },
    { day: 22, min: 55, max: 105 },
    { day: 23, min: 58, max: 110 },
    { day: 24, min: 60, max: 115 },
    { day: 25, min: 62, max: 120 },
    { day: 26, min: 65, max: 125 },
    { day: 27, min: 68, max: 130 },
    { day: 28, min: 70, max: 135 },
    { day: 29, min: 72, max: 140 },
    { day: 30, min: 75, max: 150 },
  ];

  // Find the schedule for the given day
  const schedule = schedules.find((s) => s.day === day) ||
    schedules[schedules.length - 1];

  return {
    minPerDay: schedule.min,
    maxPerDay: schedule.max,
    rampUpFactor: day <= 14 ? 1.5 : day <= 21 ? 1.2 : 1.0,
  };
}

// Get mailboxes due for warmup
export async function getWarmupMailboxes(): Promise<Array<{
  id: string;
  email: string;
  workspaceId: string;
  warmupDay: number;
  warmupSentToday: number;
  smtpProviderId?: string;
}>> {
  const supabase = await createClient();

  const { data: mailboxes, error } = await supabase
    .from('provisioned_mailboxes')
    .select(`
      id,
      email,
      workspace_id,
      warmup_day,
      warmup_sent_today,
      smtp_provider_id
    `)
    .eq('status', 'active')
    .eq('warmup_enabled', true)
    .in('warmup_status', ['warming', 'paused'])
    .lt('warmup_day', 31); // 30 day warmup

  if (error || !mailboxes) return [];

  return mailboxes.map((m) => ({
    id: m.id,
    email: m.email,
    workspaceId: m.workspace_id,
    warmupDay: m.warmup_day,
    warmupSentToday: m.warmup_sent_today || 0,
    smtpProviderId: m.smtp_provider_id,
  }));
}

// Get partner mailboxes for warmup exchange
async function getWarmupPartners(
  excludeMailboxId: string,
  count: number
): Promise<Array<{ id: string; email: string }>> {
  const supabase = await createClient();

  // Get mailboxes from the warmup pool
  const { data: poolEmails, error } = await supabase
    .from('warmup_pool')
    .select('email')
    .neq('mailbox_id', excludeMailboxId)
    .eq('is_active', true)
    .order('last_interaction', { ascending: true })
    .limit(count);

  if (error || !poolEmails) {
    // Fallback to other active mailboxes in the system
    const { data: mailboxes } = await supabase
      .from('provisioned_mailboxes')
      .select('id, email')
      .eq('status', 'active')
      .eq('warmup_enabled', true)
      .neq('id', excludeMailboxId)
      .limit(count);

    return (mailboxes || []).map((m) => ({ id: m.id, email: m.email }));
  }

  return poolEmails.map((p) => ({ id: '', email: p.email }));
}

// Send warmup email
export async function sendWarmupEmail(
  mailboxId: string,
  targetEmail: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Get mailbox details
  const { data: mailbox, error: mailboxError } = await supabase
    .from('provisioned_mailboxes')
    .select(`
      id,
      email,
      display_name,
      workspace_id,
      smtp_provider_id
    `)
    .eq('id', mailboxId)
    .single();

  if (mailboxError || !mailbox) {
    return { success: false, error: 'Mailbox not found' };
  }

  // Get SMTP provider
  let provider: SmtpProviderConfig | null = null;

  if (mailbox.smtp_provider_id) {
    const { data: providerData } = await supabase
      .from('smtp_providers')
      .select('*')
      .eq('id', mailbox.smtp_provider_id)
      .eq('is_active', true)
      .eq('is_healthy', true)
      .single();

    if (providerData) {
      let credentials;
      if (providerData.username_encrypted && providerData.password_encrypted) {
        credentials = {
          host: providerData.host,
          port: providerData.port,
          username: decrypt(providerData.username_encrypted),
          password: decrypt(providerData.password_encrypted),
        };
      }

      let apiCredentials;
      if (providerData.api_key_encrypted) {
        apiCredentials = {
          apiKey: decrypt(providerData.api_key_encrypted),
          apiSecret: providerData.api_secret_encrypted
            ? decrypt(providerData.api_secret_encrypted)
            : undefined,
          region: providerData.region,
          endpoint: providerData.endpoint,
        };
      }

      provider = {
        id: providerData.id,
        workspaceId: providerData.workspace_id,
        name: providerData.name,
        providerType: providerData.provider_type as SmtpProviderType,
        credentials,
        apiCredentials,
        config: providerData.config,
        isActive: providerData.is_active,
        isHealthy: providerData.is_healthy,
        priority: providerData.priority,
        rateLimits: {
          maxPerSecond: providerData.max_per_second,
          maxPerMinute: providerData.max_per_minute,
          maxPerHour: providerData.max_per_hour,
          maxPerDay: providerData.max_per_day,
        },
      };
    }
  }

  if (!provider) {
    return { success: false, error: 'No SMTP provider available' };
  }

  // Generate warmup content
  const { subject, body } = generateWarmupContent();

  // Prepare message
  const message: EmailMessage = {
    from: {
      email: mailbox.email,
      name: mailbox.display_name || undefined,
    },
    to: {
      email: targetEmail,
    },
    subject,
    html: body.replace(/\n/g, '<br>'),
    text: body,
  };

  // Send the email
  const result = await sendEmail(provider, message);

  if (result.success) {
    // Record warmup send
    await supabase.from('warmup_schedules').insert({
      mailbox_id: mailboxId,
      partner_email: targetEmail,
      action: 'send',
      scheduled_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      message_id: result.messageId,
    });

    // Update mailbox warmup counter
    await supabase.rpc('increment_warmup_sent', {
      p_mailbox_id: mailboxId,
    });
  }

  return {
    success: result.success,
    error: result.error,
  };
}

// Process warmup for all eligible mailboxes
export async function processWarmupBatch(): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  const mailboxes = await getWarmupMailboxes();
  let successful = 0;
  let failed = 0;

  for (const mailbox of mailboxes) {
    const limits = getWarmupLimits(mailbox.warmupDay);

    // Calculate how many more to send today
    const remaining = limits.maxPerDay - mailbox.warmupSentToday;
    if (remaining <= 0) continue;

    // Get random number of emails to send this batch (1-3)
    const toSend = Math.min(remaining, Math.floor(Math.random() * 3) + 1);

    // Get partner mailboxes
    const partners = await getWarmupPartners(mailbox.id, toSend);

    for (const partner of partners) {
      const result = await sendWarmupEmail(mailbox.id, partner.email);

      if (result.success) {
        successful++;
      } else {
        failed++;
      }

      // Small delay between sends
      await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 3000));
    }
  }

  return {
    processed: mailboxes.length,
    successful,
    failed,
  };
}

// Reset daily warmup counters (called at midnight UTC)
export async function resetDailyWarmupCounters(): Promise<void> {
  const supabase = await createClient();

  // Reset sent today counter and increment warmup day
  await supabase.rpc('reset_warmup_daily');
}

// Add mailbox to warmup pool
export async function addToWarmupPool(
  mailboxId: string,
  email: string
): Promise<{ success: boolean }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('warmup_pool')
    .upsert({
      mailbox_id: mailboxId,
      email,
      is_active: true,
      added_at: new Date().toISOString(),
    });

  return { success: !error };
}

// Remove mailbox from warmup pool
export async function removeFromWarmupPool(
  mailboxId: string
): Promise<{ success: boolean }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('warmup_pool')
    .update({ is_active: false })
    .eq('mailbox_id', mailboxId);

  return { success: !error };
}

// Get warmup status for a mailbox
export async function getWarmupStatus(mailboxId: string): Promise<{
  enabled: boolean;
  status: string;
  day: number;
  sentToday: number;
  limits: { min: number; max: number };
  health: {
    deliverability: number;
    openRate: number;
    replyRate: number;
  };
} | null> {
  const supabase = await createClient();

  const { data: mailbox, error } = await supabase
    .from('provisioned_mailboxes')
    .select(`
      warmup_enabled,
      warmup_status,
      warmup_day,
      warmup_sent_today,
      warmup_reputation_score
    `)
    .eq('id', mailboxId)
    .single();

  if (error || !mailbox) return null;

  const limits = getWarmupLimits(mailbox.warmup_day);

  // Get recent warmup stats
  const { data: recentStats } = await supabase
    .from('warmup_schedules')
    .select('action, reply_received')
    .eq('mailbox_id', mailboxId)
    .gte('completed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  const sentCount = recentStats?.filter((s) => s.action === 'send').length || 0;
  const repliedCount = recentStats?.filter((s) => s.reply_received).length || 0;

  return {
    enabled: mailbox.warmup_enabled,
    status: mailbox.warmup_status,
    day: mailbox.warmup_day,
    sentToday: mailbox.warmup_sent_today,
    limits: {
      min: limits.minPerDay,
      max: limits.maxPerDay,
    },
    health: {
      deliverability: mailbox.warmup_reputation_score || 0,
      openRate: 0.85, // Would calculate from actual data
      replyRate: sentCount > 0 ? repliedCount / sentCount : 0,
    },
  };
}

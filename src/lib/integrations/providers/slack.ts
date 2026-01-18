// Slack Integration - Notifications and Alerts

import type { IntegrationCredentials } from '../types';
import { getIntegrationCredentials } from '../manager';

interface SlackMessage {
  channel?: string;
  text?: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  thread_ts?: string;
  mrkdwn?: boolean;
}

interface SlackBlock {
  type: 'section' | 'divider' | 'header' | 'context' | 'actions';
  text?: {
    type: 'mrkdwn' | 'plain_text';
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: 'mrkdwn' | 'plain_text';
    text: string;
  }>;
  accessory?: {
    type: string;
    [key: string]: unknown;
  };
  elements?: unknown[];
}

interface SlackAttachment {
  color?: string;
  fallback?: string;
  pretext?: string;
  author_name?: string;
  title?: string;
  text?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  footer?: string;
  ts?: number;
}

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
}

// Send message to Slack
export async function sendMessage(
  credentials: IntegrationCredentials,
  message: SlackMessage
): Promise<{ success: boolean; ts?: string; error?: string }> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  const data = await response.json();

  if (data.ok) {
    return { success: true, ts: data.ts };
  }

  return { success: false, error: data.error };
}

// List channels the bot has access to
export async function listChannels(
  credentials: IntegrationCredentials
): Promise<SlackChannel[]> {
  const response = await fetch(
    'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200',
    {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
      },
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Failed to list channels');
  }

  return data.channels.map((ch: Record<string, unknown>) => ({
    id: ch.id,
    name: ch.name,
    is_private: ch.is_private,
    is_member: ch.is_member,
  }));
}

// Join a channel
export async function joinChannel(
  credentials: IntegrationCredentials,
  channelId: string
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch('https://slack.com/api/conversations.join', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel: channelId }),
  });

  const data = await response.json();

  if (data.ok) {
    return { success: true };
  }

  return { success: false, error: data.error };
}

// Notification Templates

// Send campaign started notification
export async function notifyCampaignStarted(
  integrationId: string,
  channelId: string,
  campaign: {
    name: string;
    id: string;
    totalLeads: number;
    scheduledTime?: Date;
  }
): Promise<{ success: boolean; error?: string }> {
  const credentials = await getIntegrationCredentials(integrationId);
  if (!credentials) {
    return { success: false, error: 'No credentials found' };
  }

  const message: SlackMessage = {
    channel: channelId,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚀 Campaign Started',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Campaign:*\n${campaign.name}`,
          },
          {
            type: 'mrkdwn',
            text: `*Total Leads:*\n${campaign.totalLeads.toLocaleString()}`,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Campaign ID: ${campaign.id}`,
          },
        ],
      },
    ],
  };

  return sendMessage(credentials, message);
}

// Send reply notification
export async function notifyReplyReceived(
  integrationId: string,
  channelId: string,
  reply: {
    leadEmail: string;
    leadName?: string;
    campaignName: string;
    subject: string;
    snippet: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
  }
): Promise<{ success: boolean; error?: string }> {
  const credentials = await getIntegrationCredentials(integrationId);
  if (!credentials) {
    return { success: false, error: 'No credentials found' };
  }

  const sentimentEmoji =
    reply.sentiment === 'positive'
      ? '🟢'
      : reply.sentiment === 'negative'
        ? '🔴'
        : '🟡';

  const message: SlackMessage = {
    channel: channelId,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📬 New Reply Received',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*From:*\n${reply.leadName || reply.leadEmail}`,
          },
          {
            type: 'mrkdwn',
            text: `*Campaign:*\n${reply.campaignName}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Subject:* ${reply.subject}\n\n> ${reply.snippet.substring(0, 200)}${reply.snippet.length > 200 ? '...' : ''}`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${sentimentEmoji} Sentiment: ${reply.sentiment || 'unknown'}`,
          },
        ],
      },
    ],
  };

  return sendMessage(credentials, message);
}

// Send daily summary
export async function sendDailySummary(
  integrationId: string,
  channelId: string,
  summary: {
    date: Date;
    emailsSent: number;
    emailsOpened: number;
    emailsClicked: number;
    emailsReplied: number;
    emailsBounced: number;
    newLeads: number;
    activeCampaigns: number;
  }
): Promise<{ success: boolean; error?: string }> {
  const credentials = await getIntegrationCredentials(integrationId);
  if (!credentials) {
    return { success: false, error: 'No credentials found' };
  }

  const openRate = summary.emailsSent > 0
    ? ((summary.emailsOpened / summary.emailsSent) * 100).toFixed(1)
    : '0';
  const replyRate = summary.emailsSent > 0
    ? ((summary.emailsReplied / summary.emailsSent) * 100).toFixed(1)
    : '0';

  const message: SlackMessage = {
    channel: channelId,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 Daily Summary - ${summary.date.toLocaleDateString()}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Emails Sent:*\n${summary.emailsSent.toLocaleString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Emails Opened:*\n${summary.emailsOpened.toLocaleString()} (${openRate}%)`,
          },
          {
            type: 'mrkdwn',
            text: `*Clicks:*\n${summary.emailsClicked.toLocaleString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Replies:*\n${summary.emailsReplied.toLocaleString()} (${replyRate}%)`,
          },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Active Campaigns:*\n${summary.activeCampaigns}`,
          },
          {
            type: 'mrkdwn',
            text: `*New Leads:*\n${summary.newLeads.toLocaleString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Bounces:*\n${summary.emailsBounced.toLocaleString()}`,
          },
        ],
      },
    ],
  };

  return sendMessage(credentials, message);
}

// Send alert notification
export async function sendAlert(
  integrationId: string,
  channelId: string,
  alert: {
    type: 'warning' | 'error' | 'info';
    title: string;
    message: string;
    details?: Record<string, string>;
  }
): Promise<{ success: boolean; error?: string }> {
  const credentials = await getIntegrationCredentials(integrationId);
  if (!credentials) {
    return { success: false, error: 'No credentials found' };
  }

  const emoji = alert.type === 'error' ? '🚨' : alert.type === 'warning' ? '⚠️' : 'ℹ️';
  const color = alert.type === 'error' ? '#FF0000' : alert.type === 'warning' ? '#FFA500' : '#0000FF';

  const fields = alert.details
    ? Object.entries(alert.details).map(([title, value]) => ({
        type: 'mrkdwn' as const,
        text: `*${title}:*\n${value}`,
      }))
    : [];

  const message: SlackMessage = {
    channel: channelId,
    attachments: [
      {
        color,
        fallback: `${emoji} ${alert.title}: ${alert.message}`,
        title: `${emoji} ${alert.title}`,
        text: alert.message,
        fields: alert.details
          ? Object.entries(alert.details).map(([title, value]) => ({
              title,
              value,
              short: true,
            }))
          : undefined,
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  return sendMessage(credentials, message);
}

// Send bounce alert
export async function notifyBounce(
  integrationId: string,
  channelId: string,
  bounce: {
    email: string;
    reason: string;
    bounceType: 'hard' | 'soft';
    mailbox: string;
    campaignName?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const credentials = await getIntegrationCredentials(integrationId);
  if (!credentials) {
    return { success: false, error: 'No credentials found' };
  }

  const emoji = bounce.bounceType === 'hard' ? '🔴' : '🟡';

  const message: SlackMessage = {
    channel: channelId,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *Email Bounced* (${bounce.bounceType})`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Email:*\n${bounce.email}`,
          },
          {
            type: 'mrkdwn',
            text: `*Mailbox:*\n${bounce.mailbox}`,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Reason: ${bounce.reason}`,
          },
        ],
      },
    ],
  };

  return sendMessage(credentials, message);
}

// Send warmup status update
export async function notifyWarmupStatus(
  integrationId: string,
  channelId: string,
  status: {
    mailbox: string;
    currentDay: number;
    targetEmails: number;
    sentToday: number;
    reputation: number;
    issues?: string[];
  }
): Promise<{ success: boolean; error?: string }> {
  const credentials = await getIntegrationCredentials(integrationId);
  if (!credentials) {
    return { success: false, error: 'No credentials found' };
  }

  const reputationEmoji =
    status.reputation >= 80
      ? '🟢'
      : status.reputation >= 50
        ? '🟡'
        : '🔴';

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔥 Warmup Update - ${status.mailbox}*`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Day:*\n${status.currentDay}`,
        },
        {
          type: 'mrkdwn',
          text: `*Progress:*\n${status.sentToday}/${status.targetEmails}`,
        },
        {
          type: 'mrkdwn',
          text: `*Reputation:*\n${reputationEmoji} ${status.reputation}%`,
        },
      ],
    },
  ];

  if (status.issues && status.issues.length > 0) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `⚠️ Issues: ${status.issues.join(', ')}`,
        },
      ],
    });
  }

  const message: SlackMessage = {
    channel: channelId,
    blocks,
  };

  return sendMessage(credentials, message);
}

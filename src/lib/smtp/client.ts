// SMTP Client
// Unified interface for sending emails through various providers

import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import {
  SmtpProviderConfig,
  SmtpProviderType,
  EmailMessage,
  SendResult,
  BulkSendResult,
  ProviderHealth,
} from './types';

// Circuit breaker state
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
  lastStateChange: number;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_RESET_TIMEOUT = 60000; // 1 minute
const CIRCUIT_HALF_OPEN_REQUESTS = 1;

function getCircuitState(providerId: string): CircuitBreakerState {
  if (!circuitBreakers.has(providerId)) {
    circuitBreakers.set(providerId, {
      failures: 0,
      lastFailure: 0,
      state: 'closed',
      lastStateChange: Date.now(),
    });
  }
  return circuitBreakers.get(providerId)!;
}

function recordSuccess(providerId: string): void {
  const circuit = getCircuitState(providerId);
  circuit.failures = 0;
  circuit.state = 'closed';
  circuit.lastStateChange = Date.now();
}

function recordFailure(providerId: string): void {
  const circuit = getCircuitState(providerId);
  circuit.failures++;
  circuit.lastFailure = Date.now();

  if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuit.state = 'open';
    circuit.lastStateChange = Date.now();
    console.warn(`[SMTP Circuit Breaker] Circuit OPEN for provider ${providerId} after ${circuit.failures} failures`);
  }
}

function canAttempt(providerId: string): boolean {
  const circuit = getCircuitState(providerId);

  if (circuit.state === 'closed') {
    return true;
  }

  if (circuit.state === 'open') {
    // Check if we should transition to half-open
    if (Date.now() - circuit.lastStateChange >= CIRCUIT_RESET_TIMEOUT) {
      circuit.state = 'half-open';
      circuit.lastStateChange = Date.now();
      console.log(`[SMTP Circuit Breaker] Circuit HALF-OPEN for provider ${providerId}`);
      return true;
    }
    return false;
  }

  // half-open - allow limited requests
  return true;
}

export function getCircuitBreakerStatus(providerId: string): CircuitBreakerState {
  return getCircuitState(providerId);
}

// Provider-specific clients
interface ProviderClient {
  send(message: EmailMessage): Promise<SendResult>;
  verify(): Promise<boolean>;
  close(): Promise<void>;
}

// Generic SMTP client using nodemailer
class NodemailerClient implements ProviderClient {
  private transporter: Transporter<SMTPTransport.SentMessageInfo>;
  private config: SmtpProviderConfig;

  constructor(config: SmtpProviderConfig) {
    this.config = config;

    if (!config.credentials) {
      throw new Error('SMTP credentials required for nodemailer client');
    }

    // TLS validation: Enable by default for security, allow override for testing
    const rejectUnauthorized = process.env.SMTP_ALLOW_SELF_SIGNED !== 'true';

    this.transporter = nodemailer.createTransport({
      host: config.credentials.host,
      port: config.credentials.port,
      secure: config.credentials.secure ?? config.credentials.port === 465,
      auth: {
        user: config.credentials.username,
        pass: config.credentials.password,
      },
      tls: {
        rejectUnauthorized, // SECURITY: Validate TLS certificates by default
        minVersion: 'TLSv1.2', // Enforce minimum TLS version
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: 30000, // 30 second timeout
      greetingTimeout: 15000,
      socketTimeout: 60000,
    });
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const result = await this.transporter.sendMail({
        from: message.from.name
          ? `"${message.from.name}" <${message.from.email}>`
          : message.from.email,
        to: message.to.name
          ? `"${message.to.name}" <${message.to.email}>`
          : message.to.email,
        replyTo: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
        attachments: message.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
          encoding: a.encoding,
        })),
      });

      return {
        success: true,
        messageId: result.messageId,
        providerId: this.config.id,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        providerId: this.config.id,
        timestamp: new Date(),
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    this.transporter.close();
  }
}

// AWS SES client
class AwsSesClient implements ProviderClient {
  private config: SmtpProviderConfig;

  constructor(config: SmtpProviderConfig) {
    this.config = config;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      // Use AWS SDK v3
      const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');

      const client = new SESClient({
        region: this.config.apiCredentials?.region || 'us-east-1',
        credentials: {
          accessKeyId: this.config.apiCredentials?.apiKey || '',
          secretAccessKey: this.config.apiCredentials?.apiSecret || '',
        },
      });

      const command = new SendEmailCommand({
        Source: message.from.name
          ? `${message.from.name} <${message.from.email}>`
          : message.from.email,
        Destination: {
          ToAddresses: [message.to.email],
        },
        Message: {
          Subject: {
            Data: message.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: message.html,
              Charset: 'UTF-8',
            },
            Text: message.text ? {
              Data: message.text,
              Charset: 'UTF-8',
            } : undefined,
          },
        },
        ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
      });

      const result = await client.send(command);

      return {
        success: true,
        messageId: result.MessageId,
        providerId: this.config.id,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'AWS SES error',
        providerId: this.config.id,
        timestamp: new Date(),
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      const { SESClient, GetAccountSendingEnabledCommand } = await import('@aws-sdk/client-ses');

      const client = new SESClient({
        region: this.config.apiCredentials?.region || 'us-east-1',
        credentials: {
          accessKeyId: this.config.apiCredentials?.apiKey || '',
          secretAccessKey: this.config.apiCredentials?.apiSecret || '',
        },
      });

      await client.send(new GetAccountSendingEnabledCommand({}));
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // No cleanup needed for SES
  }
}

// SendGrid client
class SendGridClient implements ProviderClient {
  private config: SmtpProviderConfig;

  constructor(config: SmtpProviderConfig) {
    this.config = config;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiCredentials?.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: message.to.email, name: message.to.name }],
          }],
          from: { email: message.from.email, name: message.from.name },
          reply_to: message.replyTo ? { email: message.replyTo } : undefined,
          subject: message.subject,
          content: [
            { type: 'text/html', value: message.html },
            ...(message.text ? [{ type: 'text/plain', value: message.text }] : []),
          ],
          headers: message.headers,
          custom_args: message.trackingId ? { tracking_id: message.trackingId } : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          error: `SendGrid error: ${error}`,
          providerId: this.config.id,
          timestamp: new Date(),
        };
      }

      const messageId = response.headers.get('x-message-id');

      return {
        success: true,
        messageId: messageId || undefined,
        providerId: this.config.id,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'SendGrid error',
        providerId: this.config.id,
        timestamp: new Date(),
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/user/email', {
        headers: {
          'Authorization': `Bearer ${this.config.apiCredentials?.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // No cleanup needed
  }
}

// Postmark client
class PostmarkClient implements ProviderClient {
  private config: SmtpProviderConfig;

  constructor(config: SmtpProviderConfig) {
    this.config = config;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const response = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'X-Postmark-Server-Token': this.config.apiCredentials?.apiKey || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          From: message.from.name
            ? `${message.from.name} <${message.from.email}>`
            : message.from.email,
          To: message.to.name
            ? `${message.to.name} <${message.to.email}>`
            : message.to.email,
          ReplyTo: message.replyTo,
          Subject: message.subject,
          HtmlBody: message.html,
          TextBody: message.text,
          Headers: message.headers
            ? Object.entries(message.headers).map(([name, value]) => ({ Name: name, Value: value }))
            : undefined,
          Metadata: message.trackingId ? { tracking_id: message.trackingId } : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.Message || 'Postmark error',
          errorCode: error.ErrorCode?.toString(),
          providerId: this.config.id,
          timestamp: new Date(),
        };
      }

      const result = await response.json();

      return {
        success: true,
        messageId: result.MessageID,
        providerId: this.config.id,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Postmark error',
        providerId: this.config.id,
        timestamp: new Date(),
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      const response = await fetch('https://api.postmarkapp.com/server', {
        headers: {
          'X-Postmark-Server-Token': this.config.apiCredentials?.apiKey || '',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // No cleanup needed
  }
}

// Client factory
export function createSmtpClient(config: SmtpProviderConfig): ProviderClient {
  switch (config.providerType) {
    case 'aws_ses':
      return new AwsSesClient(config);
    case 'sendgrid':
      return new SendGridClient(config);
    case 'postmark':
      return new PostmarkClient(config);
    case 'smtp_relay':
    case 'google_workspace':
    case 'microsoft_365':
    case 'custom':
    default:
      return new NodemailerClient(config);
  }
}

// Connection pool manager
class SmtpConnectionPool {
  private pools: Map<string, ProviderClient[]> = new Map();
  private configs: Map<string, SmtpProviderConfig> = new Map();
  private maxPoolSize: number = 5;

  setConfig(providerId: string, config: SmtpProviderConfig): void {
    this.configs.set(providerId, config);
  }

  async getConnection(providerId: string): Promise<ProviderClient | null> {
    const config = this.configs.get(providerId);
    if (!config) return null;

    let pool = this.pools.get(providerId);
    if (!pool) {
      pool = [];
      this.pools.set(providerId, pool);
    }

    // Return existing connection if available
    if (pool.length > 0) {
      return pool.pop()!;
    }

    // Create new connection
    return createSmtpClient(config);
  }

  releaseConnection(providerId: string, client: ProviderClient): void {
    const pool = this.pools.get(providerId);
    if (!pool) return;

    if (pool.length < this.maxPoolSize) {
      pool.push(client);
    } else {
      // Pool is full, close connection
      client.close().catch(console.error);
    }
  }

  async closeAll(): Promise<void> {
    for (const pool of this.pools.values()) {
      for (const client of pool) {
        await client.close().catch(console.error);
      }
    }
    this.pools.clear();
  }
}

// Export singleton pool
export const smtpPool = new SmtpConnectionPool();

// High-level send function with circuit breaker
export async function sendEmail(
  config: SmtpProviderConfig,
  message: EmailMessage
): Promise<SendResult> {
  // Check circuit breaker before attempting
  if (!canAttempt(config.id)) {
    return {
      success: false,
      error: `Circuit breaker OPEN for provider ${config.id}. Retry after cooldown.`,
      providerId: config.id,
      timestamp: new Date(),
    };
  }

  smtpPool.setConfig(config.id, config);

  const client = await smtpPool.getConnection(config.id);
  if (!client) {
    recordFailure(config.id);
    return {
      success: false,
      error: 'Failed to get SMTP connection',
      providerId: config.id,
      timestamp: new Date(),
    };
  }

  try {
    const result = await client.send(message);
    smtpPool.releaseConnection(config.id, client);

    if (result.success) {
      recordSuccess(config.id);
    } else {
      recordFailure(config.id);
    }

    return result;
  } catch (error) {
    smtpPool.releaseConnection(config.id, client);
    recordFailure(config.id);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Send failed',
      providerId: config.id,
      timestamp: new Date(),
    };
  }
}

// Bulk send with rate limiting
export async function sendBulkEmails(
  config: SmtpProviderConfig,
  messages: EmailMessage[],
  options: {
    maxConcurrency?: number;
    delayMs?: number;
    stopOnError?: boolean;
  } = {}
): Promise<BulkSendResult> {
  const {
    maxConcurrency = 5,
    delayMs = 100,
    stopOnError = false,
  } = options;

  const results: BulkSendResult['results'] = [];
  let successful = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < messages.length; i += maxConcurrency) {
    const batch = messages.slice(i, i + maxConcurrency);

    const batchResults = await Promise.all(
      batch.map(async (message) => {
        const result = await sendEmail(config, message);
        return {
          email: message.to.email,
          success: result.success,
          messageId: result.messageId,
          error: result.error,
        };
      })
    );

    for (const result of batchResults) {
      results.push(result);
      if (result.success) {
        successful++;
      } else {
        failed++;
        if (stopOnError) {
          return {
            total: messages.length,
            successful,
            failed,
            results,
          };
        }
      }
    }

    // Delay between batches
    if (i + maxConcurrency < messages.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return {
    total: messages.length,
    successful,
    failed,
    results,
  };
}

// Verify provider connection
export async function verifyProvider(config: SmtpProviderConfig): Promise<boolean> {
  const client = createSmtpClient(config);
  try {
    return await client.verify();
  } finally {
    await client.close();
  }
}

// Health check for provider
export async function checkProviderHealth(
  config: SmtpProviderConfig
): Promise<ProviderHealth> {
  const startTime = Date.now();
  const isHealthy = await verifyProvider(config);
  const responseTime = Date.now() - startTime;

  return {
    providerId: config.id,
    isHealthy,
    lastCheck: new Date(),
    consecutiveFailures: isHealthy ? 0 : 1, // Would need to track state for real value
    errorRate24h: 0, // Would need to calculate from events
    avgResponseTime: responseTime,
  };
}

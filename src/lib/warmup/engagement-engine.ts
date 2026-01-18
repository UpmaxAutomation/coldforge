/**
 * Engagement Engine
 *
 * Simulates human-like email engagement using headless browser automation.
 * This is critical for building authentic engagement signals that ESPs track.
 *
 * Key features:
 * - Gmail/Outlook webmail login simulation
 * - Natural mouse movements and typing patterns
 * - Email opening, scrolling, and reading simulation
 * - Reply composition and sending
 * - Moving emails from spam to inbox (spam rescue)
 * - Star/flag/archive actions
 */

import puppeteer, { Browser, Page, ElementHandle } from 'puppeteer';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/encryption';

// Supported email providers for automation
export type EmailProvider = 'gmail' | 'outlook' | 'yahoo';

// Engagement action types
export type EngagementAction =
  | 'open'
  | 'read'
  | 'scroll'
  | 'reply'
  | 'forward'
  | 'star'
  | 'archive'
  | 'move_to_inbox'
  | 'mark_not_spam'
  | 'click_link';

// Engagement session configuration
export interface EngagementConfig {
  headless?: boolean;
  slowMo?: number;
  viewport?: { width: number; height: number };
  userAgent?: string;
  timeout?: number;
  humanizeActions?: boolean;
}

// Engagement result
export interface EngagementResult {
  success: boolean;
  action: EngagementAction;
  emailId?: string;
  duration: number;
  error?: string;
  screenshots?: string[];
}

// Email search criteria
export interface EmailSearchCriteria {
  from?: string;
  subject?: string;
  folder?: 'inbox' | 'spam' | 'promotions' | 'all';
  unreadOnly?: boolean;
  maxAge?: number; // hours
}

// Default configuration
const DEFAULT_CONFIG: EngagementConfig = {
  headless: true,
  slowMo: 50,
  viewport: { width: 1366, height: 768 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  timeout: 60000,
  humanizeActions: true
};

// Gmail selectors
const GMAIL_SELECTORS = {
  emailInput: 'input[type="email"]',
  passwordInput: 'input[type="password"]',
  nextButton: '#identifierNext',
  passwordNext: '#passwordNext',
  inboxLink: 'a[href*="inbox"]',
  spamLink: 'a[href*="spam"]',
  emailRow: 'tr.zA',
  emailSubject: '.bog',
  emailBody: '.a3s',
  replyButton: '[data-tooltip="Reply"]',
  composeBox: '.Am.Al.editable',
  sendButton: '[data-tooltip="Send"]',
  starButton: '.T-KT',
  archiveButton: '[data-tooltip="Archive"]',
  notSpamButton: '[data-tooltip="Not spam"]',
  moveToInbox: '[data-tooltip="Move to inbox"]'
};

// Outlook selectors
const OUTLOOK_SELECTORS = {
  emailInput: 'input[type="email"]',
  passwordInput: 'input[type="password"]',
  submitButton: 'input[type="submit"]',
  inboxLink: '[title="Inbox"]',
  junkLink: '[title="Junk Email"]',
  emailRow: '[role="option"]',
  emailSubject: '[role="heading"]',
  emailBody: '[role="document"]',
  replyButton: '[aria-label="Reply"]',
  composeBox: '[role="textbox"]',
  sendButton: '[aria-label="Send"]',
  notJunkButton: '[aria-label="Not junk"]'
};

/**
 * Humanize delay - random delay within range
 */
function humanDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Simulate human-like mouse movement
 */
async function humanMouseMove(page: Page, element: ElementHandle): Promise<void> {
  const box = await element.boundingBox();
  if (!box) return;

  // Random point within element
  const x = box.x + Math.random() * box.width;
  const y = box.y + Math.random() * box.height;

  // Move in steps
  const currentPosition = await page.evaluate(() => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2
  }));

  const steps = Math.floor(Math.random() * 5) + 3;
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    const currentX = currentPosition.x + (x - currentPosition.x) * progress;
    const currentY = currentPosition.y + (y - currentPosition.y) * progress;
    await page.mouse.move(currentX, currentY);
    await humanDelay(10, 30);
  }
}

/**
 * Simulate human-like typing
 */
async function humanType(page: Page, text: string): Promise<void> {
  for (const char of text) {
    await page.keyboard.type(char);
    // Variable delay between keystrokes
    await humanDelay(50, 150);
  }
}

/**
 * Simulate reading behavior with scrolling
 */
async function simulateReading(page: Page, duration: number = 5000): Promise<void> {
  const scrollSteps = Math.floor(duration / 1000);

  for (let i = 0; i < scrollSteps; i++) {
    // Scroll down
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(Math.random() * 100) + 50);
    });

    // Random pause between scrolls
    await humanDelay(800, 1500);
  }

  // Scroll back up sometimes
  if (Math.random() > 0.5) {
    await page.evaluate(() => {
      window.scrollBy(0, -Math.floor(Math.random() * 200));
    });
  }
}

/**
 * Engagement Engine Class
 */
export class EngagementEngine {
  private browser: Browser | null = null;
  private config: EngagementConfig;

  constructor(config: Partial<EngagementConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize browser
   */
  async initialize(): Promise<void> {
    if (this.browser) return;

    this.browser = await puppeteer.launch({
      headless: this.config.headless ? 'new' : false,
      slowMo: this.config.slowMo,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1366,768',
        '--disable-blink-features=AutomationControlled'
      ]
    });
  }

  /**
   * Create a new page with stealth settings
   */
  private async createPage(): Promise<Page> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();

    // Set viewport
    await page.setViewport(this.config.viewport!);

    // Set user agent
    await page.setUserAgent(this.config.userAgent!);

    // Remove webdriver detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });

      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
    });

    // Set default timeout
    page.setDefaultTimeout(this.config.timeout!);

    return page;
  }

  /**
   * Login to Gmail
   */
  async loginGmail(email: string, password: string): Promise<Page> {
    const page = await this.createPage();

    try {
      await page.goto('https://mail.google.com/', { waitUntil: 'networkidle2' });

      // Enter email
      await page.waitForSelector(GMAIL_SELECTORS.emailInput);
      await humanDelay(500, 1000);

      const emailInput = await page.$(GMAIL_SELECTORS.emailInput);
      if (emailInput && this.config.humanizeActions) {
        await humanMouseMove(page, emailInput);
      }

      await page.type(GMAIL_SELECTORS.emailInput, email);
      await humanDelay(300, 600);

      // Click next
      await page.click(GMAIL_SELECTORS.nextButton);
      await humanDelay(2000, 3000);

      // Enter password
      await page.waitForSelector(GMAIL_SELECTORS.passwordInput);
      await humanDelay(500, 1000);
      await page.type(GMAIL_SELECTORS.passwordInput, password);
      await humanDelay(300, 600);

      // Click sign in
      await page.click(GMAIL_SELECTORS.passwordNext);

      // Wait for inbox to load
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
      await humanDelay(2000, 3000);

      return page;
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Login to Outlook
   */
  async loginOutlook(email: string, password: string): Promise<Page> {
    const page = await this.createPage();

    try {
      await page.goto('https://outlook.live.com/', { waitUntil: 'networkidle2' });

      // Click sign in
      await page.click('a[data-task="signin"]');
      await humanDelay(1000, 2000);

      // Enter email
      await page.waitForSelector(OUTLOOK_SELECTORS.emailInput);
      await page.type(OUTLOOK_SELECTORS.emailInput, email);
      await page.click(OUTLOOK_SELECTORS.submitButton);
      await humanDelay(1500, 2500);

      // Enter password
      await page.waitForSelector(OUTLOOK_SELECTORS.passwordInput);
      await page.type(OUTLOOK_SELECTORS.passwordInput, password);
      await page.click(OUTLOOK_SELECTORS.submitButton);

      // Wait for inbox
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
      await humanDelay(2000, 3000);

      return page;
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Open an email in Gmail
   */
  async openEmailGmail(
    page: Page,
    criteria: EmailSearchCriteria
  ): Promise<EngagementResult> {
    const startTime = Date.now();

    try {
      // Navigate to correct folder
      if (criteria.folder === 'spam') {
        const spamLink = await page.$(GMAIL_SELECTORS.spamLink);
        if (spamLink) {
          await spamLink.click();
          await humanDelay(1500, 2500);
        }
      }

      // Find email matching criteria
      const emailRows = await page.$$(GMAIL_SELECTORS.emailRow);

      for (const row of emailRows) {
        const subjectElement = await row.$(GMAIL_SELECTORS.emailSubject);
        if (!subjectElement) continue;

        const subject = await subjectElement.evaluate(el => el.textContent);

        // Check if matches criteria
        if (criteria.subject && !subject?.includes(criteria.subject)) {
          continue;
        }

        // Human-like mouse movement to email
        if (this.config.humanizeActions) {
          await humanMouseMove(page, row);
        }

        // Click to open
        await row.click();
        await humanDelay(1000, 2000);

        // Simulate reading
        await simulateReading(page, 3000 + Math.random() * 5000);

        return {
          success: true,
          action: 'open',
          duration: Date.now() - startTime
        };
      }

      return {
        success: false,
        action: 'open',
        duration: Date.now() - startTime,
        error: 'No matching email found'
      };
    } catch (error) {
      return {
        success: false,
        action: 'open',
        duration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  /**
   * Reply to current email in Gmail
   */
  async replyEmailGmail(
    page: Page,
    replyBody: string
  ): Promise<EngagementResult> {
    const startTime = Date.now();

    try {
      // Click reply button
      const replyButton = await page.$(GMAIL_SELECTORS.replyButton);
      if (!replyButton) {
        return {
          success: false,
          action: 'reply',
          duration: Date.now() - startTime,
          error: 'Reply button not found'
        };
      }

      if (this.config.humanizeActions) {
        await humanMouseMove(page, replyButton);
      }
      await replyButton.click();
      await humanDelay(1000, 2000);

      // Wait for compose box
      await page.waitForSelector(GMAIL_SELECTORS.composeBox);
      await humanDelay(500, 1000);

      // Type reply with human-like typing
      const composeBox = await page.$(GMAIL_SELECTORS.composeBox);
      if (composeBox) {
        await composeBox.click();
        await humanDelay(300, 500);

        if (this.config.humanizeActions) {
          await humanType(page, replyBody);
        } else {
          await page.type(GMAIL_SELECTORS.composeBox, replyBody);
        }
      }

      await humanDelay(500, 1000);

      // Click send
      const sendButton = await page.$(GMAIL_SELECTORS.sendButton);
      if (sendButton) {
        if (this.config.humanizeActions) {
          await humanMouseMove(page, sendButton);
        }
        await sendButton.click();
        await humanDelay(1000, 2000);
      }

      return {
        success: true,
        action: 'reply',
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        action: 'reply',
        duration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  /**
   * Move email from spam to inbox (spam rescue)
   */
  async rescueFromSpamGmail(
    page: Page,
    criteria: EmailSearchCriteria
  ): Promise<EngagementResult> {
    const startTime = Date.now();

    try {
      // Go to spam folder
      const spamLink = await page.$('a[href*="spam"]');
      if (spamLink) {
        await spamLink.click();
        await humanDelay(1500, 2500);
      }

      // Find and open email
      const openResult = await this.openEmailGmail(page, {
        ...criteria,
        folder: 'spam'
      });

      if (!openResult.success) {
        return {
          success: false,
          action: 'mark_not_spam',
          duration: Date.now() - startTime,
          error: 'Could not find email in spam'
        };
      }

      // Click "Not spam" button
      const notSpamButton = await page.$(GMAIL_SELECTORS.notSpamButton);
      if (notSpamButton) {
        if (this.config.humanizeActions) {
          await humanMouseMove(page, notSpamButton);
        }
        await notSpamButton.click();
        await humanDelay(1000, 2000);
      }

      return {
        success: true,
        action: 'mark_not_spam',
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        action: 'mark_not_spam',
        duration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  /**
   * Star/flag an email in Gmail
   */
  async starEmailGmail(page: Page): Promise<EngagementResult> {
    const startTime = Date.now();

    try {
      const starButton = await page.$(GMAIL_SELECTORS.starButton);
      if (starButton) {
        if (this.config.humanizeActions) {
          await humanMouseMove(page, starButton);
        }
        await starButton.click();
        await humanDelay(500, 1000);
      }

      return {
        success: true,
        action: 'star',
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        action: 'star',
        duration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  /**
   * Archive an email in Gmail
   */
  async archiveEmailGmail(page: Page): Promise<EngagementResult> {
    const startTime = Date.now();

    try {
      const archiveButton = await page.$(GMAIL_SELECTORS.archiveButton);
      if (archiveButton) {
        if (this.config.humanizeActions) {
          await humanMouseMove(page, archiveButton);
        }
        await archiveButton.click();
        await humanDelay(500, 1000);
      }

      return {
        success: true,
        action: 'archive',
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        action: 'archive',
        duration: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  /**
   * Execute a full engagement sequence
   */
  async executeEngagementSequence(
    provider: EmailProvider,
    credentials: { email: string; password: string },
    actions: Array<{
      action: EngagementAction;
      criteria?: EmailSearchCriteria;
      replyBody?: string;
    }>
  ): Promise<EngagementResult[]> {
    const results: EngagementResult[] = [];

    let page: Page | null = null;

    try {
      // Login based on provider
      if (provider === 'gmail') {
        page = await this.loginGmail(credentials.email, credentials.password);
      } else if (provider === 'outlook') {
        page = await this.loginOutlook(credentials.email, credentials.password);
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      // Execute each action
      for (const actionConfig of actions) {
        await humanDelay(1000, 2000); // Delay between actions

        let result: EngagementResult;

        switch (actionConfig.action) {
          case 'open':
          case 'read':
            result = await this.openEmailGmail(page!, actionConfig.criteria || {});
            break;

          case 'reply':
            if (!actionConfig.replyBody) {
              result = {
                success: false,
                action: 'reply',
                duration: 0,
                error: 'Reply body required'
              };
            } else {
              result = await this.replyEmailGmail(page!, actionConfig.replyBody);
            }
            break;

          case 'mark_not_spam':
          case 'move_to_inbox':
            result = await this.rescueFromSpamGmail(page!, actionConfig.criteria || {});
            break;

          case 'star':
            result = await this.starEmailGmail(page!);
            break;

          case 'archive':
            result = await this.archiveEmailGmail(page!);
            break;

          default:
            result = {
              success: false,
              action: actionConfig.action,
              duration: 0,
              error: `Action not implemented: ${actionConfig.action}`
            };
        }

        results.push(result);

        // Stop if an action fails
        if (!result.success && actionConfig.action !== 'star') {
          break;
        }
      }
    } catch (error) {
      results.push({
        success: false,
        action: 'open',
        duration: 0,
        error: (error as Error).message
      });
    } finally {
      if (page) {
        await page.close();
      }
    }

    return results;
  }

  /**
   * Execute spam rescue for an account
   */
  async executeSpamRescue(
    accountId: string,
    maxEmails: number = 5
  ): Promise<{ rescued: number; failed: number }> {
    const supabase = await createClient();

    // Get account credentials
    const { data: account, error } = await supabase
      .from('email_accounts')
      .select('email, encrypted_credentials, smtp_host')
      .eq('id', accountId)
      .single();

    if (error || !account) {
      throw new Error('Account not found');
    }

    // Determine provider
    const provider = this.detectProvider(account.email);
    if (!provider) {
      throw new Error('Unsupported email provider for automation');
    }

    // Decrypt credentials
    const credentials = JSON.parse(decrypt(account.encrypted_credentials));

    let page: Page | null = null;
    let rescued = 0;
    let failed = 0;

    try {
      // Login
      if (provider === 'gmail') {
        page = await this.loginGmail(account.email, credentials.pass);
      } else if (provider === 'outlook') {
        page = await this.loginOutlook(account.email, credentials.pass);
      }

      // Get emails that need rescue (from warmup_emails table)
      const { data: spamEmails } = await supabase
        .from('warmup_emails')
        .select('id, subject, from_email')
        .eq('user_account_id', accountId)
        .eq('is_spam', true)
        .eq('rescued', false)
        .order('sent_at', { ascending: false })
        .limit(maxEmails);

      if (!spamEmails || spamEmails.length === 0) {
        return { rescued: 0, failed: 0 };
      }

      // Rescue each email
      for (const email of spamEmails) {
        const result = await this.rescueFromSpamGmail(page!, {
          subject: email.subject,
          from: email.from_email
        });

        if (result.success) {
          rescued++;

          // Update database
          await supabase
            .from('warmup_emails')
            .update({
              rescued: true,
              rescued_at: new Date().toISOString(),
              is_spam: false
            })
            .eq('id', email.id);

          // Record rescued stat
          await supabase.rpc('increment_warmup_rescued', { row_id: accountId });
        } else {
          failed++;
        }

        await humanDelay(2000, 4000);
      }
    } finally {
      if (page) {
        await page.close();
      }
    }

    return { rescued, failed };
  }

  /**
   * Detect email provider from address
   */
  private detectProvider(email: string): EmailProvider | null {
    const domain = email.split('@')[1]?.toLowerCase() || '';

    if (domain.includes('gmail') || domain.includes('googlemail')) {
      return 'gmail';
    }
    if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live.')) {
      return 'outlook';
    }
    if (domain.includes('yahoo') || domain.includes('ymail')) {
      return 'yahoo';
    }

    return null;
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Factory function
export function createEngagementEngine(config?: Partial<EngagementConfig>): EngagementEngine {
  return new EngagementEngine(config);
}

// Singleton instance
let engineInstance: EngagementEngine | null = null;

export function getEngagementEngine(): EngagementEngine {
  if (!engineInstance) {
    engineInstance = new EngagementEngine();
  }
  return engineInstance;
}

/**
 * Execute engagement task (used by queue)
 */
export async function executeEngagementTask(
  task: {
    accountId: string;
    actions: Array<{
      action: EngagementAction;
      criteria?: EmailSearchCriteria;
      replyBody?: string;
    }>;
  }
): Promise<EngagementResult[]> {
  const engine = getEngagementEngine();
  const supabase = await createClient();

  // Get account
  const { data: account, error } = await supabase
    .from('email_accounts')
    .select('email, encrypted_credentials')
    .eq('id', task.accountId)
    .single();

  if (error || !account) {
    return [{
      success: false,
      action: 'open',
      duration: 0,
      error: 'Account not found'
    }];
  }

  const provider = engine['detectProvider'](account.email);
  if (!provider) {
    return [{
      success: false,
      action: 'open',
      duration: 0,
      error: 'Unsupported provider'
    }];
  }

  const credentials = JSON.parse(decrypt(account.encrypted_credentials));

  return engine.executeEngagementSequence(
    provider,
    { email: account.email, password: credentials.pass },
    task.actions
  );
}

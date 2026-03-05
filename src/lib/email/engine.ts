/**
 * TrafficFlow Enterprise - Production Email Engine
 * Supports: SendGrid, Mailgun, Resend, AWS SES, SMTP
 * Features: Queue system, templates, rate limiting, retry logic
 */

export interface EmailConfig {
  provider: 'sendgrid' | 'mailgun' | 'resend' | 'ses' | 'smtp';
  apiKey?: string;
  domain?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  fromEmail: string;
  fromName: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  templateData?: Record<string, string | number>;
  attachments?: EmailAttachment[];
  tags?: string[];
  metadata?: Record<string, string>;
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlTemplate: string;
  textTemplate?: string;
}

// Email Queue for batch processing
interface QueuedEmail {
  id: string;
  message: EmailMessage;
  attempts: number;
  maxAttempts: number;
  scheduledAt: Date;
  createdAt: Date;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  lastError?: string;
}

// Default templates
const DEFAULT_TEMPLATES: Record<string, EmailTemplate> = {
  welcome: {
    id: 'welcome',
    name: 'Welcome Email',
    subject: 'Welcome to TrafficFlow Enterprise!',
    htmlTemplate: `
      <!DOCTYPE html>
      <html>
        <head><title>Welcome</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4F46E5;">Welcome to TrafficFlow Enterprise!</h1>
          <p>Hi {{name}},</p>
          <p>Thank you for joining TrafficFlow Enterprise. Your account is now active.</p>
          <p>Start managing your SEO traffic today!</p>
          <a href="{{loginUrl}}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Get Started</a>
          <p style="margin-top: 30px; color: #666;">The TrafficFlow Team</p>
        </body>
      </html>
    `,
  },
  verification: {
    id: 'verification',
    name: 'Email Verification',
    subject: 'Verify Your Email Address',
    htmlTemplate: `
      <!DOCTYPE html>
      <html>
        <head><title>Verify Email</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4F46E5;">Verify Your Email</h1>
          <p>Hi {{name}},</p>
          <p>Please verify your email address by clicking the button below:</p>
          <a href="{{verificationUrl}}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Verify Email</a>
          <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
          <p style="margin-top: 30px; color: #666;">The TrafficFlow Team</p>
        </body>
      </html>
    `,
  },
  password_reset: {
    id: 'password_reset',
    name: 'Password Reset',
    subject: 'Reset Your Password',
    htmlTemplate: `
      <!DOCTYPE html>
      <html>
        <head><title>Reset Password</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4F46E5;">Password Reset Request</h1>
          <p>Hi {{name}},</p>
          <p>You requested to reset your password. Click the button below:</p>
          <a href="{{resetUrl}}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reset Password</a>
          <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
          <p style="margin-top: 30px; color: #666;">The TrafficFlow Team</p>
        </body>
      </html>
    `,
  },
  notification: {
    id: 'notification',
    name: 'General Notification',
    subject: '{{subject}}',
    htmlTemplate: `
      <!DOCTYPE html>
      <html>
        <head><title>Notification</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4F46E5;">{{title}}</h1>
          <p>{{message}}</p>
          {{#if actionUrl}}
          <a href="{{actionUrl}}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; display: inline-block;">{{actionText}}</a>
          {{/if}}
          <p style="margin-top: 30px; color: #666;">The TrafficFlow Team</p>
        </body>
      </html>
    `,
  },
  admin_alert: {
    id: 'admin_alert',
    name: 'Admin Alert',
    subject: '🚨 Admin Alert: {{alertType}}',
    htmlTemplate: `
      <!DOCTYPE html>
      <html>
        <head><title>Admin Alert</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #FEF2F2; border-left: 4px solid #EF4444; padding: 16px; margin-bottom: 20px;">
            <h1 style="color: #EF4444; margin: 0;">🚨 Admin Alert</h1>
          </div>
          <p><strong>Alert Type:</strong> {{alertType}}</p>
          <p><strong>Message:</strong> {{message}}</p>
          <p><strong>Time:</strong> {{timestamp}}</p>
          {{#if details}}
          <pre style="background: #F3F4F6; padding: 12px; border-radius: 6px; overflow-x: auto;">{{details}}</pre>
          {{/if}}
          <p style="margin-top: 30px; color: #666;">TrafficFlow Enterprise System</p>
        </body>
      </html>
    `,
  },
  report: {
    id: 'report',
    name: 'SEO Report',
    subject: 'Your SEO Report - {{reportDate}}',
    htmlTemplate: `
      <!DOCTYPE html>
      <html>
        <head><title>SEO Report</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4F46E5;">📊 SEO Report</h1>
          <p>Hi {{name}},</p>
          <p>Here's your SEO report for {{reportDate}}:</p>
          <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Key Metrics</h3>
            <p><strong>Organic Traffic:</strong> {{organicTraffic}}</p>
            <p><strong>Keywords Ranked:</strong> {{keywordsRanked}}</p>
            <p><strong>Average Position:</strong> {{avgPosition}}</p>
          </div>
          <a href="{{reportUrl}}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Full Report</a>
          <p style="margin-top: 30px; color: #666;">The TrafficFlow Team</p>
        </body>
      </html>
    `,
  },
};

class EmailEngine {
  private config: EmailConfig;
  private templates: Map<string, EmailTemplate>;
  private queue: QueuedEmail[] = [];
  private rateLimit = {
    maxPerMinute: 100,
    sent: 0,
    resetAt: Date.now() + 60000,
  };

  constructor(config: EmailConfig) {
    this.config = config;
    this.templates = new Map(Object.entries(DEFAULT_TEMPLATES));
  }

  /**
   * Send an email
   */
  async send(message: EmailMessage): Promise<EmailResult> {
    // Rate limiting check
    if (!this.checkRateLimit()) {
      return {
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
      };
    }

    try {
      // Handle template rendering
      let processedMessage = { ...message };
      if (message.templateId) {
        processedMessage = await this.renderTemplate(message);
      }

      // Send via configured provider
      switch (this.config.provider) {
        case 'sendgrid':
          return await this.sendViaSendGrid(processedMessage);
        case 'mailgun':
          return await this.sendViaMailgun(processedMessage);
        case 'resend':
          return await this.sendViaResend(processedMessage);
        case 'ses':
          return await this.sendViaSES(processedMessage);
        case 'smtp':
          return await this.sendViaSMTP(processedMessage);
        default:
          return { success: false, error: 'Unknown email provider' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Add email to queue for batch processing
   */
  queueEmail(message: EmailMessage, scheduledAt?: Date): string {
    const id = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queuedEmail: QueuedEmail = {
      id,
      message,
      attempts: 0,
      maxAttempts: 3,
      scheduledAt: scheduledAt || new Date(),
      createdAt: new Date(),
      status: 'pending',
    };
    this.queue.push(queuedEmail);
    return id;
  }

  /**
   * Process the email queue
   */
  async processQueue(): Promise<{ sent: number; failed: number }> {
    const results = { sent: 0, failed: 0 };
    const now = new Date();

    for (const email of this.queue) {
      if (email.status !== 'pending') continue;
      if (email.scheduledAt > now) continue;

      email.status = 'processing';
      const result = await this.send(email.message);

      if (result.success) {
        email.status = 'sent';
        results.sent++;
      } else {
        email.attempts++;
        email.lastError = result.error;
        if (email.attempts >= email.maxAttempts) {
          email.status = 'failed';
          results.failed++;
        } else {
          email.status = 'pending';
          // Exponential backoff
          email.scheduledAt = new Date(
            Date.now() + Math.pow(2, email.attempts) * 60000
          );
        }
      }
    }

    // Clean up sent emails
    this.queue = this.queue.filter((e) => e.status !== 'sent');

    return results;
  }

  /**
   * Register a custom template
   */
  registerTemplate(template: EmailTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get available templates
   */
  getTemplates(): EmailTemplate[] {
    return Array.from(this.templates.values());
  }

  // Private methods

  private checkRateLimit(): boolean {
    const now = Date.now();
    if (now > this.rateLimit.resetAt) {
      this.rateLimit.sent = 0;
      this.rateLimit.resetAt = now + 60000;
    }
    if (this.rateLimit.sent >= this.rateLimit.maxPerMinute) {
      return false;
    }
    this.rateLimit.sent++;
    return true;
  }

  private async renderTemplate(message: EmailMessage): Promise<EmailMessage> {
    const template = this.templates.get(message.templateId!);
    if (!template) {
      throw new Error(`Template not found: ${message.templateId}`);
    }

    let html = template.htmlTemplate;
    let text = template.textTemplate || '';
    let subject = template.subject;

    const data = message.templateData || {};

    // Simple template variable replacement
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, String(value));
      text = text.replace(regex, String(value));
      subject = subject.replace(regex, String(value));
    }

    return {
      ...message,
      subject,
      html: message.html || html,
      text: message.text || text,
    };
  }

  private async sendViaSendGrid(message: EmailMessage): Promise<EmailResult> {
    // SendGrid API implementation
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: Array.isArray(message.to)
              ? message.to.map((e) => ({ email: e }))
              : [{ email: message.to }],
            subject: message.subject,
          },
        ],
        from: {
          email: this.config.fromEmail,
          name: this.config.fromName,
        },
        content: [
          ...(message.text
            ? [{ type: 'text/plain', value: message.text }]
            : []),
          ...(message.html
            ? [{ type: 'text/html', value: message.html }]
            : []),
        ],
      }),
    });

    if (response.ok) {
      return {
        success: true,
        messageId: response.headers.get('X-Message-Id') || undefined,
      };
    }

    const error = await response.text();
    return { success: false, error };
  }

  private async sendViaMailgun(message: EmailMessage): Promise<EmailResult> {
    // Mailgun API implementation
    const domain = this.config.domain;
    const response = await fetch(
      `https://api.mailgun.net/v3/${domain}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`api:${this.config.apiKey}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          from: `${this.config.fromName} <${this.config.fromEmail}>`,
          to: Array.isArray(message.to) ? message.to.join(',') : message.to,
          subject: message.subject,
          text: message.text || '',
          html: message.html || '',
        }).toString(),
      }
    );

    const result = await response.json();
    if (response.ok) {
      return { success: true, messageId: result.id };
    }
    return { success: false, error: result.message || 'Mailgun error' };
  }

  private async sendViaResend(message: EmailMessage): Promise<EmailResult> {
    // Resend API implementation
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${this.config.fromName} <${this.config.fromEmail}>`,
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    const result = await response.json();
    if (response.ok) {
      return { success: true, messageId: result.id };
    }
    return { success: false, error: result.message || 'Resend error' };
  }

  private async sendViaSES(message: EmailMessage): Promise<EmailResult> {
    // AWS SES implementation (requires AWS SDK)
    // This is a simplified version - in production, use AWS SDK
    return {
      success: false,
      error: 'AWS SES requires AWS SDK. Please implement using @aws-sdk/client-ses',
    };
  }

  private async sendViaSMTP(message: EmailMessage): Promise<EmailResult> {
    // SMTP implementation requires nodemailer or similar
    return {
      success: false,
      error: 'SMTP requires nodemailer. Please install and configure nodemailer.',
    };
  }
}

// Export singleton factory
let emailEngineInstance: EmailEngine | null = null;

export function createEmailEngine(config: EmailConfig): EmailEngine {
  emailEngineInstance = new EmailEngine(config);
  return emailEngineInstance;
}

export function getEmailEngine(): EmailEngine | null {
  return emailEngineInstance;
}

// Helper functions for common email tasks
export async function sendVerificationEmail(
  email: string,
  name: string,
  verificationUrl: string
): Promise<EmailResult> {
  const engine = getEmailEngine();
  if (!engine) {
    return { success: false, error: 'Email engine not initialized' };
  }

  return engine.send({
    to: email,
    templateId: 'verification',
    templateData: { name, verificationUrl },
  });
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  resetUrl: string
): Promise<EmailResult> {
  const engine = getEmailEngine();
  if (!engine) {
    return { success: false, error: 'Email engine not initialized' };
  }

  return engine.send({
    to: email,
    templateId: 'password_reset',
    templateData: { name, resetUrl },
  });
}

export async function sendNotificationEmail(
  email: string,
  name: string,
  title: string,
  message: string,
  actionUrl?: string,
  actionText?: string
): Promise<EmailResult> {
  const engine = getEmailEngine();
  if (!engine) {
    return { success: false, error: 'Email engine not initialized' };
  }

  return engine.send({
    to: email,
    templateId: 'notification',
    templateData: { name, title, message, actionUrl, actionText: actionText || 'View Details' },
  });
}

export async function sendAdminAlert(
  alertType: string,
  message: string,
  details?: string
): Promise<EmailResult> {
  const engine = getEmailEngine();
  if (!engine) {
    return { success: false, error: 'Email engine not initialized' };
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@trafficflow.com';
  const timestamp = new Date().toISOString();

  return engine.send({
    to: adminEmail,
    templateId: 'admin_alert',
    templateData: { alertType, message, details: details || '', timestamp },
  });
}

export async function sendReportEmail(
  email: string,
  name: string,
  reportDate: string,
  reportUrl: string,
  metrics: {
    organicTraffic: string;
    keywordsRanked: string;
    avgPosition: string;
  }
): Promise<EmailResult> {
  const engine = getEmailEngine();
  if (!engine) {
    return { success: false, error: 'Email engine not initialized' };
  }

  return engine.send({
    to: email,
    templateId: 'report',
    templateData: {
      name,
      reportDate,
      reportUrl,
      ...metrics,
    },
  });
}

export default EmailEngine;

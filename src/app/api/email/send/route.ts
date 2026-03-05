import { NextResponse, NextRequest } from "next/server";
import nodemailer from 'nodemailer';

// Email sending configuration interface
interface EmailConfig {
  provider: 'custom' | 'gmail' | 'outlook' | 'sendgrid' | 'brevo';
  smtp?: {
    host: string;
    port: number;
    username: string;
    password: string;
    encryption: 'ssl' | 'tls' | 'none';
  };
  sendgridApiKey?: string;
  brevoApiKey?: string;
  fromEmail: string;
  fromName?: string;
}

interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  config: EmailConfig;
  cc?: string[];
  bcc?: string[];
  attachments?: { filename: string; content: string; contentType: string }[];
}

// Email logging storage (in-memory for this implementation)
const emailLogs: {
  id: string;
  timestamp: string;
  to: string;
  subject: string;
  status: 'sent' | 'failed' | 'queued';
  provider: string;
  error?: string;
}[] = [];

// Generate a unique email ID
function generateEmailId(): string {
  return `eml_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Check if SendGrid API key is valid (starts with SG.)
function isValidSendGridKey(key: string | undefined): boolean {
  return !!(key && key.length > 10 && key.startsWith('SG.'));
}

// Check if Brevo API key is valid
function isValidBrevoKey(key: string | undefined): boolean {
  return !!(key && key.length > 10 && !key.includes('demo'));
}

// Send via SendGrid API
async function sendViaSendGrid(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { sendgridApiKey, fromEmail, fromName } = payload.config;
  
  if (!sendgridApiKey) {
    return { success: false, error: 'SendGrid API key not configured' };
  }
  
  // Check if it's a real API key (starts with SG.)
  if (!isValidSendGridKey(sendgridApiKey)) {
    return { 
      success: false, 
      error: 'Invalid SendGrid API key. Key must start with "SG." for production use.'
    };
  }
  
  try {
    // Real SendGrid API call
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: payload.to }],
          ...(payload.cc ? { cc: payload.cc.map(c => ({ email: c })) } : {}),
          ...(payload.bcc ? { bcc: payload.bcc.map(b => ({ email: b })) } : {}),
        }],
        from: {
          email: fromEmail,
          name: fromName || 'TrafficFlow'
        },
        subject: payload.subject,
        content: [{
          type: 'text/html',
          value: payload.body.replace(/\n/g, '<br>')
        }, {
          type: 'text/plain',
          value: payload.body
        }]
      })
    });
    
    if (response.ok) {
      const messageId = response.headers.get('X-Message-Id') || `sg_${generateEmailId()}`;
      return { success: true, messageId };
    } else {
      const errorText = await response.text();
      return { success: false, error: `SendGrid error: ${response.status} - ${errorText}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Send via Brevo (formerly Sendinblue) API
async function sendViaBrevo(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { brevoApiKey, fromEmail, fromName } = payload.config;
  
  if (!brevoApiKey) {
    return { success: false, error: 'Brevo API key not configured' };
  }
  
  // Check if it's a real API key
  if (!isValidBrevoKey(brevoApiKey)) {
    return { 
      success: false, 
      error: 'Invalid Brevo API key.'
    };
  }
  
  try {
    // Real Brevo API call
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: fromEmail,
          name: fromName || 'TrafficFlow'
        },
        to: [{ email: payload.to }],
        ...(payload.cc ? { cc: payload.cc.map(c => ({ email: c })) } : {}),
        ...(payload.bcc ? { bcc: payload.bcc.map(b => ({ email: b })) } : {}),
        subject: payload.subject,
        htmlContent: payload.body.replace(/\n/g, '<br>'),
        textContent: payload.body
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      return { success: true, messageId: result.messageId || `brevo_${generateEmailId()}` };
    } else {
      const errorData = await response.json();
      return { success: false, error: `Brevo error: ${errorData.message || response.status}` };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Send via SMTP using nodemailer (REAL implementation)
async function sendViaSMTP(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { smtp, fromEmail, fromName } = payload.config;
  
  if (!smtp?.host || !smtp?.username || !smtp?.password) {
    return { success: false, error: 'SMTP configuration incomplete. Host, username, and password are required.' };
  }
  
  try {
    // Determine the correct secure setting based on port and encryption
    // Port 465 = SSL (secure: true)
    // Port 587 = TLS/STARTTLS (secure: false, requireTLS: true)
    // Port 25 = No encryption or STARTTLS
    const isSSL = smtp.encryption === 'ssl' || smtp.port === 465;
    const isTLS = smtp.encryption === 'tls' || smtp.port === 587 || smtp.port === 25;
    
    const transportConfig: nodemailer.TransportOptions = {
      host: smtp.host,
      port: smtp.port,
      // secure: true for 465, false for other ports
      secure: isSSL,
      auth: {
        user: smtp.username,
        pass: smtp.password
      },
      // TLS/STARTTLS configuration
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates
        minVersion: 'TLSv1', // Support older TLS versions
      },
      // For STARTTLS (port 587)
      requireTLS: isTLS && !isSSL,
      // Connection timeout
      connectionTimeout: 15000,
      socketTimeout: 15000,
      // Debug mode
      logger: false
    } as nodemailer.TransportOptions;
    
    console.log('SMTP Config:', {
      host: smtp.host,
      port: smtp.port,
      secure: isSSL,
      requireTLS: isTLS && !isSSL,
      encryption: smtp.encryption
    });
    
    // Create transporter
    const transporter = nodemailer.createTransport(transportConfig);
    
    // Verify connection before sending
    try {
      await transporter.verify();
      console.log('SMTP connection verified successfully');
    } catch (verifyError: any) {
      console.error('SMTP verification failed:', verifyError);
      return { 
        success: false, 
        error: `SMTP connection failed: ${verifyError.message}. Check your SMTP settings.` 
      };
    }
    
    // Prepare email options
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${fromName || 'TrafficFlow'}" <${fromEmail}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.body,
      html: payload.body.replace(/\n/g, '<br>'),
      ...(payload.cc ? { cc: payload.cc } : {}),
      ...(payload.bcc ? { bcc: payload.bcc } : {}),
    };
    
    // Send the email
    const info = await transporter.sendMail(mailOptions);
    
    console.log('Email sent successfully:', info.messageId);
    
    return { 
      success: true, 
      messageId: info.messageId || generateEmailId()
    };
    
  } catch (error: any) {
    console.error('SMTP send error:', error);
    
    // Provide user-friendly error messages
    let errorMessage = error.message;
    
    if (error.code === 'ECONNECTION') {
      errorMessage = 'Could not connect to SMTP server. Check host and port.';
    } else if (error.code === 'EAUTH') {
      errorMessage = 'Authentication failed. Check your username and password.';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Connection timed out. Check if the SMTP server is accessible.';
    } else if (error.code === 'ESOCKET') {
      errorMessage = 'Socket error. Try changing encryption settings (SSL/TLS/None).';
    } else if (errorMessage.includes('wrong version number')) {
      errorMessage = 'SSL/TLS mismatch. Try: Port 465 with SSL, or Port 587 with TLS.';
    }
    
    return { success: false, error: errorMessage };
  }
}

// Send via Gmail SMTP (using nodemailer)
async function sendViaGmail(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { smtp, fromEmail, fromName } = payload.config;
  
  // Gmail requires app-specific password
  if (!smtp?.username || !smtp?.password) {
    return { 
      success: false, 
      error: 'Gmail requires your email and an app-specific password. Enable 2FA and generate an app password at https://myaccount.google.com/apppasswords' 
    };
  }
  
  // Use Gmail's SMTP server
  const gmailConfig = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: smtp.username,
      pass: smtp.password
    },
    tls: {
      rejectUnauthorized: false
    }
  };
  
  try {
    const transporter = nodemailer.createTransport(gmailConfig);
    
    // Verify connection
    await transporter.verify();
    
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${fromName || 'TrafficFlow'}" <${fromEmail}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.body,
      html: payload.body.replace(/\n/g, '<br>')
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    return { 
      success: true, 
      messageId: info.messageId 
    };
    
  } catch (error: any) {
    let errorMessage = error.message;
    
    if (error.code === 'EAUTH') {
      errorMessage = 'Gmail authentication failed. You need an app-specific password, not your regular password. Generate one at https://myaccount.google.com/apppasswords';
    }
    
    return { success: false, error: errorMessage };
  }
}

// Send via Outlook SMTP (using nodemailer)
async function sendViaOutlook(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { smtp, fromEmail, fromName } = payload.config;
  
  if (!smtp?.username || !smtp?.password) {
    return { 
      success: false, 
      error: 'Outlook requires your email and password (or app password if 2FA is enabled).' 
    };
  }
  
  // Use Outlook's SMTP server
  const outlookConfig = {
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
      user: smtp.username,
      pass: smtp.password
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false
    }
  };
  
  try {
    const transporter = nodemailer.createTransport(outlookConfig);
    
    await transporter.verify();
    
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${fromName || 'TrafficFlow'}" <${fromEmail}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.body,
      html: payload.body.replace(/\n/g, '<br>')
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    return { 
      success: true, 
      messageId: info.messageId 
    };
    
  } catch (error: any) {
    let errorMessage = error.message;
    
    if (error.code === 'EAUTH') {
      errorMessage = 'Outlook authentication failed. If you have 2FA enabled, use an app password.';
    }
    
    return { success: false, error: errorMessage };
  }
}

// Main email sending function
async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string; provider: string; demoMode?: boolean }> {
  const provider = payload.config.provider;
  let result;
  let demoMode = false;
  
  switch (provider) {
    case 'gmail':
      result = await sendViaGmail(payload);
      break;
    case 'outlook':
      result = await sendViaOutlook(payload);
      break;
    case 'sendgrid':
      result = await sendViaSendGrid(payload);
      demoMode = !isValidSendGridKey(payload.config.sendgridApiKey);
      break;
    case 'brevo':
      result = await sendViaBrevo(payload);
      demoMode = !isValidBrevoKey(payload.config.brevoApiKey);
      break;
    case 'custom':
    default:
      result = await sendViaSMTP(payload);
      break;
  }
  
  // Log the email
  emailLogs.unshift({
    id: generateEmailId(),
    timestamp: new Date().toISOString(),
    to: payload.to,
    subject: payload.subject,
    status: result.success ? 'sent' : 'failed',
    provider: provider,
    error: result.error
  });
  
  // Keep only last 100 logs
  if (emailLogs.length > 100) {
    emailLogs.pop();
  }
  
  return { ...result, provider, demoMode };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, to, subject, body: emailBody, config, cc, bcc, attachments } = body;
    
    // Handle different actions
    if (action === 'logs') {
      return NextResponse.json({
        success: true,
        logs: emailLogs.slice(0, 50)
      });
    }
    
    if (action === 'test') {
      // Test email configuration by trying to connect
      if (!config) {
        return NextResponse.json({
          success: false,
          error: 'Email configuration required for testing'
        }, { status: 400 });
      }
      
      // For SMTP-based providers, verify the connection
      if (['custom', 'gmail', 'outlook'].includes(config.provider)) {
        const { smtp } = config;
        
        if (!smtp?.host || !smtp?.username || !smtp?.password) {
          return NextResponse.json({
            success: false,
            error: 'SMTP configuration incomplete',
            provider: config.provider,
            missing: [
              !smtp?.host ? 'SMTP Host' : null,
              !smtp?.username ? 'Username' : null,
              !smtp?.password ? 'Password' : null
            ].filter(Boolean)
          });
        }
        
        // Determine host for Gmail/Outlook
        let testHost = smtp.host;
        let testPort = smtp.port;
        let testSecure = false;
        let testRequireTLS = false;
        
        if (config.provider === 'gmail') {
          testHost = 'smtp.gmail.com';
          testPort = 587;
          testSecure = false;
          testRequireTLS = true;
        } else if (config.provider === 'outlook') {
          testHost = 'smtp.office365.com';
          testPort = 587;
          testSecure = false;
          testRequireTLS = true;
        } else {
          // Custom SMTP - determine based on port/encryption
          testSecure = smtp.encryption === 'ssl' || smtp.port === 465;
          testRequireTLS = (smtp.encryption === 'tls' || smtp.port === 587) && !testSecure;
        }
        
        try {
          const transporter = nodemailer.createTransport({
            host: testHost,
            port: testPort,
            secure: testSecure,
            requireTLS: testRequireTLS,
            auth: {
              user: smtp.username,
              pass: smtp.password
            },
            tls: {
              rejectUnauthorized: false,
              minVersion: 'TLSv1'
            },
            connectionTimeout: 15000
          });
          
          await transporter.verify();
          
          return NextResponse.json({
            success: true,
            message: 'SMTP connection successful! Email configuration is valid.',
            provider: config.provider,
            host: testHost,
            port: testPort
          });
          
        } catch (testError: any) {
          let errorMsg = testError.message;
          let hint = '';
          
          // Provide specific guidance for common errors
          if (errorMsg.includes('wrong version number') || errorMsg.includes('SSL')) {
            errorMsg = 'SSL/TLS configuration mismatch';
            hint = 'Port 465 requires SSL. Port 587 requires TLS. Check your encryption setting matches your port.';
          } else if (testError.code === 'EAUTH' || errorMsg.includes('Invalid login')) {
            errorMsg = 'Authentication failed';
            hint = config.provider === 'gmail' 
              ? 'Use an app-specific password from myaccount.google.com/apppasswords'
              : 'Check your username and password';
          } else if (testError.code === 'ECONNECTION' || errorMsg.includes('connect ECONNREFUSED')) {
            errorMsg = 'Could not connect to server';
            hint = 'Check that the SMTP host and port are correct and the server is accessible.';
          } else if (testError.code === 'ETIMEDOUT') {
            errorMsg = 'Connection timed out';
            hint = 'The SMTP server is not responding. Check host and port.';
          }
          
          return NextResponse.json({
            success: false,
            error: `Connection failed: ${errorMsg}`,
            provider: config.provider,
            hint: hint || (config.provider === 'gmail' 
              ? 'Make sure you\'re using an app-specific password, not your regular Gmail password.'
              : config.provider === 'outlook'
              ? 'If 2FA is enabled, use an app password.'
              : 'Check your SMTP credentials and server settings.')
          });
        }
      }
      
      // For API-based providers
      const providerStatus: Record<string, boolean> = {
        sendgrid: isValidSendGridKey(config.sendgridApiKey),
        brevo: isValidBrevoKey(config.brevoApiKey),
      };
      
      if (config.provider === 'sendgrid' || config.provider === 'brevo') {
        if (!providerStatus[config.provider]) {
          return NextResponse.json({
            success: false,
            error: `Invalid ${config.provider} API key`,
            provider: config.provider,
            hint: config.provider === 'sendgrid' 
              ? 'SendGrid API key must start with "SG."'
              : 'Get your API key from brevo.com'
          });
        }
        
        return NextResponse.json({
          success: true,
          message: `${config.provider} API key is valid.`,
          provider: config.provider
        });
      }
      
      return NextResponse.json({
        success: false,
        error: 'Unknown provider'
      });
    }
    
    // Send email action
    if (!to || !subject || !emailBody) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: to, subject, body'
      }, { status: 400 });
    }
    
    // Validate email addresses
    if (!isValidEmail(to)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid recipient email address'
      }, { status: 400 });
    }
    
    if (!config || !config.fromEmail) {
      return NextResponse.json({
        success: false,
        error: 'Email configuration is missing or incomplete'
      }, { status: 400 });
    }
    
    // Send the email
    const result = await sendEmail({
      to,
      subject,
      body: emailBody,
      config,
      cc,
      bcc,
      attachments
    });
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        provider: result.provider,
        timestamp: new Date().toISOString(),
        message: `Email sent successfully to ${to}`,
        demoMode: result.demoMode
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to send email',
        provider: result.provider
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Email API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error.message
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  
  if (action === 'logs') {
    return NextResponse.json({
      success: true,
      logs: emailLogs.slice(0, 50),
      total: emailLogs.length
    });
  }
  
  if (action === 'providers') {
    return NextResponse.json({
      success: true,
      providers: {
        sendgrid: {
          name: 'SendGrid',
          configured: false,
          requires: ['sendgridApiKey'],
          note: 'API key must start with "SG." for production use',
          realEmails: true
        },
        brevo: {
          name: 'Brevo (Sendinblue)',
          configured: false,
          requires: ['brevoApiKey'],
          note: 'Get API key from brevo.com',
          realEmails: true
        },
        gmail: {
          name: 'Gmail',
          configured: false,
          requires: ['smtp.username (email)', 'smtp.password (app password)'],
          note: 'Use app-specific password from myaccount.google.com/apppasswords',
          realEmails: true
        },
        outlook: {
          name: 'Outlook',
          configured: false,
          requires: ['smtp.username (email)', 'smtp.password'],
          note: 'Use app password if 2FA is enabled',
          realEmails: true
        },
        custom: {
          name: 'Custom SMTP',
          configured: false,
          requires: ['smtp.host', 'smtp.port', 'smtp.username', 'smtp.password'],
          note: 'Any SMTP server (SendGrid SMTP, Mailgun, Amazon SES, etc.)',
          realEmails: true
        }
      }
    });
  }
  
  return NextResponse.json({
    message: "TrafficFlow Email Engine API - Active",
    version: "3.0",
    features: {
      providers: ['gmail', 'outlook', 'sendgrid', 'brevo', 'custom'],
      capabilities: ['send', 'test', 'logs'],
      realProviders: ['all providers now send real emails']
    },
    endpoints: {
      'POST /api/email/send': 'Send an email',
      'POST /api/email/send?action=test': 'Test email configuration',
      'GET /api/email/send?action=logs': 'Get email logs',
      'GET /api/email/send?action=providers': 'Get provider status'
    },
    setup: {
      sendgrid: 'Get API key from sendgrid.com (starts with SG.)',
      brevo: 'Get API key from brevo.com',
      gmail: 'Enable 2FA, then generate app password at myaccount.google.com/apppasswords',
      outlook: 'Use email and password (app password if 2FA enabled)',
      custom: 'Configure your SMTP server settings'
    }
  });
}

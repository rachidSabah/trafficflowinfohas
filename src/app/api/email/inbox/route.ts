import { NextResponse, NextRequest } from "next/server";

/**
 * Email Inbox API
 * 
 * Handles email operations like fetching, deleting, moving, etc.
 * Supports both IMAP and POP3 for receiving emails.
 */

// Email interface
interface Email {
  id: string;
  from: string;
  fromEmail: string;
  to?: string;
  toEmail?: string;
  subject: string;
  body: string;
  date: string;
  read: boolean;
  starred: boolean;
  folder?: string;
  attachments?: { filename: string; size: number }[];
}

// IMAP configuration interface
interface IMAPEmailConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: 'ssl' | 'tls' | 'none';
}

// POP3 configuration interface
interface POP3EmailConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: 'ssl' | 'tls' | 'none';
}

// In-memory email storage (persists per server instance)
let emailStore: {
  inbox: Email[];
  sent: Email[];
  drafts: Email[];
  spam: Email[];
  trash: Email[];
} = {
  inbox: [],
  sent: [],
  drafts: [],
  spam: [],
  trash: []
};

// Generate unique email ID
function generateEmailId(): string {
  return `email_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Parse email address from header
function parseEmailAddress(header: string): { name: string; email: string } {
  if (!header) return { name: '', email: '' };
  
  const match = header.match(/(?:"?([^"]*)"?\s)?<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i);
  if (match) {
    return {
      name: match[1]?.trim() || match[2],
      email: match[2]
    };
  }
  
  const emailMatch = header.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (emailMatch) {
    return { name: emailMatch[1], email: emailMatch[1] };
  }
  
  return { name: header, email: header };
}

// Decode MIME encoded words
function decodeMimeWord(str: string): string {
  if (!str) return '';
  
  return str.replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/gi, (_, base64) => {
    try {
      return Buffer.from(base64, 'base64').toString('utf-8');
    } catch {
      return base64;
    }
  }).replace(/=\?UTF-8\?Q\?([^?]+)\?=/gi, (_, quoted) => {
    try {
      return quoted.replace(/=([0-9A-F]{2})/gi, (_, hex) => 
        String.fromCharCode(parseInt(hex, 16))
      );
    } catch {
      return quoted;
    }
  }).replace(/=\?ISO-8859-1\?Q\?([^?]+)\?=/gi, (_, quoted) => {
    try {
      return quoted.replace(/=([0-9A-F]{2})/gi, (_, hex) => 
        String.fromCharCode(parseInt(hex, 16))
      );
    } catch {
      return quoted;
    }
  });
}

// Decode quoted-printable text
function decodeQuotedPrintable(str: string): string {
  if (!str) return '';
  
  // Remove soft line breaks
  let decoded = str.replace(/=\r\n/g, '');
  
  // Decode quoted-printable characters
  decoded = decoded.replace(/=([0-9A-F]{2})/gi, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  
  return decoded;
}

// Decode base64 text
function decodeBase64(str: string, charset: string = 'utf-8'): string {
  if (!str) return '';
  
  try {
    // Remove whitespace
    const cleanStr = str.replace(/\s/g, '');
    const buffer = Buffer.from(cleanStr, 'base64');
    
    if (charset.toLowerCase() === 'utf-8' || charset.toLowerCase() === 'utf8') {
      return buffer.toString('utf-8');
    } else if (charset.toLowerCase() === 'iso-8859-1' || charset.toLowerCase() === 'latin1') {
      return buffer.toString('latin1');
    }
    
    return buffer.toString('utf-8');
  } catch (e) {
    return str;
  }
}

// Parse MIME email body and extract clean text content
function parseMIMEBody(rawBody: string): string {
  if (!rawBody) return '';
  
  let textContent = '';
  let htmlContent = '';
  
  // Check if this is a multipart message
  const boundaryMatch = rawBody.match(/Content-Type:\s*multipart\/[^;]+;\s*boundary="?([^"\r\n]+)"?/i);
  
  if (boundaryMatch) {
    const boundary = boundaryMatch[1].trim();
    console.log('Found multipart boundary:', boundary);
    
    // Split by boundary
    const parts = rawBody.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    
    for (const part of parts) {
      if (part.trim() === '--' || part.trim() === '') continue;
      
      // Extract content type and encoding for each part
      const contentTypeMatch = part.match(/Content-Type:\s*([^;\r\n]+)/i);
      const charsetMatch = part.match(/Content-Type:[^;]*;\s*charset=["']?([^"'\r\n]+)["']?/i);
      const encodingMatch = part.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
      
      const contentType = contentTypeMatch ? contentTypeMatch[1].trim().toLowerCase() : '';
      const charset = charsetMatch ? charsetMatch[1].trim() : 'utf-8';
      const encoding = encodingMatch ? encodingMatch[1].trim().toLowerCase() : '7bit';
      
      // Find the body of this part (after double newline)
      const bodyStart = part.indexOf('\r\n\r\n');
      const partBody = bodyStart > 0 ? part.substring(bodyStart + 4) : part;
      
      let decodedPart = partBody;
      
      // Decode based on transfer encoding
      if (encoding === 'base64') {
        decodedPart = decodeBase64(partBody, charset);
      } else if (encoding === 'quoted-printable') {
        decodedPart = decodeQuotedPrintable(partBody);
      }
      
      // Store text/plain content (preferred)
      if (contentType.includes('text/plain') && !textContent) {
        textContent = decodedPart;
      } else if (contentType.includes('text/html') && !htmlContent) {
        htmlContent = decodedPart;
      }
    }
  } else {
    // Single part message
    const contentTypeMatch = rawBody.match(/Content-Type:\s*([^;\r\n]+)/i);
    const charsetMatch = rawBody.match(/Content-Type:[^;]*;\s*charset=["']?([^"'\r\n]+)["']?/i);
    const encodingMatch = rawBody.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
    
    const contentType = contentTypeMatch ? contentTypeMatch[1].trim().toLowerCase() : 'text/plain';
    const charset = charsetMatch ? charsetMatch[1].trim() : 'utf-8';
    const encoding = encodingMatch ? encodingMatch[1].trim().toLowerCase() : '7bit';
    
    // Find body start
    const bodyStart = rawBody.indexOf('\r\n\r\n');
    let body = bodyStart > 0 ? rawBody.substring(bodyStart + 4) : rawBody;
    
    // Decode based on transfer encoding
    if (encoding === 'base64') {
      body = decodeBase64(body, charset);
    } else if (encoding === 'quoted-printable') {
      body = decodeQuotedPrintable(body);
    }
    
    if (contentType.includes('text/html')) {
      htmlContent = body;
    } else {
      textContent = body;
    }
  }
  
  // Prefer plain text, fallback to stripped HTML
  if (textContent) {
    return textContent.trim();
  } else if (htmlContent) {
    // Strip HTML tags and decode entities
    return htmlContent
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Fallback: try to extract any readable text
  return rawBody
    .replace(/Content-Type:[^\r\n]+\r\n/gi, '')
    .replace(/Content-Transfer-Encoding:[^\r\n]+\r\n/gi, '')
    .replace(/Content-Disposition:[^\r\n]+\r\n/gi, '')
    .replace(/--[a-f0-9\-]+/gi, '')
    .replace(/\r\n\r\n/g, '\n')
    .trim();
}

// Fetch emails via IMAP
async function fetchIMAPEmails(config: IMAPEmailConfig, folder: string = 'INBOX'): Promise<{ success: boolean; emails?: Email[]; error?: string; debug?: string }> {
  let debugLog: string[] = [];
  
  try {
    debugLog.push(`Starting IMAP connection to ${config.host}:${config.port} (Encryption: ${config.encryption})`);
    
    const Imap = await import('imap').then(m => m.default || m);
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        debugLog.push('Connection timeout after 25 seconds');
        resolve({ 
          success: false, 
          error: 'Connection timeout - IMAP server did not respond within 25 seconds. Check host, port, and encryption setting.',
          debug: debugLog.join('\n')
        });
      }, 25000);
      
      const imapConfig: any = {
        user: config.username,
        password: config.password,
        host: config.host,
        port: config.port,
        connTimeout: 20000,
        authTimeout: 20000
      };
      
      // Configure TLS/SSL based on encryption setting
      // SSL = Implicit TLS on connect (port 993)
      // TLS = StartTLS (port 143)
      // None = No encryption
      if (config.encryption === 'ssl') {
        imapConfig.tls = true;
        imapConfig.tlsOptions = { 
          rejectUnauthorized: false,
          servername: config.host
        };
      } else if (config.encryption === 'tls') {
        // StartTLS - start plain then upgrade
        imapConfig.tls = true;
        imapConfig.tlsOptions = { 
          rejectUnauthorized: false,
          servername: config.host
        };
      } else {
        // None - no encryption
        imapConfig.tls = false;
      }
      
      debugLog.push(`IMAP config: host=${config.host}, port=${config.port}, encryption=${config.encryption}`);
      
      const imap = new Imap(imapConfig);
      const emails: Email[] = [];
      let resolved = false;
      
      const cleanup = () => {
        clearTimeout(timeout);
        try { imap.destroy(); } catch (e) { debugLog.push(`Destroy error: ${e}`); }
      };
      
      imap.once('ready', () => {
        debugLog.push('IMAP connection ready, opening inbox...');
        
        imap.openBox(folder, true, (err: Error | null, box: any) => {
          if (err) {
            debugLog.push(`Failed to open folder: ${err.message}`);
            cleanup();
            if (!resolved) {
              resolved = true;
              resolve({ success: false, error: `Failed to open folder: ${err.message}`, debug: debugLog.join('\n') });
            }
            return;
          }
          
          debugLog.push(`Opened ${folder}, messages: ${box.messages.total}`);
          
          if (box.messages.total === 0) {
            debugLog.push('No messages in folder');
            cleanup();
            if (!resolved) {
              resolved = true;
              resolve({ success: true, emails: [], debug: debugLog.join('\n') });
            }
            return;
          }
          
          // Fetch last 20 emails
          const start = Math.max(1, box.messages.total - 19);
          debugLog.push(`Fetching messages ${start} to ${box.messages.total}`);
          
          const fetch = imap.seq.fetch(`${start}:${box.messages.total}`, {
            bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)', 'TEXT'],
            struct: true,
            markSeen: false
          });
          
          fetch.on('message', (msg: any, seqno: number) => {
            let email: Partial<Email> = { 
              id: generateEmailId(), 
              read: true, 
              starred: false, 
              body: '',
              subject: '(No Subject)',
              from: 'Unknown',
              fromEmail: '',
              date: new Date().toISOString()
            };
            let headers: any = {};
            let bodyBuffer = '';
            
            msg.on('body', (stream: any, info: any) => {
              let buffer = '';
              
              stream.on('data', (chunk: Buffer) => {
                buffer += chunk.toString('utf-8');
              });
              
              stream.once('end', () => {
                if (info.which === 'HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)') {
                  const lines = buffer.split('\r\n');
                  let currentHeader = '';
                  let currentValue = '';
                  
                  lines.forEach(line => {
                    const headerMatch = line.match(/^([A-Z-]+):\s*(.*)$/i);
                    if (headerMatch) {
                      if (currentHeader) {
                        headers[currentHeader.toLowerCase()] = currentValue.trim();
                      }
                      currentHeader = headerMatch[1];
                      currentValue = headerMatch[2];
                    } else if (line.startsWith(' ') || line.startsWith('\t')) {
                      currentValue += ' ' + line.trim();
                    }
                  });
                  
                  if (currentHeader) {
                    headers[currentHeader.toLowerCase()] = currentValue.trim();
                  }
                } else if (info.which === 'TEXT') {
                  bodyBuffer = buffer;
                }
              });
            });
            
            msg.once('end', () => {
              if (headers.from) {
                const parsed = parseEmailAddress(headers.from);
                email.from = decodeMimeWord(parsed.name) || parsed.email;
                email.fromEmail = parsed.email;
              }
              
              if (headers.to) {
                email.toEmail = headers.to;
              }
              
              if (headers.subject) {
                email.subject = decodeMimeWord(headers.subject) || '(No Subject)';
              }
              
              if (headers.date) {
                try {
                  email.date = new Date(headers.date).toISOString();
                } catch {
                  email.date = headers.date;
                }
              }
              
              if (headers['message-id']) {
                email.id = headers['message-id'].replace(/[<>]/g, '');
              }
              
              // Parse MIME body properly
              email.body = parseMIMEBody(bodyBuffer).substring(0, 5000) || '(No content)';
              
              if (email.subject || email.fromEmail) {
                emails.push(email as Email);
              }
            });
          });
          
          fetch.once('error', (err: Error) => {
            debugLog.push(`Fetch error: ${err.message}`);
            cleanup();
            if (!resolved) {
              resolved = true;
              resolve({ success: false, error: `Fetch error: ${err.message}`, debug: debugLog.join('\n') });
            }
          });
          
          fetch.once('end', () => {
            debugLog.push(`Fetch complete, got ${emails.length} emails`);
            imap.end();
          });
        });
      });
      
      imap.once('error', (err: Error) => {
        debugLog.push(`IMAP error: ${err.message}`);
        cleanup();
        if (!resolved) {
          resolved = true;
          
          let errorMsg = err.message;
          if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('ECONNREFUSED')) {
            errorMsg = `Cannot connect to ${config.host}:${config.port}. Check server address, port, and firewall.`;
          } else if (errorMsg.includes('Invalid credentials') || errorMsg.includes('Authentication failed') || errorMsg.includes('Logon failure')) {
            errorMsg = 'Authentication failed. Check username and password.';
          } else if (errorMsg.includes('SSL') || errorMsg.includes('TLS') || errorMsg.includes('certificate')) {
            errorMsg = `SSL/TLS error. Try toggling SSL setting. Port 993 typically uses SSL, port 143 typically uses StartTLS or no SSL.`;
          }
          
          resolve({ success: false, error: errorMsg, debug: debugLog.join('\n') });
        }
      });
      
      imap.once('end', () => {
        debugLog.push('IMAP connection ended');
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          resolve({ success: true, emails, debug: debugLog.join('\n') });
        }
      });
      
      imap.connect();
    });
  } catch (error: any) {
    return { success: false, error: error.message, debug: debugLog.join('\n') };
  }
}

// Fetch emails via POP3 - Complete rewrite for reliability
// Supports: SSL (implicit TLS on any port), TLS (StartTLS via STLS command), None (plain text)
async function fetchPOP3Emails(config: POP3EmailConfig): Promise<{ success: boolean; emails?: Email[]; error?: string; debug?: string }> {
  const debugLog: string[] = [`Starting POP3 fetch to ${config.host}:${config.port} (Encryption: ${config.encryption})`];
  
  return new Promise(async (resolve) => {
    const net = await import('net');
    const tls = await import('tls');
    
    let socket: any = null;
    let resolved = false;
    let emails: Email[] = [];
    let dataBuffer = '';
    let currentStep = 'greeting';
    let emailList: { num: number; size: number }[] = [];
    let currentEmailData = '';
    let currentEmailIndex = 0;
    let startTLSUpgradePending = false;
    
    const cleanup = () => {
      if (socket) {
        try {
          socket.destroy();
        } catch (e) {}
      }
    };
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({
          success: false,
          error: `Connection timeout after 25 seconds. Check if ${config.host}:${config.port} is correct and accessible.`,
          debug: debugLog.join('\n')
        });
      }
    }, 25000);
    
    const sendCmd = (cmd: string) => {
      debugLog.push(`>>> ${cmd}`);
      if (socket && !socket.destroyed) {
        socket.write(cmd + '\r\n');
      }
    };
    
    const upgradeToTLS = () => {
      debugLog.push('Upgrading to TLS (StartTLS)');
      
      // Remove old listeners
      socket.removeAllListeners('data');
      socket.removeAllListeners('error');
      socket.removeAllListeners('close');
      
      // Upgrade to TLS
      const tlsSocket = tls.connect({
        socket: socket,
        rejectUnauthorized: false,
        servername: config.host
      }, () => {
        debugLog.push('TLS upgrade successful');
        socket = tlsSocket;
        
        // Re-attach listeners
        tlsSocket.on('data', (data: Buffer) => {
          if (!resolved) {
            processResponse(data.toString());
          }
        });
        
        tlsSocket.on('error', (err: Error) => handleError(err));
        
        tlsSocket.on('close', () => {
          debugLog.push('TLS socket closed');
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve({ success: true, emails, debug: debugLog.join('\n') });
          }
        });
        
        // Continue with authentication
        currentStep = 'user';
        sendCmd(`USER ${config.username}`);
      });
      
      tlsSocket.on('error', (err: Error) => {
        debugLog.push(`TLS upgrade failed: ${err.message}`);
        handleError(err);
      });
      
      socket = tlsSocket;
    };
    
    const processResponse = (response: string) => {
      debugLog.push(`<<< ${response.substring(0, 300)}${response.length > 300 ? '...' : ''}`);
      
      dataBuffer += response;
      
      // Process complete lines
      while (dataBuffer.includes('\r\n')) {
        const lineEnd = dataBuffer.indexOf('\r\n');
        const line = dataBuffer.substring(0, lineEnd);
        dataBuffer = dataBuffer.substring(lineEnd + 2);
        
        processLine(line);
        
        if (resolved) return;
      }
    };
    
    const processLine = (line: string) => {
      if (currentStep === 'greeting') {
        if (line.startsWith('+OK')) {
          debugLog.push('Server greeting received');
          
          // For StartTLS mode, send STLS command first
          if (config.encryption === 'tls') {
            debugLog.push('StartTLS mode: sending STLS command');
            currentStep = 'stls';
            sendCmd('STLS');
          } else {
            currentStep = 'user';
            sendCmd(`USER ${config.username}`);
          }
        } else {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          resolve({ success: false, error: `Server greeting failed: ${line}`, debug: debugLog.join('\n') });
        }
      } else if (currentStep === 'stls') {
        // Response to STLS command
        if (line.startsWith('+OK')) {
          debugLog.push('STLS accepted, upgrading connection');
          startTLSUpgradePending = true;
          upgradeToTLS();
        } else {
          // Server doesn't support STLS, try plain auth
          debugLog.push(`STLS not supported: ${line}, continuing without TLS`);
          currentStep = 'user';
          sendCmd(`USER ${config.username}`);
        }
      } else if (currentStep === 'user') {
        if (line.startsWith('+OK')) {
          debugLog.push('USER accepted');
          currentStep = 'pass';
          sendCmd(`PASS ${config.password}`);
        } else {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          resolve({ success: false, error: `Username rejected: ${line}`, debug: debugLog.join('\n') });
        }
      } else if (currentStep === 'pass') {
        if (line.startsWith('+OK')) {
          debugLog.push('Authentication successful');
          currentStep = 'list';
          sendCmd('LIST');
        } else {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          resolve({ success: false, error: `Authentication failed: ${line}. Check username and password.`, debug: debugLog.join('\n') });
        }
      } else if (currentStep === 'list') {
        if (line === '.') {
          // End of list
          debugLog.push(`Found ${emailList.length} emails`);
          
          if (emailList.length === 0) {
            resolved = true;
            clearTimeout(timeout);
            sendCmd('QUIT');
            setTimeout(() => {
              cleanup();
              resolve({ success: true, emails: [], debug: debugLog.join('\n') });
            }, 100);
            return;
          }
          
          // Fetch emails (last 10)
          const toFetch = emailList.slice(-10);
          currentStep = 'retr';
          currentEmailIndex = 0;
          currentEmailData = '';
          debugLog.push(`Fetching email ${toFetch[0].num}`);
          sendCmd(`RETR ${toFetch[0].num}`);
        } else if (line.startsWith('-ERR')) {
          resolved = true;
          clearTimeout(timeout);
          cleanup();
          resolve({ success: false, error: `LIST failed: ${line}`, debug: debugLog.join('\n') });
        } else {
          const match = line.match(/^(\d+)\s+(\d+)$/);
          if (match) {
            emailList.push({ num: parseInt(match[1]), size: parseInt(match[2]) });
          }
        }
      } else if (currentStep === 'retr') {
        if (line === '.') {
          // End of email
          const email = parseEmailFromRaw(currentEmailData);
          if (email) {
            emails.push(email);
            debugLog.push(`Parsed email: ${email.subject}`);
          }
          
          const toFetch = emailList.slice(-10);
          currentEmailIndex++;
          
          if (currentEmailIndex < toFetch.length) {
            currentEmailData = '';
            debugLog.push(`Fetching email ${toFetch[currentEmailIndex].num}`);
            sendCmd(`RETR ${toFetch[currentEmailIndex].num}`);
          } else {
            // All done
            debugLog.push('All emails fetched, quitting');
            sendCmd('QUIT');
            setTimeout(() => {
              resolved = true;
              clearTimeout(timeout);
              cleanup();
              resolve({ success: true, emails, debug: debugLog.join('\n') });
            }, 500);
          }
        } else {
          // Email data line (remove leading dot if escaped)
          currentEmailData += (line.startsWith('..') ? line.substring(1) : line) + '\r\n';
        }
      }
    };
    
    const parseEmailFromRaw = (raw: string): Email | null => {
      try {
        const headerEnd = raw.indexOf('\r\n\r\n');
        const headers = headerEnd > 0 ? raw.substring(0, headerEnd) : raw;
        const rawBody = headerEnd > 0 ? raw.substring(headerEnd + 4) : '';
        
        const getHeader = (name: string): string => {
          const regex = new RegExp(`^${name}:\\s*(.+)$`, 'im');
          const match = headers.match(regex);
          return match ? match[1].trim() : '';
        };
        
        const from = getHeader('From');
        const parsed = parseEmailAddress(from);
        
        // Parse MIME body properly
        const parsedBody = parseMIMEBody(rawBody);
        
        return {
          id: generateEmailId(),
          from: decodeMimeWord(parsed.name) || parsed.email || 'Unknown',
          fromEmail: parsed.email || '',
          subject: decodeMimeWord(getHeader('Subject')) || '(No Subject)',
          date: getHeader('Date') || new Date().toISOString(),
          body: parsedBody.substring(0, 5000) || '(No content)',
          read: true,
          starred: false
        };
      } catch (e) {
        return null;
      }
    };
    
    const handleError = (err: Error) => {
      debugLog.push(`Socket error: ${err.message}`);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        cleanup();
        
        let errorMsg = err.message;
        if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('ECONNREFUSED')) {
          errorMsg = `Cannot connect to ${config.host}:${config.port}. Check server address and port.`;
        } else if (errorMsg.includes('EPROTO') || errorMsg.includes('wrong version number')) {
          errorMsg = `SSL/TLS mismatch. Try changing encryption setting. SSL = implicit TLS, TLS = StartTLS, None = plain text.`;
        }
        
        resolve({ success: false, error: errorMsg, debug: debugLog.join('\n') });
      }
    };
    
    const handleConnect = () => {
      debugLog.push(`Connected to ${config.host}:${config.port}`);
    };
    
    // Create socket based on encryption setting
    // SSL = Implicit TLS on connect (secure from the start, works on any port)
    // TLS = StartTLS (connect plain, then upgrade via STLS command)
    // None = Plain text connection (no encryption)
    if (config.encryption === 'ssl') {
      debugLog.push('Creating TLS socket (Implicit SSL - secure from start)');
      socket = tls.connect({
        host: config.host,
        port: config.port,
        rejectUnauthorized: false,
        servername: config.host
      }, handleConnect);
    } else {
      // TLS (StartTLS) or None - start with plain TCP
      // For StartTLS, we'll upgrade after STLS command
      debugLog.push(`Creating plain TCP socket (${config.encryption}${config.encryption === 'tls' ? ' - will upgrade via STLS' : ''})`);
      socket = net.connect({
        host: config.host,
        port: config.port
      }, handleConnect);
    }
    
    socket.on('data', (data: Buffer) => {
      if (!resolved) {
        processResponse(data.toString());
      }
    });
    
    socket.on('error', handleError);
    
    socket.on('close', () => {
      debugLog.push('Socket closed');
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ success: true, emails, debug: debugLog.join('\n') });
      }
    });
    
    socket.on('timeout', () => {
      debugLog.push('Socket timeout event');
      handleError(new Error('Socket timeout'));
    });
    
    // Set socket timeout
    socket.setTimeout(20000);
  });
}

// Test IMAP connection
async function testIMAPConnection(config: IMAPEmailConfig): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const Imap = await import('imap').then(m => m.default || m);
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ 
          success: false, 
          error: 'Connection timeout - IMAP server did not respond within 15 seconds' 
        });
      }, 15000);
      
      const imapConfig: any = {
        user: config.username,
        password: config.password,
        host: config.host,
        port: config.port,
        connTimeout: 12000,
        authTimeout: 12000
      };
      
      // Configure TLS/SSL based on encryption setting
      if (config.encryption === 'ssl' || config.encryption === 'tls') {
        imapConfig.tls = true;
        imapConfig.tlsOptions = { rejectUnauthorized: false };
      }
      
      const imap = new Imap(imapConfig);
      let resolved = false;
      
      imap.once('ready', () => {
        clearTimeout(timeout);
        imap.end();
        if (!resolved) {
          resolved = true;
          resolve({ 
            success: true, 
            message: `✅ Connected to IMAP server ${config.host}:${config.port}` 
          });
        }
      });
      
      imap.once('error', (err: Error) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          
          let errorMsg = err.message;
          if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('ECONNREFUSED')) {
            errorMsg = `Cannot connect to ${config.host}:${config.port}. Check address and port.`;
          } else if (errorMsg.includes('Invalid credentials') || errorMsg.includes('Authentication failed')) {
            errorMsg = 'Authentication failed. Check username and password.';
          } else if (errorMsg.includes('SSL') || errorMsg.includes('TLS')) {
            errorMsg = `SSL/TLS error. Try changing encryption setting.`;
          }
          
          resolve({ success: false, error: errorMsg });
        }
      });
      
      imap.once('end', () => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          resolve({ success: true, message: 'Connection test successful' });
        }
      });
      
      imap.connect();
    });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Test POP3 connection
// Supports: SSL (implicit TLS on any port), TLS (StartTLS via STLS command), None (plain text)
async function testPOP3Connection(config: POP3EmailConfig): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const net = await import('net');
    const tls = await import('tls');
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ 
          success: false, 
          error: 'Connection timeout - POP3 server did not respond within 15 seconds. Check host, port, and encryption setting.' 
        });
      }, 15000);
      
      let socket: any;
      let resolved = false;
      let currentStep = 'greeting';
      
      const upgradeToTLS = () => {
        socket.removeAllListeners('data');
        socket.removeAllListeners('error');
        
        const tlsSocket = tls.connect({
          socket: socket,
          rejectUnauthorized: false,
          servername: config.host
        }, () => {
          socket = tlsSocket;
          currentStep = 'user';
          socket.write(`USER ${config.username}\r\n`);
          
          tlsSocket.on('data', (data: Buffer) => {
            handleData(data.toString());
          });
          tlsSocket.on('error', (err: Error) => handleError(err));
        });
        
        socket = tlsSocket;
      };
      
      const handleData = (response: string) => {
        const lines = response.split('\r\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          
          if (line.startsWith('+OK')) {
            if (currentStep === 'greeting') {
              if (config.encryption === 'tls') {
                // Send STLS for StartTLS
                currentStep = 'stls';
                socket.write('STLS\r\n');
              } else {
                currentStep = 'user';
                socket.write(`USER ${config.username}\r\n`);
              }
            } else if (currentStep === 'stls') {
              // STLS accepted, upgrade to TLS
              upgradeToTLS();
            } else if (currentStep === 'user') {
              currentStep = 'pass';
              socket.write(`PASS ${config.password}\r\n`);
            } else if (currentStep === 'pass') {
              // Success!
              socket.write('QUIT\r\n');
              clearTimeout(timeout);
              if (!resolved) {
                resolved = true;
                resolve({ 
                  success: true, 
                  message: `✅ Connected to POP3 server ${config.host}:${config.port}` 
                });
              }
            }
          } else if (line.startsWith('-ERR')) {
            if (currentStep === 'stls') {
              // STLS not supported, continue plain
              currentStep = 'user';
              socket.write(`USER ${config.username}\r\n`);
            } else {
              clearTimeout(timeout);
              if (!resolved) {
                resolved = true;
                resolve({ success: false, error: `Server error: ${line}` });
              }
            }
          }
        }
      };
      
      const handleError = (err: Error) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          let errorMsg = err.message;
          if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('ECONNREFUSED')) {
            errorMsg = `Cannot connect to ${config.host}:${config.port}. Check server address and port.`;
          } else if (errorMsg.includes('EPROTO') || errorMsg.includes('wrong version number')) {
            errorMsg = `SSL/TLS mismatch. Try changing encryption setting. SSL = implicit TLS, TLS = StartTLS, None = plain text.`;
          }
          resolve({ success: false, error: errorMsg });
        }
      };
      
      // Create socket based on encryption setting
      // SSL = Implicit TLS on connect (secure from the start, works on any port)
      // TLS = StartTLS (connect plain, then upgrade via STLS command)
      // None = Plain text connection (no encryption)
      if (config.encryption === 'ssl') {
        socket = tls.connect({
          host: config.host,
          port: config.port,
          rejectUnauthorized: false,
          servername: config.host
        });
      } else {
        // TLS (StartTLS) or None - start with plain TCP
        socket = net.connect({
          host: config.host,
          port: config.port
        });
      }
      
      socket.on('data', (data: Buffer) => handleData(data.toString()));
      socket.on('error', (err: Error) => handleError(err));
      
      socket.setTimeout(12000);
    });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config, emailId, folder, email, targetFolder, protocol } = body;
    
    switch (action) {
      case 'test_imap':
        if (!config?.imap?.host?.trim()) {
          return NextResponse.json({ success: false, error: 'IMAP host is required' });
        }
        if (!config?.imap?.username?.trim()) {
          return NextResponse.json({ success: false, error: 'IMAP username is required' });
        }
        if (!config?.imap?.password) {
          return NextResponse.json({ success: false, error: 'IMAP password is required' });
        }
        
        const imapTestResult = await testIMAPConnection({
          host: config.imap.host.trim(),
          port: parseInt(config.imap.port) || 993,
          username: config.imap.username.trim(),
          password: config.imap.password,
          encryption: config.imap.encryption || 'ssl'
        });
        
        return NextResponse.json(imapTestResult);
        
      case 'test_pop':
        if (!config?.pop?.host?.trim()) {
          return NextResponse.json({ success: false, error: 'POP3 host is required' });
        }
        if (!config?.pop?.username?.trim()) {
          return NextResponse.json({ success: false, error: 'POP3 username is required' });
        }
        if (!config?.pop?.password) {
          return NextResponse.json({ success: false, error: 'POP3 password is required' });
        }
        
        const popTestResult = await testPOP3Connection({
          host: config.pop.host.trim(),
          port: parseInt(config.pop.port) || 110,
          username: config.pop.username.trim(),
          password: config.pop.password,
          encryption: config.pop.encryption || 'none'
        });
        
        return NextResponse.json(popTestResult);
        
      case 'fetch':
        // Check for configured incoming mail server
        const imapHost = config?.imap?.host?.trim() || '';
        const popHost = config?.pop?.host?.trim() || '';
        
        console.log('Fetch request:', { protocol, imapHost, popHost });
        
        // Use IMAP if configured, otherwise use POP3
        if (imapHost && (protocol === 'imap' || !protocol)) {
          if (!config.imap.username?.trim() || !config.imap.password) {
            return NextResponse.json({
              success: false,
              error: 'IMAP username and password required',
              emails: []
            });
          }
          
          const result = await fetchIMAPEmails({
            host: imapHost,
            port: parseInt(config.imap.port) || 993,
            username: config.imap.username.trim(),
            password: config.imap.password,
            encryption: config.imap.encryption || 'ssl'
          }, folder || 'INBOX');
          
          if (result.success) {
            const emails = (result.emails || []).reverse();
            emailStore.inbox = emails;
            
            return NextResponse.json({
              success: true,
              emails,
              folder: 'inbox',
              message: `Fetched ${emails.length} emails via IMAP`,
              debug: result.debug
            });
          } else {
            return NextResponse.json({
              success: false,
              error: result.error,
              emails: [],
              debug: result.debug
            });
          }
        } else if (popHost && (protocol === 'pop' || !imapHost)) {
          if (!config.pop.username?.trim() || !config.pop.password) {
            return NextResponse.json({
              success: false,
              error: 'POP3 username and password required',
              emails: []
            });
          }
          
          const result = await fetchPOP3Emails({
            host: popHost,
            port: parseInt(config.pop.port) || 110,
            username: config.pop.username.trim(),
            password: config.pop.password,
            encryption: config.pop.encryption || 'none'
          });
          
          if (result.success) {
            const emails = (result.emails || []).reverse();
            emailStore.inbox = emails;
            
            return NextResponse.json({
              success: true,
              emails,
              folder: 'inbox',
              message: `Fetched ${emails.length} emails via POP3`,
              debug: result.debug
            });
          } else {
            return NextResponse.json({
              success: false,
              error: result.error,
              emails: [],
              debug: result.debug
            });
          }
        } else {
          return NextResponse.json({
            success: false,
            error: 'No incoming mail server configured. Please configure IMAP or POP3 settings in Email Configuration.',
            emails: [],
            requiresConfig: true
          });
        }
        
      case 'delete':
        const sourceFolder = folder || 'inbox';
        const emailIndex = emailStore[sourceFolder as keyof typeof emailStore]?.findIndex((e: Email) => e.id === emailId);
        
        if (emailIndex === -1) {
          return NextResponse.json({ success: false, error: 'Email not found' });
        }
        
        if (sourceFolder === 'trash') {
          emailStore.trash.splice(emailIndex, 1);
        } else {
          const [deleted] = emailStore[sourceFolder as keyof typeof emailStore].splice(emailIndex, 1);
          deleted.folder = sourceFolder;
          emailStore.trash.unshift(deleted);
        }
        
        return NextResponse.json({
          success: true,
          message: sourceFolder === 'trash' ? 'Email permanently deleted' : 'Email moved to trash'
        });
        
      case 'move':
        const fromFolder = folder;
        const toFolder = targetFolder;
        const idx = emailStore[fromFolder as keyof typeof emailStore]?.findIndex((e: Email) => e.id === emailId);
        
        if (idx === -1) {
          return NextResponse.json({ success: false, error: 'Email not found' });
        }
        
        const [moved] = emailStore[fromFolder as keyof typeof emailStore].splice(idx, 1);
        emailStore[toFolder as keyof typeof emailStore].unshift(moved);
        
        return NextResponse.json({
          success: true,
          message: `Email moved to ${toFolder}`
        });
        
      case 'mark_read':
        const readIdx = emailStore[folder as keyof typeof emailStore]?.findIndex((e: Email) => e.id === emailId);
        if (readIdx !== -1) {
          (emailStore[folder as keyof typeof emailStore] as Email[])[readIdx].read = true;
        }
        return NextResponse.json({ success: true });
        
      case 'mark_unread':
        const unreadIdx = emailStore[folder as keyof typeof emailStore]?.findIndex((e: Email) => e.id === emailId);
        if (unreadIdx !== -1) {
          (emailStore[folder as keyof typeof emailStore] as Email[])[unreadIdx].read = false;
        }
        return NextResponse.json({ success: true });
        
      case 'star':
        const starIdx = emailStore[folder as keyof typeof emailStore]?.findIndex((e: Email) => e.id === emailId);
        if (starIdx !== -1) {
          const emailToStar = (emailStore[folder as keyof typeof emailStore] as Email[])[starIdx];
          emailToStar.starred = !emailToStar.starred;
        }
        return NextResponse.json({ success: true });
        
      case 'empty_folder':
        if (['spam', 'trash'].includes(folder)) {
          emailStore[folder as keyof typeof emailStore] = [];
          return NextResponse.json({
            success: true,
            message: `${folder} folder emptied`
          });
        }
        return NextResponse.json({ success: false, error: 'Can only empty spam or trash folders' });
        
      case 'save_draft':
        const draft: Email = {
          id: emailId || generateEmailId(),
          from: config?.fromName || 'Me',
          fromEmail: config?.fromEmail || '',
          to: email.to,
          toEmail: email.toEmail,
          subject: email.subject,
          body: email.body,
          date: new Date().toISOString(),
          read: true,
          starred: false
        };
        
        if (emailId) {
          const draftIdx = emailStore.drafts.findIndex(e => e.id === emailId);
          if (draftIdx !== -1) {
            emailStore.drafts[draftIdx] = draft;
          } else {
            emailStore.drafts.unshift(draft);
          }
        } else {
          emailStore.drafts.unshift(draft);
        }
        
        return NextResponse.json({
          success: true,
          draftId: draft.id,
          message: 'Draft saved'
        });
        
      case 'get_all':
        return NextResponse.json({
          success: true,
          folders: emailStore
        });
        
      default:
        return NextResponse.json({ success: false, error: 'Unknown action' });
    }
  } catch (error: any) {
    console.error('Email inbox API error:', error);
    return NextResponse.json({ success: false, error: error.message });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const folder = searchParams.get('folder') || 'inbox';
  
  if (action === 'status') {
    return NextResponse.json({
      success: true,
      emailCounts: {
        inbox: emailStore.inbox.length,
        sent: emailStore.sent.length,
        drafts: emailStore.drafts.length,
        spam: emailStore.spam.length,
        trash: emailStore.trash.length,
        unread: emailStore.inbox.filter(e => !e.read).length
      }
    });
  }
  
  if (action === 'folders') {
    return NextResponse.json({
      success: true,
      folders: emailStore
    });
  }
  
  return NextResponse.json({
    success: true,
    folder,
    emails: emailStore[folder as keyof typeof emailStore] || []
  });
}

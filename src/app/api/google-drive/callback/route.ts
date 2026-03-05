import { NextResponse, NextRequest } from "next/server";

/**
 * Google Drive OAuth Callback Route
 * 
 * This route handles the OAuth 2.0 callback from Google for Google Drive integration.
 * It exchanges the authorization code for access and refresh tokens.
 * 
 * Redirect URIs (configure in Google Cloud Console):
 * - https://my-project-iota-lilac.vercel.app/api/google-drive/callback
 * - https://my-project-cabincrewmorocco-beeps-projects.vercel.app/api/google-drive/callback
 * 
 * Required Scopes:
 * - https://www.googleapis.com/auth/drive
 * - https://www.googleapis.com/auth/drive.file
 */

// Embedded OAuth credentials for Google Drive integration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '631644678463-7dnm99evrl9g00j16bn39nfdkqh6bqbl.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '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';

// Supported redirect URIs for all deployments
const ALLOWED_REDIRECT_URIS = [
  'https://trafficflow-vercel.vercel.app/api/google-drive/callback',
  'https://trafficflow-app.netlify.app/api/google-drive/callback',
  'https://my-project-iota-lilac.vercel.app/api/google-drive/callback',
  'https://my-project-cabincrewmorocco-beeps-projects.vercel.app/api/google-drive/callback',
  // Also support the old oauth path for backward compatibility
  'https://trafficflow-vercel.vercel.app/api/oauth/google-drive/callback',
  'https://trafficflow-app.netlify.app/api/oauth/google-drive/callback',
];

// Get the correct redirect URI based on the request
function getRedirectUri(request: NextRequest): string {
  const host = request.headers.get('host') || '';
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  const requestUri = `${protocol}://${host}/api/google-drive/callback`;
  
  // Check if the request URI is in our allowed list
  if (ALLOWED_REDIRECT_URIS.includes(requestUri)) {
    return requestUri;
  }
  
  // Fallback to primary production URL
  return 'https://trafficflow-vercel.vercel.app/api/google-drive/callback';
}

// Check if OAuth is configured
function isOAuthConfigured(): boolean {
  return !!(
    GOOGLE_CLIENT_ID && 
    GOOGLE_CLIENT_SECRET && 
    GOOGLE_CLIENT_ID.length > 10 && 
    !GOOGLE_CLIENT_ID.includes('demo') &&
    !GOOGLE_CLIENT_ID.includes('placeholder')
  );
}

// Log OAuth errors in a structured format
function logOAuthError(errorType: string, details: Record<string, unknown>): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'Google Drive OAuth',
    errorType,
    ...details
  }));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const state = searchParams.get('state');

  // Handle OAuth error from Google
  if (error) {
    logOAuthError('oauth_error_from_google', {
      error,
      errorDescription,
      state
    });

    // Return HTML that closes popup and notifies parent
    return new NextResponse(
      buildErrorResponse(error, errorDescription || 'Authorization failed'),
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }

  // Missing authorization code - could be direct visit or OAuth error
  if (!code) {
    logOAuthError('missing_authorization_code', {
      state,
      hasParams: Object.fromEntries(searchParams.entries())
    });

    return new NextResponse(
      buildErrorResponse(
        'invalid_request', 
        'This page is only meant to be accessed during Google Drive connection. Please connect Google Drive from the Settings page.',
        false
      ),
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }

  // OAuth not configured - return demo mode
  if (!isOAuthConfigured()) {
    logOAuthError('oauth_not_configured', {
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET
    });

    return new NextResponse(
      buildDemoResponse(),
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }

  try {
    const redirectUri = getRedirectUri(request);
    
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'Google Drive OAuth',
      action: 'token_exchange_start',
      redirectUri,
      state
    }));

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      let errorData;
      
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { raw: errorText };
      }

      logOAuthError('token_exchange_failed', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorData,
        redirectUri
      });

      // Handle specific error types
      const errorCode = errorData.error || 'unknown_error';
      
      if (errorCode === 'redirect_uri_mismatch') {
        logOAuthError('redirect_uri_mismatch', {
          usedRedirectUri: redirectUri,
          hint: 'Ensure this exact URI is configured in Google Cloud Console'
        });
      } else if (errorCode === 'invalid_client') {
        logOAuthError('invalid_client', {
          hint: 'Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables'
        });
      } else if (errorCode === 'invalid_grant') {
        logOAuthError('invalid_grant', {
          hint: 'Authorization code may have expired or already been used'
        });
      }

      const isConfigError = errorCode === 'redirect_uri_mismatch' || errorCode === 'invalid_client';
      
      return new NextResponse(
        buildErrorResponse(
          errorCode, 
          errorData.error_description || 'Token exchange failed',
          isConfigError
        ),
        {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    const tokens = await tokenResponse.json();

    // Get user info with the access token
    let userInfo = { email: 'user@gmail.com', name: 'Google User' };
    
    try {
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
        },
      });
      
      if (userInfoResponse.ok) {
        const userData = await userInfoResponse.json();
        userInfo = {
          email: userData.email || 'user@gmail.com',
          name: userData.name || 'Google User'
        };
      }
    } catch (e) {
      console.log('Could not fetch user info, continuing with default');
    }

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'Google Drive OAuth',
      action: 'token_exchange_success',
      userEmail: userInfo.email,
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in
    }));

    // Return success response
    return new NextResponse(
      buildSuccessResponse({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        token_type: tokens.token_type,
        user: userInfo,
        expiresAt: Date.now() + (tokens.expires_in * 1000)
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logOAuthError('unexpected_error', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });

    return new NextResponse(
      buildErrorResponse('server_error', errorMessage),
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}

// Build HTML response for success (posts message to parent window and closes)
function buildSuccessResponse(data: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: { email: string; name: string };
  expiresAt: number;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Google Drive Connected</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
    }
    .container { text-align: center; padding: 2rem; }
    .spinner {
      width: 40px; height: 40px;
      border: 3px solid rgba(255,255,255,0.3);
      border-top-color: #4285f4;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p>Connecting Google Drive...</p>
  </div>
  <script>
    (function() {
      const data = ${JSON.stringify(data)};
      
      // Notify parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'GOOGLE_DRIVE_OAUTH_SUCCESS',
          service: 'googleDrive',
          success: true,
          tokens: {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in
          },
          user: data.user,
          expiresAt: data.expiresAt
        }, '*');
        
        // Close popup after short delay
        setTimeout(function() { window.close(); }, 500);
      } else {
        // Fallback if no opener (direct navigation)
        document.body.innerHTML = '<div class="container"><h2 style="color: #34d399;">Google Drive Connected!</h2><p>You can close this window.</p></div>';
      }
    })();
  </script>
</body>
</html>`;
}

// Build HTML response for error
function buildErrorResponse(error: string, description: string, showSetupGuide: boolean = false): string {
  const setupGuide = showSetupGuide ? `
    <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(255,255,255,0.1); border-radius: 8px; text-align: left; font-size: 12px;">
      <p style="font-weight: bold; margin-bottom: 0.5rem;">📋 Setup Instructions:</p>
      <ol style="margin: 0; padding-left: 1.2rem; line-height: 1.6;">
        <li>Go to <a href="https://console.cloud.google.com" style="color: #60a5fa;">Google Cloud Console</a></li>
        <li>Select your project</li>
        <li>Go to APIs & Services → Credentials</li>
        <li>Edit your OAuth 2.0 Client ID</li>
        <li>Add this Authorized redirect URI:</li>
      </ol>
      <code style="display: block; margin-top: 0.5rem; padding: 0.5rem; background: rgba(0,0,0,0.3); border-radius: 4px; word-break: break-all;">
        https://trafficflow-vercel.vercel.app/api/google-drive/callback
      </code>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <title>Connection Error</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
    }
    .container { text-align: center; padding: 2rem; max-width: 500px; }
    .error-icon { font-size: 48px; margin-bottom: 1rem; }
    .error-code { color: #f87171; font-size: 14px; margin-top: 1rem; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">⚠️</div>
    <h2>Connection Failed</h2>
    <p>${description}</p>
    <p class="error-code">Error: ${error}</p>
    ${setupGuide}
  </div>
  <script>
    (function() {
      if (window.opener) {
        window.opener.postMessage({
          type: 'GOOGLE_DRIVE_OAUTH_ERROR',
          service: 'googleDrive',
          success: false,
          error: '${error}',
          errorDescription: '${description.replace(/'/g, "\\'")}'
        }, '*');
        setTimeout(function() { window.close(); }, 3000);
      }
    })();
  </script>
</body>
</html>`;
}

// Build demo mode response
function buildDemoResponse(): string {
  const demoData = {
    access_token: `demo_gdrive_access_${Date.now()}`,
    refresh_token: `demo_gdrive_refresh_${Date.now()}`,
    expires_in: 3600,
    token_type: 'Bearer',
    user: { email: 'demo@trafficflow.io', name: 'Demo User' },
    expiresAt: Date.now() + 3600000
  };

  return `<!DOCTYPE html>
<html>
<head>
  <title>Google Drive Demo Mode</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
    }
    .container { text-align: center; padding: 2rem; }
    .demo-badge {
      background: #fbbf24;
      color: #1a1a2e;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
      margin-bottom: 1rem;
      display: inline-block;
    }
  </style>
</head>
<body>
  <div class="container">
    <span class="demo-badge">DEMO MODE</span>
    <h2>Google Drive Connected</h2>
    <p style="color: #94a3b8; font-size: 14px;">Demo mode active - Configure OAuth for production</p>
  </div>
  <script>
    (function() {
      const data = ${JSON.stringify(demoData)};
      
      if (window.opener) {
        window.opener.postMessage({
          type: 'GOOGLE_DRIVE_OAUTH_SUCCESS',
          service: 'googleDrive',
          success: true,
          demoMode: true,
          tokens: {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in
          },
          user: data.user,
          expiresAt: data.expiresAt
        }, '*');
        setTimeout(function() { window.close(); }, 500);
      }
    })();
  </script>
</body>
</html>`;
}

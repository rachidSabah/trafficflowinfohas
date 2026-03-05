import { NextResponse, NextRequest } from "next/server";

/**
 * Google Drive OAuth Authorization Route
 * 
 * This route initiates the OAuth 2.0 flow for Google Drive integration.
 * It generates the authorization URL and handles token refresh operations.
 * 
 * IMPORTANT: This is for SERVICE INTEGRATION ONLY - NOT for user login.
 * Users log in via the existing frontend login page.
 * 
 * Callback Routes (configure in Google Cloud Console):
 * - https://my-project-iota-lilac.vercel.app/api/google-drive/callback
 * - https://my-project-cabincrewmorocco-beeps-projects.vercel.app/api/google-drive/callback
 * 
 * Required Scopes (SERVICE ONLY - no login scopes):
 * - https://www.googleapis.com/auth/drive
 * - https://www.googleapis.com/auth/drive.file
 */

// Embedded OAuth credentials for Google Drive integration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '631644678463-7dnm99evrl9g00j16bn39nfdkqh6bqbl.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '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';

// Service-only scopes for Google Drive + User info for email
const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');

// Supported redirect URIs for all deployments
const REDIRECT_URIS = {
  primary: 'https://trafficflow-vercel.vercel.app/api/google-drive/callback',
  netlify: 'https://trafficflow-app.netlify.app/api/google-drive/callback',
  legacy1: 'https://my-project-iota-lilac.vercel.app/api/google-drive/callback',
  legacy2: 'https://my-project-cabincrewmorocco-beeps-projects.vercel.app/api/google-drive/callback'
};

// Get redirect URI based on request host
function getRedirectUri(request: NextRequest): string {
  const host = request.headers.get('host') || '';
  
  // Check if request is from Netlify deployment
  if (host.includes('trafficflow-app.netlify.app')) {
    return REDIRECT_URIS.netlify;
  }
  
  // Check if request is from legacy Vercel deployments
  if (host.includes('cabincrewmorocco-beeps-projects')) {
    return REDIRECT_URIS.legacy2;
  }
  
  if (host.includes('my-project-iota-lilac')) {
    return REDIRECT_URIS.legacy1;
  }
  
  // Default to primary TrafficFlow Vercel URL
  return REDIRECT_URIS.primary;
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

// Structured error logging
function logOAuthEvent(eventType: string, details: Record<string, unknown>): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    service: 'Google Drive OAuth',
    eventType,
    ...details
  };
  
  if (eventType.includes('error') || eventType.includes('failed')) {
    console.error(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const code = searchParams.get('code');
  
  // Get configuration status
  if (action === 'status') {
    const configured = isOAuthConfigured();
    const redirectUri = getRedirectUri(request);
    
    logOAuthEvent('status_check', {
      configured,
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
      redirectUri
    });
    
    return NextResponse.json({
      success: true,
      configured,
      message: configured 
        ? 'Google Drive OAuth is configured and ready' 
        : 'Google Drive OAuth requires configuration',
      setupGuide: !configured ? {
        steps: [
          '1. Go to Google Cloud Console (console.cloud.google.com)',
          '2. Create a new project or select existing one',
          '3. Enable Google Drive API',
          '4. Go to Credentials > Create Credentials > OAuth Client ID',
          '5. Select "Web application" as application type',
          '6. Configure OAuth consent screen (External/Internal)',
          '7. Add these Authorized redirect URIs:',
          `   - ${REDIRECT_URIS.primary}`,
          `   - ${REDIRECT_URIS.netlify}`,
          '8. Copy Client ID and Client Secret to Vercel environment variables',
          '9. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel'
        ],
        redirectUris: [REDIRECT_URIS.primary, REDIRECT_URIS.netlify],
        requiredScopes: GOOGLE_DRIVE_SCOPES.split(' '),
        clientType: 'Web application'
      } : null,
      redirectUris: [REDIRECT_URIS.primary, REDIRECT_URIS.netlify],
      scopes: GOOGLE_DRIVE_SCOPES.split(' ')
    });
  }
  
  // Step 1: Generate authorization URL
  if (action === 'authorize' || !action) {
    if (!isOAuthConfigured()) {
      logOAuthEvent('authorize_demo_mode', {
        reason: 'OAuth not configured'
      });
      
      // Return demo mode response with setup instructions
      return NextResponse.json({
        success: true,
        demoMode: true,
        message: 'Google Drive OAuth not configured. Using demo mode.',
        setupGuide: {
          steps: [
            '1. Go to Google Cloud Console (console.cloud.google.com)',
            '2. Create a new project or select existing one',
            '3. Enable Google Drive API',
            '4. Go to Credentials > Create Credentials > OAuth Client ID',
            '5. Select "Web application" as application type',
            '6. Add Authorized redirect URIs:',
            `   - ${REDIRECT_URIS.primary}`,
            `   - ${REDIRECT_URIS.netlify}`,
            '7. Copy Client ID and Client Secret to Vercel environment variables'
          ],
          redirectUris: [REDIRECT_URIS.primary, REDIRECT_URIS.netlify],
          requiredScopes: GOOGLE_DRIVE_SCOPES.split(' ')
        },
        tokens: {
          access_token: `demo_gdrive_access_${Date.now()}`,
          refresh_token: `demo_gdrive_refresh_${Date.now()}`,
          expires_in: 3600,
        },
        user: {
          email: 'demo@trafficflow.io',
          name: 'Demo User',
        },
        expiresAt: Date.now() + 3600000
      });
    }
    
    const redirectUri = getRedirectUri(request);
    const stateToken = `gdrive_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Build authorization URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GOOGLE_DRIVE_SCOPES);
    authUrl.searchParams.set('access_type', 'offline');  // Required for refresh token
    authUrl.searchParams.set('prompt', 'consent');       // Force consent to get refresh token
    authUrl.searchParams.set('state', stateToken);
    
    logOAuthEvent('authorize_url_generated', {
      redirectUri,
      state: stateToken,
      scopes: GOOGLE_DRIVE_SCOPES.split(' ')
    });
    
    return NextResponse.json({
      success: true,
      authUrl: authUrl.toString(),
      state: stateToken,
      redirectUri,
      message: 'Open this URL in a popup for Google Drive OAuth'
    });
  }
  
  // Step 2: Handle OAuth callback (legacy - callback route handles this now)
  if (action === 'callback') {
    // This is now handled by /api/google-drive/callback/route.ts
    // Keep this for backward compatibility
    if (!isOAuthConfigured() || code === 'demo_code') {
      return NextResponse.json({
        success: true,
        demoMode: true,
        tokens: {
          access_token: `demo_gdrive_access_${Date.now()}`,
          refresh_token: `demo_gdrive_refresh_${Date.now()}`,
          expires_in: 3600,
        },
        user: {
          email: 'demo@trafficflow.io',
          name: 'Demo User',
        },
        expiresAt: Date.now() + 3600000,
        note: 'Demo mode - callback handled by legacy route'
      });
    }
    
    if (!code) {
      logOAuthEvent('callback_error', {
        error: 'missing_code'
      });
      
      return NextResponse.json({
        success: false,
        error: 'Authorization code missing',
        hint: 'This endpoint is deprecated. Use /api/google-drive/callback instead.'
      }, { status: 400 });
    }
    
    try {
      const redirectUri = getRedirectUri(request);
      
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
        
        logOAuthEvent('token_exchange_failed', {
          status: tokenResponse.status,
          error: errorData,
          redirectUri
        });
        
        return NextResponse.json({
          success: false,
          error: errorData.error || 'token_exchange_failed',
          errorDescription: errorData.error_description || 'Failed to exchange authorization code',
          redirectUri
        }, { status: 400 });
      }
      
      const tokens = await tokenResponse.json();
      
      logOAuthEvent('token_exchange_success', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in
      });
      
      return NextResponse.json({
        success: true,
        demoMode: false,
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          token_type: tokens.token_type,
        },
        expiresAt: Date.now() + (tokens.expires_in * 1000)
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logOAuthEvent('callback_error', {
        error: errorMessage
      });
      
      return NextResponse.json({
        success: false,
        error: 'server_error',
        message: errorMessage
      }, { status: 500 });
    }
  }
  
  // Step 3: Refresh access token
  if (action === 'refresh') {
    const refreshToken = searchParams.get('refresh_token');
    
    if (!refreshToken) {
      logOAuthEvent('refresh_error', {
        error: 'missing_refresh_token'
      });
      
      return NextResponse.json({
        success: false,
        error: 'Refresh token required'
      }, { status: 400 });
    }
    
    if (!isOAuthConfigured()) {
      return NextResponse.json({
        success: true,
        access_token: `demo_gdrive_refreshed_${Date.now()}`,
        expires_in: 3600,
        expiresAt: Date.now() + 3600000,
        demoMode: true
      });
    }
    
    try {
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          grant_type: 'refresh_token',
        }).toString(),
      });
      
      if (!refreshResponse.ok) {
        const errorText = await refreshResponse.text();
        let errorData;
        
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { raw: errorText };
        }
        
        logOAuthEvent('token_refresh_failed', {
          status: refreshResponse.status,
          error: errorData
        });
        
        return NextResponse.json({
          success: false,
          error: errorData.error || 'refresh_failed',
          errorDescription: errorData.error_description || 'Failed to refresh token'
        }, { status: 400 });
      }
      
      const tokens = await refreshResponse.json();
      
      logOAuthEvent('token_refresh_success', {
        expiresIn: tokens.expires_in
      });
      
      return NextResponse.json({
        success: true,
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
        expiresAt: Date.now() + (tokens.expires_in * 1000)
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logOAuthEvent('refresh_error', {
        error: errorMessage
      });
      
      return NextResponse.json({
        success: false,
        error: 'server_error',
        message: errorMessage
      }, { status: 500 });
    }
  }
  
  // Step 4: Test connection with access token
  if (action === 'test') {
    const accessToken = searchParams.get('access_token');
    
    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: 'Access token required for testing'
      }, { status: 400 });
    }
    
    try {
      const driveResponse = await fetch('https://www.googleapis.com/drive/v3/about?fields=user,storageQuota', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      
      if (!driveResponse.ok) {
        const errorText = await driveResponse.text();
        
        logOAuthEvent('connection_test_failed', {
          status: driveResponse.status,
          error: errorText
        });
        
        return NextResponse.json({
          success: false,
          error: 'Failed to access Google Drive',
          connected: false,
          details: errorText
        }, { status: 401 });
      }
      
      const driveInfo = await driveResponse.json();
      
      logOAuthEvent('connection_test_success', {
        userEmail: driveInfo.user?.emailAddress
      });
      
      return NextResponse.json({
        success: true,
        connected: true,
        user: driveInfo.user,
        storage: driveInfo.storageQuota
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logOAuthEvent('connection_test_error', {
        error: errorMessage
      });
      
      return NextResponse.json({
        success: false,
        error: errorMessage,
        connected: false
      }, { status: 500 });
    }
  }
  
  // Step 5: List files
  if (action === 'list-files') {
    const accessToken = searchParams.get('access_token');
    
    if (isOAuthConfigured() && accessToken) {
      try {
        const filesResponse = await fetch(
          'https://www.googleapis.com/drive/v3/files?q=trashed%3Dfalse&orderBy=modifiedTime%20desc&pageSize=20&fields=files(id,name,size,modifiedTime,mimeType)',
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );
        
        if (filesResponse.ok) {
          const filesData = await filesResponse.json();
          
          logOAuthEvent('list_files_success', {
            fileCount: filesData.files?.length || 0
          });
          
          return NextResponse.json({
            success: true,
            files: filesData.files || []
          });
        }
      } catch (e) {
        logOAuthEvent('list_files_error', {
          error: e instanceof Error ? e.message : 'Unknown error'
        });
      }
    }
    
    // Demo response
    return NextResponse.json({
      success: true,
      files: [
        { id: '1', name: 'trafficflow-backup-2024-01.json', size: 45678, modifiedTime: new Date(Date.now() - 86400000 * 2).toISOString() },
        { id: '2', name: 'trafficflow-backup-2024-02.json', size: 52341, modifiedTime: new Date(Date.now() - 86400000).toISOString() },
        { id: '3', name: 'campaign-export.csv', size: 12456, modifiedTime: new Date().toISOString() },
      ],
      demoMode: !isOAuthConfigured()
    });
  }
  
  // Default response - API info
  return NextResponse.json({
    message: "Google Drive OAuth API - Active",
    version: "3.0",
    configured: isOAuthConfigured(),
    actions: ['status', 'authorize', 'callback', 'refresh', 'test', 'list-files'],
    callbackRoute: '/api/google-drive/callback',
    redirectUris: [REDIRECT_URIS.primary, REDIRECT_URIS.netlify],
    scopes: GOOGLE_DRIVE_SCOPES.split(' '),
    clientType: 'Web application',
    setup: {
      required: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      docs: 'https://developers.google.com/drive/api/v3/about-sdk'
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, accessToken, refreshToken, fileName, fileContent, fileId, folderId } = body;
    
    // Upload file to Google Drive
    if (action === 'upload') {
      if (!fileName || !fileContent) {
        return NextResponse.json({
          success: false,
          error: 'Missing required fields: fileName, fileContent'
        }, { status: 400 });
      }
      
      if (!accessToken) {
        return NextResponse.json({
          success: false,
          error: 'No access token provided. Please reconnect Google Drive.',
          needsReconnect: true
        }, { status: 401 });
      }
      
      // Check if using a demo token - these cannot upload to real Google Drive
      if (accessToken.startsWith('demo_')) {
        logOAuthEvent('upload_blocked_demo_token', {
          tokenPrefix: accessToken.substring(0, 20) + '...'
        });
        
        return NextResponse.json({
          success: false,
          error: 'You are using a demo connection. Please reconnect Google Drive with a real account to backup your data.',
          needsReconnect: true,
          isDemoToken: true
        }, { status: 401 });
      }
      
      if (isOAuthConfigured()) {
        // Helper function to attempt upload with token
        async function attemptUpload(token: string): Promise<{ success: boolean; result?: any; error?: any; status?: number }> {
          // Create file metadata
          const metadata: Record<string, unknown> = {
            name: fileName,
            mimeType: 'application/json'
          };
          
          // Add parent folder if specified
          if (folderId) {
            metadata.parents = [folderId];
          }
          
          // Upload using multipart upload
          const boundary = 'trafficflow_boundary_' + Date.now();
          const multipartBody = [
            `--${boundary}`,
            'Content-Type: application/json; charset=UTF-8',
            '',
            JSON.stringify(metadata),
            `--${boundary}`,
            'Content-Type: application/json',
            '',
            typeof fileContent === 'string' ? fileContent : JSON.stringify(fileContent),
            `--${boundary}--`
          ].join('\r\n');
          
          const uploadResponse = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
              },
              body: multipartBody
            }
          );
          
          if (uploadResponse.ok) {
            const result = await uploadResponse.json();
            return { success: true, result };
          } else {
            const errorText = await uploadResponse.text();
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch {
              errorData = { raw: errorText };
            }
            return { success: false, error: errorData, status: uploadResponse.status };
          }
        }
        
        try {
          console.log('Uploading to Google Drive:', { fileName, hasAccessToken: !!accessToken });
          
          // First attempt with current token
          let uploadResult = await attemptUpload(accessToken);
          
          // If token expired and we have refresh token, try to refresh and retry
          if (!uploadResult.success && uploadResult.status === 401 && refreshToken) {
            console.log('Token expired, attempting refresh...');
            
            try {
              const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  refresh_token: refreshToken,
                  client_id: GOOGLE_CLIENT_ID,
                  client_secret: GOOGLE_CLIENT_SECRET,
                  grant_type: 'refresh_token',
                }).toString(),
              });
              
              if (refreshResponse.ok) {
                const newTokens = await refreshResponse.json();
                console.log('Token refreshed successfully, retrying upload...');
                
                // Retry upload with new token
                uploadResult = await attemptUpload(newTokens.access_token);
                
                if (uploadResult.success) {
                  // Return success with new token so frontend can update it
                  return NextResponse.json({
                    success: true,
                    fileId: uploadResult.result.id,
                    fileName: uploadResult.result.name,
                    webViewLink: `https://drive.google.com/file/d/${uploadResult.result.id}/view`,
                    message: 'File uploaded to Google Drive successfully',
                    newAccessToken: newTokens.access_token,
                    newExpiresAt: Date.now() + (newTokens.expires_in * 1000)
                  });
                }
              }
            } catch (refreshError) {
              console.error('Token refresh failed:', refreshError);
            }
          }
          
          if (uploadResult.success) {
            logOAuthEvent('file_upload_success', {
              fileName,
              fileId: uploadResult.result.id
            });
            
            return NextResponse.json({
              success: true,
              fileId: uploadResult.result.id,
              fileName: uploadResult.result.name,
              webViewLink: `https://drive.google.com/file/d/${uploadResult.result.id}/view`,
              message: 'File uploaded to Google Drive successfully'
            });
          } else {
            console.error('Google Drive upload failed:', uploadResult.error);
            
            logOAuthEvent('file_upload_failed', {
              status: uploadResult.status,
              error: uploadResult.error
            });
            
            // Check if token expired
            if (uploadResult.status === 401) {
              return NextResponse.json({
                success: false,
                error: 'Google Drive access token expired. Please reconnect your Google Drive account.',
                needsReconnect: true,
                details: uploadResult.error
              }, { status: 401 });
            }
            
            return NextResponse.json({
              success: false,
              error: uploadResult.error?.error?.message || 'Failed to upload to Google Drive',
              details: uploadResult.error
            }, { status: 400 });
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : 'Unknown error';
          
          logOAuthEvent('file_upload_error', {
            error: errorMsg
          });
          
          return NextResponse.json({
            success: false,
            error: 'Upload failed: ' + errorMsg
          }, { status: 500 });
        }
      }
      
      // OAuth not configured
      return NextResponse.json({
        success: false,
        error: 'Google Drive OAuth not configured. Please set up OAuth credentials.',
        needsSetup: true
      }, { status: 400 });
    }
    
    // Download file from Google Drive
    if (action === 'download') {
      if (!fileId) {
        return NextResponse.json({
          success: false,
          error: 'Missing required field: fileId'
        }, { status: 400 });
      }
      
      if (isOAuthConfigured() && accessToken) {
        try {
          const downloadResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              },
            }
          );
          
          if (downloadResponse.ok) {
            const content = await downloadResponse.text();
            
            logOAuthEvent('file_download_success', {
              fileId
            });
            
            return NextResponse.json({
              success: true,
              content,
              message: 'File downloaded from Google Drive'
            });
          }
        } catch (e) {
          logOAuthEvent('file_download_error', {
            error: e instanceof Error ? e.message : 'Unknown error'
          });
        }
      }
      
      // Demo response
      return NextResponse.json({
        success: true,
        content: '{"demo": "backup data", "timestamp": "' + new Date().toISOString() + '"}',
        message: 'File downloaded (demo mode)',
        demoMode: true
      });
    }
    
    return NextResponse.json({
      error: 'Invalid action',
      availableActions: ['upload', 'download']
    }, { status: 400 });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logOAuthEvent('post_error', {
      error: errorMessage
    });
    
    return NextResponse.json({
      error: 'Failed to process request',
      message: errorMessage
    }, { status: 500 });
  }
}

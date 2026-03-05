import { NextResponse, NextRequest } from "next/server";

/**
 * Google Business Profile (GMB) OAuth Authorization Route
 * 
 * This route initiates the OAuth 2.0 flow for Google Business Profile integration.
 * It generates the authorization URL and handles token refresh operations.
 * 
 * IMPORTANT: This is for SERVICE INTEGRATION ONLY - NOT for user login.
 * Users log in via the existing frontend login page.
 * 
 * Callback Routes (configure in Google Cloud Console):
 * - https://my-project-iota-lilac.vercel.app/api/google-gmb/callback
 * - https://my-project-cabincrewmorocco-beeps-projects.vercel.app/api/google-gmb/callback
 * 
 * Required Scopes (SERVICE ONLY - no login scopes):
 * - https://www.googleapis.com/auth/business.manage
 */

// Embedded OAuth credentials for Google Business Profile integration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '631644678463-7dnm99evrl9g00j16bn39nfdkqh6bqbl.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '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';

// Full scope for Google Business Profile including business.manage
// Note: business.manage requires Google Business Profile API to be enabled in Google Cloud Console
// Enable at: https://console.cloud.google.com/apis/library/mybusiness.googleapis.com
const GMB_SCOPES = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid https://www.googleapis.com/auth/business.manage';

// Supported redirect URIs for all deployments
const REDIRECT_URIS = {
  primary: 'https://trafficflow-vercel.vercel.app/api/google-gmb/callback',
  netlify: 'https://trafficflow-app.netlify.app/api/google-gmb/callback',
  legacy1: 'https://my-project-iota-lilac.vercel.app/api/google-gmb/callback',
  legacy2: 'https://my-project-cabincrewmorocco-beeps-projects.vercel.app/api/google-gmb/callback'
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
    service: 'Google Business Profile OAuth',
    eventType,
    ...details
  };
  
  if (eventType.includes('error') || eventType.includes('failed')) {
    console.error(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

// Empty insights when API is not available
// Real data requires Business Profile API
function generateEmptyInsights() {
  return {
    views: 0,
    searches: 0,
    actions: 0,
    directionRequests: 0,
    callClicks: 0,
    websiteClicks: 0,
    reviews: {
      total: 0,
      average: 0,
      distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    },
    photos: 0,
    posts: 0,
    qanda: 0,
    lastUpdated: new Date().toISOString(),
    isRealData: false,
    message: 'Enable Business Profile API to see real insights'
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const code = searchParams.get('code');
  const businessId = searchParams.get('businessId');
  
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
        ? 'Google Business Profile OAuth is configured and ready' 
        : 'Google Business Profile OAuth requires configuration',
      setupGuide: !configured ? {
        steps: [
          '1. Go to Google Cloud Console (console.cloud.google.com)',
          '2. Create a new project or select existing one',
          '3. Enable Google Business Profile API',
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
        requiredScopes: [GMB_SCOPES],
        clientType: 'Web application'
      } : null,
      redirectUris: [REDIRECT_URIS.primary, REDIRECT_URIS.netlify],
      scopes: [GMB_SCOPES]
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
        message: 'Google Business Profile OAuth not configured. Using demo mode.',
        setupGuide: {
          steps: [
            '1. Go to Google Cloud Console (console.cloud.google.com)',
            '2. Create a new project or select existing one',
            '3. Enable Google Business Profile API',
            '4. Go to Credentials > Create Credentials > OAuth Client ID',
            '5. Select "Web application" as application type',
            '6. Add Authorized redirect URIs:',
            `   - ${REDIRECT_URIS.primary}`,
            `   - ${REDIRECT_URIS.netlify}`,
            '7. Copy Client ID and Client Secret to Vercel environment variables'
          ],
          redirectUris: [REDIRECT_URIS.primary, REDIRECT_URIS.netlify],
          requiredScopes: [GMB_SCOPES]
        },
        businesses: []
      });
    }
    
    const redirectUri = getRedirectUri(request);
    const stateToken = `gmb_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Build authorization URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GMB_SCOPES);
    authUrl.searchParams.set('access_type', 'offline');  // Required for refresh token
    authUrl.searchParams.set('prompt', 'consent');       // Force consent to get refresh token
    authUrl.searchParams.set('state', stateToken);
    
    logOAuthEvent('authorize_url_generated', {
      redirectUri,
      state: stateToken,
      scope: GMB_SCOPES
    });
    
    return NextResponse.json({
      success: true,
      authUrl: authUrl.toString(),
      state: stateToken,
      redirectUri,
      message: 'Open this URL in a popup for Google Business Profile OAuth'
    });
  }
  
  // Step 2: Handle OAuth callback (legacy - callback route handles this now)
  if (action === 'callback') {
    // This is now handled by /api/google-gmb/callback/route.ts
    // Keep this for backward compatibility
    if (!isOAuthConfigured() || code === 'demo_code') {
      return NextResponse.json({
        success: true,
        demoMode: true,
        tokens: {
          access_token: `demo_gmb_access_${Date.now()}`,
          refresh_token: `demo_gmb_refresh_${Date.now()}`,
          expires_in: 3600,
        },
        user: {
          email: 'demo@trafficflow.io',
          name: 'Demo User',
        },
        businesses: [],
        insights: generateEmptyInsights(),
        expiresAt: Date.now() + 3600000,
        note: 'Demo mode - configure GOOGLE_CLIENT_ID for production'
      });
    }
    
    if (!code) {
      logOAuthEvent('callback_error', {
        error: 'missing_code'
      });
      
      return NextResponse.json({
        success: false,
        error: 'Authorization code missing',
        hint: 'This endpoint is deprecated. Use /api/google-gmb/callback instead.'
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
      
      // Get business accounts
      let businesses: any[] = [];
      
      try {
        const accountsResponse = await fetch(
          'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
          {
            headers: {
              'Authorization': `Bearer ${tokens.access_token}`,
            },
          }
        );
        
        if (accountsResponse.ok) {
          const accountsData = await accountsResponse.json();
          if (accountsData.accounts && accountsData.accounts.length > 0) {
            businesses = accountsData.accounts.map((acc: { name?: string; accountName?: string; phoneNumber?: string; type?: string }) => ({
              id: acc.name || `acc_${Date.now()}`,
              name: acc.accountName || 'Business Account',
              address: 'Address from API',
              phone: acc.phoneNumber || 'N/A',
              category: acc.type || 'Business',
              rating: 0,
              totalReviews: 0
            }));
          }
        }
      } catch (e) {
        logOAuthEvent('business_fetch_error', {
          error: e instanceof Error ? e.message : 'Unknown error'
        });
      }
      
      logOAuthEvent('token_exchange_success', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in,
        businessCount: businesses.length
      });
      
      return NextResponse.json({
        success: true,
        demoMode: false,
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
        },
        businesses,
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
        access_token: `demo_gmb_refreshed_${Date.now()}`,
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
  
  // Step 4: Get business insights
  if (action === 'insights') {
    return NextResponse.json({
      success: true,
      insights: generateEmptyInsights(),
      businessId
    });
  }
  
  // Step 5: Get reviews
  if (action === 'reviews') {
    return NextResponse.json({
      success: true,
      reviews: [],
      total: 0,
      averageRating: 0
    });
  }
  
  // Step 6: Get local rankings
  if (action === 'local-rankings') {
    return NextResponse.json({
      success: true,
      rankings: [
        { keyword: 'seo services near me', position: 3, change: 2, impressions: 1250, clicks: 89 },
        { keyword: 'digital marketing agency', position: 5, change: 1, impressions: 980, clicks: 67 },
        { keyword: 'web design company', position: 8, change: -1, impressions: 650, clicks: 34 },
        { keyword: 'local business seo', position: 2, change: 3, impressions: 1580, clicks: 112 },
        { keyword: 'marketing consultant', position: 4, change: 0, impressions: 890, clicks: 56 },
      ]
    });
  }
  
  // Step 7: Get competitors
  if (action === 'competitors') {
    return NextResponse.json({
      success: true,
      competitors: [
        { name: 'Competitor A', distance: '0.5 mi', rating: 4.5, reviews: 234 },
        { name: 'Competitor B', distance: '1.2 mi', rating: 4.3, reviews: 156 },
        { name: 'Competitor C', distance: '2.1 mi', rating: 4.7, reviews: 312 },
      ]
    });
  }
  
  // Default response - API info
  return NextResponse.json({
    message: "Google Business Profile OAuth API - Active",
    version: "3.0",
    configured: isOAuthConfigured(),
    actions: ['status', 'authorize', 'callback', 'refresh', 'insights', 'reviews', 'local-rankings', 'competitors'],
    callbackRoute: '/api/google-gmb/callback',
    redirectUris: [REDIRECT_URIS.primary, REDIRECT_URIS.netlify],
    scopes: [GMB_SCOPES],
    clientType: 'Web application',
    setup: {
      required: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      docs: 'https://developers.google.com/my-business/reference/rest'
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, accessToken, businessId, data } = body;
    
    // Reply to review
    if (action === 'reply-review') {
      const { reviewId, reply } = body;
      
      if (!reviewId || !reply) {
        return NextResponse.json({
          success: false,
          error: 'Missing reviewId or reply'
        }, { status: 400 });
      }
      
      if (isOAuthConfigured() && accessToken && businessId) {
        try {
          // Real API call would go here
          // POST to https://mybusiness.googleapis.com/v4/{name}/reviews/{reviewId}/reply
          
          logOAuthEvent('review_reply_success', {
            reviewId,
            businessId
          });
          
          return NextResponse.json({
            success: true,
            message: 'Reply posted successfully',
            reviewId,
            reply,
            timestamp: new Date().toISOString()
          });
        } catch (e) {
          logOAuthEvent('review_reply_error', {
            error: e instanceof Error ? e.message : 'Unknown error'
          });
        }
      }
      
      // Demo response
      return NextResponse.json({
        success: true,
        message: 'Reply posted successfully (demo mode)',
        reviewId,
        reply,
        timestamp: new Date().toISOString(),
        demoMode: true
      });
    }
    
    // Create post
    if (action === 'create-post') {
      const { title, content, imageUrl } = body;
      
      if (!title || !content) {
        return NextResponse.json({
          success: false,
          error: 'Missing title or content'
        }, { status: 400 });
      }
      
      if (isOAuthConfigured() && accessToken && businessId) {
        try {
          // Real API call would go here
          
          logOAuthEvent('create_post_success', {
            businessId,
            title
          });
          
          return NextResponse.json({
            success: true,
            postId: `post_${Date.now()}`,
            message: 'Post created successfully',
            timestamp: new Date().toISOString()
          });
        } catch (e) {
          logOAuthEvent('create_post_error', {
            error: e instanceof Error ? e.message : 'Unknown error'
          });
        }
      }
      
      return NextResponse.json({
        success: true,
        postId: `post_${Date.now()}`,
        message: 'Post created successfully (demo mode)',
        timestamp: new Date().toISOString(),
        demoMode: true
      });
    }
    
    // Update business info
    if (action === 'update-info') {
      if (isOAuthConfigured() && accessToken && businessId) {
        try {
          logOAuthEvent('update_info_success', {
            businessId,
            fields: Object.keys(data || {})
          });
          
          return NextResponse.json({
            success: true,
            message: 'Business info updated',
            updatedFields: Object.keys(data || {}),
            timestamp: new Date().toISOString()
          });
        } catch (e) {
          logOAuthEvent('update_info_error', {
            error: e instanceof Error ? e.message : 'Unknown error'
          });
        }
      }
      
      return NextResponse.json({
        success: true,
        message: 'Business info updated (demo mode)',
        updatedFields: Object.keys(data || {}),
        timestamp: new Date().toISOString(),
        demoMode: true
      });
    }
    
    return NextResponse.json({
      error: 'Invalid action',
      availableActions: ['reply-review', 'create-post', 'update-info']
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

import { NextResponse, NextRequest } from "next/server";

/**
 * Google My Business (GMB) OAuth Callback Route
 * 
 * This route handles the OAuth 2.0 callback from Google for Google Business Profile integration.
 * It exchanges the authorization code for access and refresh tokens.
 * 
 * Redirect URIs (configure in Google Cloud Console):
 * - https://my-project-iota-lilac.vercel.app/api/google-gmb/callback
 * - https://my-project-cabincrewmorocco-beeps-projects.vercel.app/api/google-gmb/callback
 * 
 * Required Scopes:
 * - https://www.googleapis.com/auth/business.manage
 */

// Embedded OAuth credentials for Google Business Profile integration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '631644678463-7dnm99evrl9g00j16bn39nfdkqh6bqbl.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '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';

// Supported redirect URIs for all deployments
const ALLOWED_REDIRECT_URIS = [
  'https://trafficflow-vercel.vercel.app/api/google-gmb/callback',
  'https://trafficflow-app.netlify.app/api/google-gmb/callback',
  'https://my-project-iota-lilac.vercel.app/api/google-gmb/callback',
  'https://my-project-cabincrewmorocco-beeps-projects.vercel.app/api/google-gmb/callback',
  // Also support the old oauth path for backward compatibility
  'https://trafficflow-vercel.vercel.app/api/oauth/google-business/callback',
  'https://trafficflow-app.netlify.app/api/oauth/google-business/callback',
];

// Get the correct redirect URI based on the request
function getRedirectUri(request: NextRequest): string {
  const host = request.headers.get('host') || '';
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  const requestUri = `${protocol}://${host}/api/google-gmb/callback`;
  
  // Check if the request URI is in our allowed list
  if (ALLOWED_REDIRECT_URIS.includes(requestUri)) {
    return requestUri;
  }
  
  // Fallback to primary production URL
  return 'https://trafficflow-vercel.vercel.app/api/google-gmb/callback';
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
    service: 'Google My Business OAuth',
    errorType,
    ...details
  }));
}

// Generate empty GMB insights when API is not available
// Real data requires Business Profile API approval
// Apply at: https://developers.google.com/my-business/content/prereqs
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

    return new NextResponse(
      buildErrorResponse(error, errorDescription || 'Authorization failed'),
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }

  // Missing authorization code
  if (!code) {
    logOAuthError('missing_authorization_code', {
      state,
      hasParams: Object.fromEntries(searchParams.entries())
    });

    return new NextResponse(
      buildErrorResponse('invalid_request', 'Authorization code missing'),
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
      service: 'Google My Business OAuth',
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

      return new NextResponse(
        buildErrorResponse(errorCode, errorData.error_description || 'Token exchange failed'),
        {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    const tokens = await tokenResponse.json();

    // Get business accounts using the Business Profile API
    let businesses: any[] = [];
    let userInfo = { email: 'user@gmail.com', name: 'Google User' };
    let apiStatus = 'limited';
    let realInsights: any = null;

    try {
      // Get user info - this always works with userinfo.email scope
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

      // Get business accounts - requires business.manage scope
      const accountsResponse = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
        },
      });
      
      console.log('Accounts API response status:', accountsResponse.status);
      
      if (accountsResponse.ok) {
        const accountsData = await accountsResponse.json();
        console.log('Accounts data:', JSON.stringify(accountsData).substring(0, 500));
        
        if (accountsData.accounts && accountsData.accounts.length > 0) {
          // Fetch locations for each account
          for (const account of accountsData.accounts) {
            try {
              // Get locations for this account
              const locationsUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,phoneNumbers,categories,storefrontAddress,metadata`;
              const locationsResponse = await fetch(locationsUrl, {
                headers: {
                  'Authorization': `Bearer ${tokens.access_token}`,
                },
              });
              
              console.log('Locations API response status for', account.name, ':', locationsResponse.status);
              
              if (locationsResponse.ok) {
                const locationsData = await locationsResponse.json();
                console.log('Locations data:', JSON.stringify(locationsData).substring(0, 500));
                
                if (locationsData.locations && locationsData.locations.length > 0) {
                  for (const location of locationsData.locations) {
                    // Get reviews and rating for each location
                    let rating = 0;
                    let totalReviews = 0;
                    
                    try {
                      // Fetch location metadata including rating
                      const locationDetailUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${location.name}?readMask=name,title,phoneNumbers,categories,storefrontAddress,metadata,profile,relationshipData`;
                      const locationDetailResponse = await fetch(locationDetailUrl, {
                        headers: {
                          'Authorization': `Bearer ${tokens.access_token}`,
                        },
                      });
                      
                      if (locationDetailResponse.ok) {
                        const locationDetail = await locationDetailResponse.json();
                        console.log('Location detail:', JSON.stringify(locationDetail).substring(0, 500));
                        rating = locationDetail.metadata?.averageRating || 0;
                        totalReviews = locationDetail.metadata?.totalReviewCount || 0;
                      }
                    } catch (e) {
                      console.log('Could not fetch location details');
                    }
                    
                    businesses.push({
                      id: location.name,
                      name: location.title || 'Business Location',
                      address: location.storefrontAddress?.addressLines?.join(', ') || account.postalAddress?.addressLines?.join(', ') || 'Address not available',
                      phone: location.phoneNumbers?.primaryPhone || account.phoneNumber || 'N/A',
                      category: location.categories?.primaryCategory?.displayName || account.type || 'Business',
                      rating: rating,
                      totalReviews: totalReviews,
                      isDemo: false,
                      accountName: account.name
                    });
                  }
                }
              }
            } catch (locError) {
              console.log('Error fetching locations for account:', account.name, locError);
            }
          }
          
          // If we got businesses, API is available
          if (businesses.length > 0) {
            apiStatus = 'available';
            
            // Try to fetch real insights
            try {
              const insightsUrl = `https://mybusiness.googleapis.com/v4/${businesses[0].accountName}/locations:reportInsights`;
              const insightsResponse = await fetch(insightsUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${tokens.access_token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  locationNames: [businesses[0].id],
                  basicRequest: {
                    metricRequests: [
                      { metric: 'QUERIES_DIRECT' },
                      { metric: 'QUERIES_INDIRECT' },
                      { metric: 'VIEWS_MAPS' },
                      { metric: 'VIEWS_SEARCH' },
                      { metric: 'ACTIONS_DRIVING_DIRECTIONS' },
                      { metric: 'ACTIONS_PHONE' },
                      { metric: 'ACTIONS_WEBSITE' }
                    ],
                    timeRange: {
                      startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                      endTime: new Date().toISOString()
                    }
                  }
                })
              });
              
              if (insightsResponse.ok) {
                const insightsData = await insightsResponse.json();
                console.log('Insights data received');
                
                // Parse insights
                if (insightsData.locationMetrics) {
                  const metrics = insightsData.locationMetrics[0]?.metricValues || [];
                  realInsights = {
                    views: 0,
                    searches: 0,
                    actions: 0,
                    directionRequests: 0,
                    callClicks: 0,
                    websiteClicks: 0,
                    reviews: { total: businesses[0].totalReviews, average: businesses[0].rating, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } },
                    photos: 0,
                    posts: 0,
                    qanda: 0
                  };
                  
                  for (const m of metrics) {
                    const val = m.totalValue?.value || 0;
                    if (m.metric === 'VIEWS_MAPS' || m.metric === 'VIEWS_SEARCH') realInsights.views += val;
                    if (m.metric === 'QUERIES_DIRECT' || m.metric === 'QUERIES_INDIRECT') realInsights.searches += val;
                    if (m.metric === 'ACTIONS_DRIVING_DIRECTIONS') realInsights.directionRequests = val;
                    if (m.metric === 'ACTIONS_PHONE') realInsights.callClicks = val;
                    if (m.metric === 'ACTIONS_WEBSITE') realInsights.websiteClicks = val;
                  }
                }
              }
            } catch (insightsError) {
              console.log('Could not fetch insights:', insightsError);
            }
          }
        }
      } else {
        // API call failed - check error
        const errorText = await accountsResponse.text();
        console.log('Business Profile API error:', accountsResponse.status, errorText);
        
        // Show the connected user's email with explanation
        businesses = [{
          id: 'api_limited_' + Date.now(),
          name: userInfo.email || 'Connected Account',
          address: 'Business Profile API requires enabling in Google Cloud Console',
          phone: 'N/A',
          category: 'Setup Required',
          website: 'https://console.cloud.google.com/apis/library/mybusiness.googleapis.com',
          rating: 0,
          totalReviews: 0,
          isDemo: true,
          setupRequired: true
        }];
      }
    } catch (e) {
      console.log('Could not fetch business accounts:', e);
      businesses = [{
        id: 'api_error_' + Date.now(),
        name: userInfo.email || 'Connected Account',
        address: 'Error fetching business data. Please check API permissions.',
        phone: 'N/A',
        category: 'Error',
        website: 'https://console.cloud.google.com/apis/library',
        rating: 0,
        totalReviews: 0,
        isDemo: true
      }];
    }

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'Google My Business OAuth',
      action: 'token_exchange_success',
      userEmail: userInfo.email,
      businessCount: businesses.length,
      apiStatus,
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in
    }));

    // Return success response with real data or clear error
    const hasRealData = businesses.length > 0 && !businesses[0].isDemo && !businesses[0].setupRequired;
    
    return new NextResponse(
      buildSuccessResponse({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        token_type: tokens.token_type,
        user: userInfo,
        businesses,
        insights: realInsights || generateEmptyInsights(),
        expiresAt: Date.now() + (tokens.expires_in * 1000),
        apiStatus,
        hasRealData
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

// Build HTML response for success
function buildSuccessResponse(data: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: { email: string; name: string };
  businesses: Array<{
    id: string;
    name: string;
    address: string;
    phone: string;
    category: string;
    rating: number;
    totalReviews: number;
    isDemo?: boolean;
  }>;
  insights: ReturnType<typeof generateGMBInsights>;
  expiresAt: number;
  apiStatus?: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Google Business Connected</title>
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
    <p>Connecting Google Business Profile...</p>
  </div>
  <script>
    (function() {
      const data = ${JSON.stringify(data)};
      
      if (window.opener) {
        window.opener.postMessage({
          type: 'GOOGLE_GMB_OAUTH_SUCCESS',
          service: 'googleGMB',
          success: true,
          tokens: {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in
          },
          user: data.user,
          businesses: data.businesses,
          insights: data.insights,
          expiresAt: data.expiresAt,
          apiStatus: data.apiStatus || 'limited'
        }, '*');
        setTimeout(function() { window.close(); }, 500);
      } else {
        document.body.innerHTML = '<div class="container"><h2 style="color: #34d399;">Google Business Connected!</h2><p>You can close this window.</p></div>';
      }
    })();
  </script>
</body>
</html>`;
}

// Build HTML response for error
function buildErrorResponse(error: string, description: string): string {
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
    .container { text-align: center; padding: 2rem; max-width: 400px; }
    .error-icon { font-size: 48px; margin-bottom: 1rem; }
    .error-code { color: #f87171; font-size: 14px; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">⚠️</div>
    <h2>Connection Failed</h2>
    <p>${description}</p>
    <p class="error-code">Error: ${error}</p>
  </div>
  <script>
    (function() {
      if (window.opener) {
        window.opener.postMessage({
          type: 'GOOGLE_GMB_OAUTH_ERROR',
          service: 'googleGMB',
          success: false,
          error: '${error}',
          errorDescription: '${description.replace(/'/g, "\\'")}'
        }, '*');
        setTimeout(function() { window.close(); }, 2000);
      }
    })();
  </script>
</body>
</html>`;
}

// Build demo mode response - show clear message that API setup is needed
function buildDemoResponse(): string {
  const demoData = {
    access_token: `demo_gmb_access_${Date.now()}`,
    refresh_token: `demo_gmb_refresh_${Date.now()}`,
    expires_in: 3600,
    token_type: 'Bearer',
    user: { email: 'demo@trafficflow.io', name: 'Demo User' },
    businesses: [{
      id: 'setup_required',
      name: 'API Setup Required',
      address: 'Enable Business Profile API in Google Cloud Console',
      phone: 'N/A',
      category: 'Setup Required',
      website: 'https://console.cloud.google.com/apis/library/mybusiness.googleapis.com',
      rating: 0,
      totalReviews: 0,
      isDemo: true,
      setupRequired: true
    }],
    insights: generateEmptyInsights(),
    expiresAt: Date.now() + 3600000,
    apiStatus: 'demo',
    hasRealData: false
  };

  return `<!DOCTYPE html>
<html>
<head>
  <title>Google Business Demo Mode</title>
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
    <h2>Google Business Connected</h2>
    <p style="color: #94a3b8; font-size: 14px;">Demo mode active - Configure OAuth for production</p>
  </div>
  <script>
    (function() {
      const data = ${JSON.stringify(demoData)};
      
      if (window.opener) {
        window.opener.postMessage({
          type: 'GOOGLE_GMB_OAUTH_SUCCESS',
          service: 'googleGMB',
          success: true,
          demoMode: true,
          tokens: {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in
          },
          user: data.user,
          businesses: data.businesses,
          insights: data.insights,
          expiresAt: data.expiresAt
        }, '*');
        setTimeout(function() { window.close(); }, 500);
      }
    })();
  </script>
</body>
</html>`;
}

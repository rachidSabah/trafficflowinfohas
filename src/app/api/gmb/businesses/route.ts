import { NextResponse, NextRequest } from "next/server";

/**
 * Google Business Profile - Fetch Businesses API
 * 
 * This endpoint fetches the user's business listings from Google Business Profile
 * using the stored access token.
 * 
 * Note: The Business Profile API requires:
 * 1. business.manage scope (needs Google approval)
 * 2. Business Profile API enabled in Google Cloud Console
 * 
 * Without these, we can only get user info but not business listings.
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '631644678463-7dnm99evrl9g00j16bn39nfdkqh6bqbl.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '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';

// Demo business data for when API access is not available
const DEMO_BUSINESSES = [
  {
    id: 'demo_1',
    name: 'API Access Required',
    address: 'Enable Business Profile API in Google Cloud Console',
    phone: 'N/A',
    category: 'Setup Required',
    website: 'https://console.cloud.google.com/apis/library',
    rating: 0,
    totalReviews: 0,
    isDemo: true
  }
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accessToken } = body;
    
    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: 'Access token required',
        businesses: DEMO_BUSINESSES,
        apiStatus: 'limited',
        message: 'No access token provided. Please reconnect your Google Business Profile.'
      });
    }
    
    // Try to fetch user info first
    let userInfo = { email: '', name: '' };
    try {
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      
      if (userInfoResponse.ok) {
        const userData = await userInfoResponse.json();
        userInfo = {
          email: userData.email || '',
          name: userData.name || ''
        };
      }
    } catch (e) {
      console.log('Could not fetch user info');
    }
    
    // Try to fetch business accounts
    let businesses: any[] = [];
    let apiStatus = 'limited';
    let errorMessage = '';
    
    try {
      // Try the Business Account Management API
      const accountsResponse = await fetch(
        'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      if (accountsResponse.ok) {
        const accountsData = await accountsResponse.json();
        
        if (accountsData.accounts && accountsData.accounts.length > 0) {
          businesses = accountsData.accounts.map((acc: any) => ({
            id: acc.name || `acc_${Date.now()}`,
            name: acc.accountName || acc.name?.split('/').pop() || 'Business Account',
            address: acc.postalAddress?.addressLines?.join(', ') || 'Address not available',
            phone: acc.phoneNumber || 'N/A',
            category: acc.type || 'Business',
            rating: 0,
            totalReviews: 0,
            isDemo: false
          }));
          apiStatus = 'available';
        } else {
          // No accounts found - user may not have any businesses
          errorMessage = 'No business accounts found for this Google account.';
          businesses = [{
            id: 'no_accounts',
            name: 'No Businesses Found',
            address: 'Create a business profile on Google to see it here',
            phone: 'N/A',
            category: 'Setup Required',
            website: 'https://business.google.com',
            rating: 0,
            totalReviews: 0,
            isDemo: true
          }];
        }
      } else {
        // API returned error - likely permission issue
        const errorData = await accountsResponse.json().catch(() => ({}));
        errorMessage = errorData.error?.message || 'Business Profile API access denied';
        
        console.log('Business Profile API error:', {
          status: accountsResponse.status,
          error: errorData
        });
        
        // Return demo data with explanation
        businesses = [{
          id: 'api_limited',
          name: userInfo.email || 'Connected Account',
          address: 'Business Profile API requires additional approval from Google',
          phone: 'N/A',
          category: 'Limited Access',
          website: 'https://developers.google.com/my-business/content/prereqs',
          rating: 0,
          totalReviews: 0,
          isDemo: true,
          userEmail: userInfo.email,
          userName: userInfo.name
        }];
      }
    } catch (apiError: any) {
      console.log('API call failed:', apiError.message);
      errorMessage = apiError.message;
      
      businesses = [{
        id: 'api_error',
        name: userInfo.email || 'Connected Account',
        address: 'Unable to fetch business data. API may require additional permissions.',
        phone: 'N/A',
        category: 'Limited Access',
        website: 'https://console.cloud.google.com/apis/library',
        rating: 0,
        totalReviews: 0,
        isDemo: true,
        userEmail: userInfo.email,
        userName: userInfo.name
      }];
    }
    
    return NextResponse.json({
      success: true,
      businesses,
      apiStatus,
      userInfo,
      errorMessage,
      message: apiStatus === 'available' 
        ? 'Business listings fetched successfully'
        : 'Limited API access. Enable Business Profile API for full functionality.'
    });
    
  } catch (error: any) {
    console.error('Error fetching businesses:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      businesses: DEMO_BUSINESSES,
      apiStatus: 'error',
      message: 'Failed to fetch business listings. Please try reconnecting.'
    });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accessToken = searchParams.get('access_token');
  
  if (!accessToken) {
    return NextResponse.json({
      success: false,
      error: 'Access token required',
      hint: 'Provide access_token as query parameter'
    });
  }
  
  // Redirect to POST handler logic
  return POST(new NextRequest(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken })
  }));
}

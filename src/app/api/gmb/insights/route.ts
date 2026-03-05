import { NextResponse, NextRequest } from "next/server";

/**
 * Google Business Profile - Fetch Real Business Insights
 * 
 * This endpoint fetches real insights for a specific business location
 * using the stored access token.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accessToken, businessId, accountName } = body;
    
    if (!accessToken || !businessId) {
      return NextResponse.json({
        success: false,
        error: 'Access token and business ID required'
      }, { status: 400 });
    }
    
    // Fetch real insights from Google Business Profile API
    let insights: any = null;
    let rating = 0;
    let totalReviews = 0;
    
    try {
      // Get location details including rating and reviews
      const locationDetailUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${businessId}?readMask=name,title,metadata`;
      const locationDetailResponse = await fetch(locationDetailUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      
      if (locationDetailResponse.ok) {
        const locationDetail = await locationDetailResponse.json();
        rating = locationDetail.metadata?.averageRating || 0;
        totalReviews = locationDetail.metadata?.totalReviewCount || 0;
      }
      
      // Get insights if account name is provided
      if (accountName) {
        const insightsUrl = `https://mybusiness.googleapis.com/v4/${accountName}/locations:reportInsights`;
        const insightsResponse = await fetch(insightsUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            locationNames: [businessId],
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
          
          if (insightsData.locationMetrics && insightsData.locationMetrics.length > 0) {
            const metrics = insightsData.locationMetrics[0]?.metricValues || [];
            insights = {
              views: 0,
              searches: 0,
              directionRequests: 0,
              callClicks: 0,
              websiteClicks: 0
            };
            
            for (const m of metrics) {
              const val = m.totalValue?.value || 0;
              if (m.metric === 'VIEWS_MAPS' || m.metric === 'VIEWS_SEARCH') insights.views += val;
              if (m.metric === 'QUERIES_DIRECT' || m.metric === 'QUERIES_INDIRECT') insights.searches += val;
              if (m.metric === 'ACTIONS_DRIVING_DIRECTIONS') insights.directionRequests = val;
              if (m.metric === 'ACTIONS_PHONE') insights.callClicks = val;
              if (m.metric === 'ACTIONS_WEBSITE') insights.websiteClicks = val;
            }
          }
        }
      }
    } catch (apiError) {
      console.log('API error:', apiError);
    }
    
    // Fetch reviews to get distribution
    let reviewDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    try {
      const reviewsUrl = `https://mybusiness.googleapis.com/v4/${businessId}/reviews`;
      const reviewsResponse = await fetch(reviewsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      
      if (reviewsResponse.ok) {
        const reviewsData = await reviewsResponse.json();
        if (reviewsData.reviews) {
          for (const review of reviewsData.reviews) {
            const starRating = review.starRating;
            if (starRating === 'FIVE') reviewDistribution[5]++;
            else if (starRating === 'FOUR') reviewDistribution[4]++;
            else if (starRating === 'THREE') reviewDistribution[3]++;
            else if (starRating === 'TWO') reviewDistribution[2]++;
            else if (starRating === 'ONE') reviewDistribution[1]++;
          }
        }
      }
    } catch (e) {
      console.log('Could not fetch reviews');
    }
    
    return NextResponse.json({
      success: true,
      insights: insights ? {
        ...insights,
        reviews: {
          total: totalReviews,
          average: rating,
          distribution: reviewDistribution
        }
      } : null,
      rating,
      totalReviews,
      reviewDistribution
    });
    
  } catch (error: any) {
    console.error('Error fetching insights:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accessToken = searchParams.get('accessToken');
  const businessId = searchParams.get('businessId');
  const accountName = searchParams.get('accountName');
  
  return POST(new NextRequest(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, businessId, accountName })
  }));
}

import { NextRequest, NextResponse } from 'next/server';
import { createEmailEngine, sendAdminAlert } from '@/lib/email/engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { alertType, message, details } = body;

    if (!alertType || !message) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: alertType, message',
      }, { status: 400 });
    }

    // Get API key from environment
    const apiKey = process.env.SENDGRID_API_KEY || process.env.EMAIL_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'Email API key not configured',
      }, { status: 400 });
    }

    // Initialize email engine
    createEmailEngine({
      provider: 'sendgrid',
      apiKey,
      fromEmail: process.env.EMAIL_FROM || 'noreply@trafficflow.com',
      fromName: 'TrafficFlow Enterprise',
    });

    // Send admin alert
    const result = await sendAdminAlert(alertType, message, details);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Admin alert email error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

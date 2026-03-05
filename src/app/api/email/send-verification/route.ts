import { NextRequest, NextResponse } from 'next/server';
import { createEmailEngine, sendVerificationEmail } from '@/lib/email/engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, verificationUrl } = body;

    if (!email || !name || !verificationUrl) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: email, name, verificationUrl',
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

    // Send verification email
    const result = await sendVerificationEmail(email, name, verificationUrl);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Verification email error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

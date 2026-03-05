import { NextResponse, NextRequest } from "next/server";

// Password hashing using Web Crypto API
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'trafficflow_salt_v2');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

// Import users store from admin users route
// For serverless, we'll use a shared storage approach
declare global {
  var usersStoreGlobal: Map<string, any> | undefined;
}

// Get or create the global users store
function getUsersStore(): Map<string, any> {
  if (!global.usersStoreGlobal) {
    global.usersStoreGlobal = new Map();
    // Initialize with default admin
    hashPassword('Santafee@@@@@1972').then(hash => {
      global.usersStoreGlobal!.set('user_default_admin', {
        id: 'user_default_admin',
        full_name: 'Ranelsabah Admin',
        username: 'Ranelsabah',
        email: 'admin@trafficflow.io',
        password_hash: hash,
        role: 'admin',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_login: null
      });
    });
  }
  return global.usersStoreGlobal;
}

// Get current user from session
async function getCurrentUser(request: NextRequest): Promise<{ user?: any; error?: string }> {
  try {
    const authHeader = request.headers.get('authorization');
    const sessionToken = authHeader?.replace('Bearer ', '') || request.cookies.get('user_session')?.value;
    
    if (!sessionToken) {
      return { error: 'No session token provided' };
    }
    
    const usersStore = getUsersStore();
    const users = Array.from(usersStore.values());
    const user = users.find((u: any) => 
      u.id === sessionToken || 
      u.username === sessionToken ||
      u.email === sessionToken
    );
    
    if (!user || user.status !== 'active') {
      return { error: 'User not found or inactive' };
    }
    
    return { user };
  } catch (error) {
    return { error: 'Authentication failed' };
  }
}

// ============================================================
// PUT /api/user/change-password - User changes their own password
// ============================================================
export async function PUT(request: NextRequest) {
  try {
    // Get current user
    const { user, error } = await getCurrentUser(request);
    
    if (error || !user) {
      return NextResponse.json({
        success: false,
        error: error || 'Authentication required'
      }, { status: 401 });
    }
    
    const body = await request.json();
    const { current_password, new_password, confirm_password } = body;
    
    // Validate required fields
    if (!current_password || !new_password || !confirm_password) {
      return NextResponse.json({
        success: false,
        error: 'All fields are required: current_password, new_password, confirm_password'
      }, { status: 400 });
    }
    
    // Verify current password
    const isValidPassword = await verifyPassword(current_password, user.password_hash);
    if (!isValidPassword) {
      return NextResponse.json({
        success: false,
        error: 'Current password is incorrect'
      }, { status: 400 });
    }
    
    // Validate new password strength
    if (new_password.length < 8) {
      return NextResponse.json({
        success: false,
        error: 'New password must be at least 8 characters'
      }, { status: 400 });
    }
    
    // Check if new password matches confirmation
    if (new_password !== confirm_password) {
      return NextResponse.json({
        success: false,
        error: 'New password and confirmation do not match'
      }, { status: 400 });
    }
    
    // Prevent reusing the same password
    const samePassword = await verifyPassword(new_password, user.password_hash);
    if (samePassword) {
      return NextResponse.json({
        success: false,
        error: 'New password must be different from current password'
      }, { status: 400 });
    }
    
    // Hash and update password
    const newHash = await hashPassword(new_password);
    const usersStore = getUsersStore();
    
    const updatedUser = {
      ...user,
      password_hash: newHash,
      updated_at: new Date().toISOString(),
      password_changed_at: new Date().toISOString()
    };
    
    usersStore.set(user.id, updatedUser);
    
    return NextResponse.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error: any) {
    console.error('Change password error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to change password',
      details: error.message
    }, { status: 500 });
  }
}

// ============================================================
// GET /api/user/change-password - Get password change requirements
// ============================================================
export async function GET() {
  return NextResponse.json({
    success: true,
    requirements: {
      minLength: 8,
      requireUppercase: false,
      requireLowercase: false,
      requireNumbers: false,
      requireSymbols: false
    },
    message: 'Password must be at least 8 characters long'
  });
}

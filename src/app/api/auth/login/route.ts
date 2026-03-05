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

// Generate session token
function generateSessionToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Global users store - shared with admin/users API
declare global {
  var usersStoreGlobal: Map<string, any> | undefined;
}

function getUsersStore(): Map<string, any> {
  if (!global.usersStoreGlobal) {
    global.usersStoreGlobal = new Map();
  }
  return global.usersStoreGlobal;
}

// Export for sharing with other modules
export { getUsersStore };

// Initialize default admin
async function initializeDefaultAdmin() {
  const usersStore = getUsersStore();
  if (!usersStore.has('user_default_admin')) {
    usersStore.set('user_default_admin', {
      id: 'user_default_admin',
      full_name: 'Ranelsabah Admin',
      username: 'Ranelsabah',
      email: 'admin@trafficflow.io',
      password_hash: await hashPassword('Santafee@@@@@1972'),
      role: 'admin',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login: null
    });
  }
}

// Initialize on module load
initializeDefaultAdmin();

// ============================================================
// POST /api/auth/login - User login
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;
    
    if (!username || !password) {
      return NextResponse.json({
        success: false,
        error: 'Username and password are required'
      }, { status: 400 });
    }
    
    // Find user
    const usersStore = getUsersStore();
    const users = Array.from(usersStore.values());
    const user = users.find((u: any) => 
      u.username.toLowerCase() === username.toLowerCase() ||
      u.email.toLowerCase() === username.toLowerCase()
    );
    
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Invalid username or password'
      }, { status: 401 });
    }
    
    // Check status
    if (user.status !== 'active') {
      return NextResponse.json({
        success: false,
        error: 'Account is disabled. Contact administrator.'
      }, { status: 403 });
    }
    
    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json({
        success: false,
        error: 'Invalid username or password'
      }, { status: 401 });
    }
    
    // Generate session token
    const sessionToken = generateSessionToken();
    
    // Update last login
    user.last_login = new Date().toISOString();
    usersStore.set(user.id, user);
    
    // Return user without password hash
    const { password_hash, ...userSafe } = user;
    
    // Create response with cookie
    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      user: userSafe,
      sessionToken
    });
    
    // Set session cookie
    response.cookies.set('user_session', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });
    
    return response;
    
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({
      success: false,
      error: 'Login failed',
      details: error.message
    }, { status: 500 });
  }
}

// ============================================================
// POST /api/auth/logout - User logout
// ============================================================
export async function DELETE() {
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully'
  });
  
  response.cookies.delete('user_session');
  
  return response;
}

// ============================================================
// GET /api/auth/me - Get current user
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('user_session')?.value;
    
    if (!sessionToken) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 });
    }
    
    const usersStore = getUsersStore();
    const user = usersStore.get(sessionToken);
    
    if (!user || user.status !== 'active') {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 });
    }
    
    const { password_hash, ...userSafe } = user;
    
    return NextResponse.json({
      success: true,
      user: userSafe
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Authentication check failed'
    }, { status: 500 });
  }
}

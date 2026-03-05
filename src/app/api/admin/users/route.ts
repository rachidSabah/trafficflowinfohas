import { NextResponse, NextRequest } from "next/server";

// ============================================================
// USER MANAGEMENT DATABASE (Serverless-friendly using KV or memory)
// In production, replace with actual database (PostgreSQL, MongoDB, etc.)
// ============================================================

// Password hashing using Web Crypto API (works in serverless)
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

// Generate unique ID
function generateId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Generate CSRF token
function generateCSRFToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// In-memory user store (persists during serverless function lifetime)
// Shared with auth/login API via global variable
declare global {
  var usersStoreGlobal: Map<string, any> | undefined;
}

function getUsersStore(): Map<string, any> {
  if (!global.usersStoreGlobal) {
    global.usersStoreGlobal = new Map();
  }
  return global.usersStoreGlobal;
}

let csrfTokens: Set<string> = new Set();

// Initialize with default admin if empty
async function initializeStore() {
  const store = getUsersStore();
  if (store.size === 0) {
    const defaultAdmin = {
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
    };
    store.set(defaultAdmin.id, defaultAdmin);
  }
}

// Admin verification middleware
async function verifyAdmin(request: NextRequest): Promise<{ authorized: boolean; user?: any; error?: string }> {
  try {
    const authHeader = request.headers.get('authorization');
    const sessionToken = authHeader?.replace('Bearer ', '') || request.cookies.get('admin_session')?.value;
    
    if (!sessionToken) {
      return { authorized: false, error: 'No session token provided' };
    }
    
    // Find user by session token (in production, use proper session management)
    const store = getUsersStore();
    const users = Array.from(store.values());
    const adminUser = users.find((u: any) => u.id === sessionToken || u.username === sessionToken);
    
    if (!adminUser || adminUser.role !== 'admin' || adminUser.status !== 'active') {
      return { authorized: false, error: 'Unauthorized: Admin access required' };
    }
    
    return { authorized: true, user: adminUser };
  } catch (error) {
    return { authorized: false, error: 'Authentication failed' };
  }
}

// CSRF validation
function validateCSRF(request: NextRequest): boolean {
  const csrfToken = request.headers.get('x-csrf-token');
  return csrfToken ? csrfTokens.has(csrfToken) : false;
}

// Add CSRF token
function addCSRFToken(token: string) {
  csrfTokens.add(token);
  // Clean old tokens (keep last 1000)
  if (csrfTokens.size > 1000) {
    const tokensArray = Array.from(csrfTokens);
    csrfTokens = new Set(tokensArray.slice(-500));
  }
}

// Initialize on module load
initializeStore();

// ============================================================
// GET /api/admin/users - List all users (Admin only)
// ============================================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  
  // CSRF token generation
  if (action === 'csrf') {
    const token = generateCSRFToken();
    addCSRFToken(token);
    return NextResponse.json({
      success: true,
      csrfToken: token
    });
  }
  
  // Verify admin access
  const auth = await verifyAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({
      success: false,
      error: auth.error
    }, { status: 401 });
  }
  
  // Get single user
  const userId = searchParams.get('id');
  const store = getUsersStore();
  if (userId) {
    const user = store.get(userId);
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 });
    }
    
    // Return user without password hash
    const { password_hash, ...userSafe } = user;
    return NextResponse.json({
      success: true,
      user: userSafe
    });
  }
  
  // List all users with pagination, search, sorting
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const search = searchParams.get('search') || '';
  const sortBy = searchParams.get('sortBy') || 'created_at';
  const sortOrder = searchParams.get('sortOrder') || 'desc';
  
  let users = Array.from(store.values());
  
  // Search filter
  if (search) {
    const searchLower = search.toLowerCase();
    users = users.filter((u: any) => 
      u.full_name?.toLowerCase().includes(searchLower) ||
      u.username?.toLowerCase().includes(searchLower) ||
      u.email?.toLowerCase().includes(searchLower)
    );
  }
  
  // Sorting
  users.sort((a: any, b: any) => {
    let aVal = a[sortBy] || '';
    let bVal = b[sortBy] || '';
    
    if (sortBy === 'created_at' || sortBy === 'updated_at') {
      aVal = new Date(aVal).getTime();
      bVal = new Date(bVal).getTime();
    }
    
    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });
  
  // Pagination
  const total = users.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const paginatedUsers = users.slice(offset, offset + limit);
  
  // Remove password hashes from response
  const safeUsers = paginatedUsers.map((u: any) => {
    const { password_hash, ...safe } = u;
    return safe;
  });
  
  return NextResponse.json({
    success: true,
    users: safeUsers,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages
    }
  });
}

// ============================================================
// POST /api/admin/users - Create new user (Admin only)
// ============================================================
export async function POST(request: NextRequest) {
  // Verify admin access
  const auth = await verifyAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({
      success: false,
      error: auth.error
    }, { status: 401 });
  }
  
  try {
    const body = await request.json();
    const { full_name, username, email, password, status, role } = body;
    
    // Validate required fields
    if (!full_name || !username || !email || !password) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: full_name, username, email, password'
      }, { status: 400 });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid email format'
      }, { status: 400 });
    }
    
    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json({
        success: false,
        error: 'Password must be at least 8 characters'
      }, { status: 400 });
    }
    
    // Check for duplicate username or email
    const store = getUsersStore();
    const users = Array.from(store.values());
    if (users.some((u: any) => u.username.toLowerCase() === username.toLowerCase())) {
      return NextResponse.json({
        success: false,
        error: 'Username already exists'
      }, { status: 409 });
    }
    if (users.some((u: any) => u.email.toLowerCase() === email.toLowerCase())) {
      return NextResponse.json({
        success: false,
        error: 'Email already exists'
      }, { status: 409 });
    }
    
    // Create user
    const userId = generateId();
    const hashedPassword = await hashPassword(password);
    
    const newUser = {
      id: userId,
      full_name,
      username,
      email,
      password_hash: hashedPassword,
      role: role || 'user',
      status: status || 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login: null,
      created_by: auth.user?.id || 'system'
    };
    
    store.set(userId, newUser);
    
    // Return user without password hash
    const { password_hash, ...userSafe } = newUser;
    
    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      user: userSafe
    }, { status: 201 });
    
  } catch (error: any) {
    console.error('Create user error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create user',
      details: error.message
    }, { status: 500 });
  }
}

// ============================================================
// PUT /api/admin/users - Update user (Admin only)
// ============================================================
export async function PUT(request: NextRequest) {
  // Verify admin access
  const auth = await verifyAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({
      success: false,
      error: auth.error
    }, { status: 401 });
  }
  
  try {
    const body = await request.json();
    const { id, full_name, username, email, password, status, role } = body;
    
    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'User ID is required'
      }, { status: 400 });
    }
    
    const store = getUsersStore();
    const existingUser = store.get(id);
    if (!existingUser) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 });
    }
    
    // Check for duplicate username/email (excluding current user)
    const users = Array.from(store.values());
    if (username && username.toLowerCase() !== existingUser.username.toLowerCase()) {
      if (users.some((u: any) => u.id !== id && u.username.toLowerCase() === username.toLowerCase())) {
        return NextResponse.json({
          success: false,
          error: 'Username already exists'
        }, { status: 409 });
      }
    }
    if (email && email.toLowerCase() !== existingUser.email.toLowerCase()) {
      if (users.some((u: any) => u.id !== id && u.email.toLowerCase() === email.toLowerCase())) {
        return NextResponse.json({
          success: false,
          error: 'Email already exists'
        }, { status: 409 });
      }
    }
    
    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid email format'
        }, { status: 400 });
      }
    }
    
    // Validate password strength if provided
    if (password && password.length < 8) {
      return NextResponse.json({
        success: false,
        error: 'Password must be at least 8 characters'
      }, { status: 400 });
    }
    
    // Prevent demoting last admin
    if (existingUser.role === 'admin' && role && role !== 'admin') {
      const adminCount = users.filter((u: any) => u.role === 'admin' && u.status === 'active').length;
      if (adminCount <= 1) {
        return NextResponse.json({
          success: false,
          error: 'Cannot demote the last admin user'
        }, { status: 400 });
      }
    }
    
    // Prevent disabling last active admin
    if (existingUser.role === 'admin' && status === 'disabled') {
      const activeAdminCount = users.filter((u: any) => u.role === 'admin' && u.status === 'active').length;
      if (activeAdminCount <= 1) {
        return NextResponse.json({
          success: false,
          error: 'Cannot disable the last active admin'
        }, { status: 400 });
      }
    }
    
    // Update user
    const updatedUser = {
      ...existingUser,
      full_name: full_name || existingUser.full_name,
      username: username || existingUser.username,
      email: email || existingUser.email,
      role: role || existingUser.role,
      status: status || existingUser.status,
      password_hash: password ? await hashPassword(password) : existingUser.password_hash,
      updated_at: new Date().toISOString(),
      updated_by: auth.user?.id || 'system'
    };
    
    store.set(id, updatedUser);
    
    // Return user without password hash
    const { password_hash, ...userSafe } = updatedUser;
    
    return NextResponse.json({
      success: true,
      message: 'User updated successfully',
      user: userSafe
    });
    
  } catch (error: any) {
    console.error('Update user error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update user',
      details: error.message
    }, { status: 500 });
  }
}

// ============================================================
// DELETE /api/admin/users - Delete user (Admin only)
// ============================================================
export async function DELETE(request: NextRequest) {
  // Verify admin access
  const auth = await verifyAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({
      success: false,
      error: auth.error
    }, { status: 401 });
  }
  
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User ID is required'
      }, { status: 400 });
    }
    
    const store = getUsersStore();
    const existingUser = store.get(userId);
    if (!existingUser) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 });
    }
    
    // Prevent deleting last admin
    if (existingUser.role === 'admin') {
      const users = Array.from(store.values());
      const adminCount = users.filter((u: any) => u.role === 'admin').length;
      if (adminCount <= 1) {
        return NextResponse.json({
          success: false,
          error: 'Cannot delete the last admin user'
        }, { status: 400 });
      }
    }
    
    // Prevent self-deletion
    if (existingUser.id === auth.user?.id) {
      return NextResponse.json({
        success: false,
        error: 'Cannot delete your own account'
      }, { status: 400 });
    }
    
    store.delete(userId);
    
    return NextResponse.json({
      success: true,
      message: 'User deleted successfully'
    });
    
  } catch (error: any) {
    console.error('Delete user error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete user',
      details: error.message
    }, { status: 500 });
  }
}

// Export for use in other modules
export { hashPassword, verifyPassword, getUsersStore };

// /scripts/auth.js
import { app } from '/scripts/firebase-sdk.js';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';

const auth = getAuth(app);

// State management
let currentUser = null;
let currentClaims = null;
let authReady = false;
let authReadyResolve = null;
const authReadyPromise = new Promise(resolve => { authReadyResolve = resolve; });

// Imitation state (admin QA mode)
let imitationState = null;

// School context cache
let _schoolCtx = null;

// Constants
const IMITATION_STORAGE_KEY = 'imitation';
const DEFAULT_SCHOOL_ID = 'school_001';
const AUTH_TIMEOUT = 10000; // 10 second timeout for auth operations

/**
 * Initialize auth state listener with error handling
 */
onAuthStateChanged(auth, async (user) => {
  try {
    currentUser = user;
    
    if (user) {
      try {
        const tokenResult = await user.getIdTokenResult();
        currentClaims = tokenResult.claims;
        
        // Restore imitation state from localStorage
        loadImitationState();
      } catch (err) {
        console.error('[Auth] Failed to get claims:', err);
        currentClaims = null;
      }
    } else {
      currentClaims = null;
      clearImitationState();
    }
  } catch (err) {
    console.error('[Auth] Error in auth state change handler:', err);
  } finally {
    authReady = true;
    if (authReadyResolve) {
      authReadyResolve();
      authReadyResolve = null;
    }
  }
});

/**
 * Load imitation state from localStorage with validation
 */
function loadImitationState() {
  const stored = localStorage.getItem(IMITATION_STORAGE_KEY);
  if (!stored) return;
  
  try {
    const parsed = JSON.parse(stored);
    
    // Validate structure
    if (parsed && typeof parsed === 'object' && parsed.targetUid && parsed.asRole && parsed.startTime) {
      imitationState = parsed;
      window.dispatchEvent(new CustomEvent('imitation-active', { 
        detail: imitationState 
      }));
    } else {
      throw new Error('Invalid imitation state structure');
    }
  } catch (err) {
    console.warn('[Auth] Invalid imitation state, clearing:', err);
    clearImitationState();
  }
}

/**
 * Clear imitation state from memory and storage
 */
function clearImitationState() {
  imitationState = null;
  localStorage.removeItem(IMITATION_STORAGE_KEY);
}

/**
 * Write audit log for imitation events
 * @param {string} schoolId 
 * @param {Object} entry - Audit entry
 */
async function auditImitation(schoolId, entry) {
  try {
    const { getFirestore, collection, addDoc, serverTimestamp } = await import('firebase/firestore');
    const db = getFirestore();
    
    await addDoc(collection(db, 'schools', schoolId, 'audit_logs'), {
      ts: serverTimestamp(),
      ...entry
    });
  } catch (err) {
    console.error('[Auth] Failed to write imitation audit log:', err);
  }
}

/**
 * Get current authenticated user
 * @returns {Object|null} Firebase user object
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Get current user's custom claims (roles)
 * @returns {Object|null} Claims object with roles array
 */
export function getClaims() {
  return currentClaims;
}

/**
 * Wait for auth to be ready with timeout
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Object>} Resolves with user or throws if not authenticated
 * @throws {Error} If not authenticated or timeout reached
 */
export async function requireAuth(timeout = AUTH_TIMEOUT) {
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Auth timeout')), timeout)
  );
  
  try {
    await Promise.race([authReadyPromise, timeoutPromise]);
    
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    
    return currentUser;
  } catch (err) {
    console.error('[Auth] requireAuth failed:', err);
    throw err;
  }
}

/**
 * Guard a route - redirect if not authenticated or lacking required roles
 * Blocks render by managing [data-app-ready] on body
 * @param {string[]} requiredRoles - Array of role strings (e.g., ['admin', 'teacher'])
 * @param {string} redirectUrl - Where to redirect if auth fails
 */
export async function guardRoute(requiredRoles = [], redirectUrl = '/login.html') {
  // Remove ready state initially to prevent flash of content
  document.body.removeAttribute('data-app-ready');
  
  try {
    // Validate input
    if (!Array.isArray(requiredRoles)) {
      throw new Error('requiredRoles must be an array');
    }
    
    await requireAuth();
    
    // Check roles if specified
    if (requiredRoles.length > 0) {
      const userRoles = currentClaims?.roles || [];
      
      if (!Array.isArray(userRoles)) {
        console.error('[Auth] Invalid roles structure in claims');
        throw new Error('Invalid user roles');
      }
      
      const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));
      
      if (!hasRequiredRole) {
        console.warn('[Auth] User lacks required role:', {
          required: requiredRoles,
          actual: userRoles
        });
        window.location.href = redirectUrl;
        return;
      }
    }
    
    // Auth successful - allow render
    document.body.setAttribute('data-app-ready', 'true');
    console.log('[Auth] Route guard passed');
    
  } catch (err) {
    console.error('[Auth] Route guard failed:', err);
    // Not authenticated or error - redirect to login
    const currentPath = window.location.pathname;
    const returnUrl = currentPath !== redirectUrl ? `?return=${encodeURIComponent(currentPath)}` : '';
    window.location.href = `${redirectUrl}${returnUrl}`;
  }
}

/**
 * Start imitating another user (admin QA mode)
 * @param {string} targetUid - User ID to imitate
 * @param {string} asRole - Role to imitate as
 * @throws {Error} If user is not an admin or invalid parameters
 */
export async function startImitate(targetUid, asRole) {
  // Validate admin permission
  if (!currentClaims?.roles?.includes('admin')) {
    console.error('[Auth] Only admins can imitate');
    throw new Error('Insufficient permissions: admin role required');
  }
  
  // Validate parameters
  if (!targetUid || typeof targetUid !== 'string') {
    throw new Error('Invalid targetUid: must be a non-empty string');
  }
  
  if (!asRole || typeof asRole !== 'string') {
    throw new Error('Invalid asRole: must be a non-empty string');
  }
  
  const startTime = Date.now();
  
  imitationState = { 
    targetUid, 
    asRole,
    startTime
  };
  
  localStorage.setItem(IMITATION_STORAGE_KEY, JSON.stringify(imitationState));
  
  // Dispatch event for UI banner
  window.dispatchEvent(new CustomEvent('imitation-active', { 
    detail: imitationState 
  }));
  
  // Audit log - imitation started
  try {
    const schoolId = currentClaims?.schoolId || DEFAULT_SCHOOL_ID;
    await auditImitation(schoolId, {
      action: 'imitation_started',
      actorId: currentUser.uid,
      targetId: targetUid,
      role: asRole,
      details: {
        targetUid,
        asRole,
        startTime: new Date(startTime).toISOString()
      }
    });
  } catch (err) {
    console.error('[Auth] Failed to audit imitation start:', err);
    // Don't throw - allow imitation to continue
  }
  
  console.log('[Auth] Imitation started:', { targetUid, asRole, startTime });
}

/**
 * Stop imitating
 */
export async function stopImitate() {
  const wasImitating = imitationState !== null;
  
  if (wasImitating) {
    const endTime = Date.now();
    const duration = imitationState.startTime ? endTime - imitationState.startTime : 0;
    const durationMinutes = Math.round(duration / 1000 / 60);
    
    // Audit log - imitation stopped
    try {
      const schoolId = currentClaims?.schoolId || DEFAULT_SCHOOL_ID;
      await auditImitation(schoolId, {
        action: 'imitation_stopped',
        actorId: currentUser.uid,
        targetId: imitationState.targetUid,
        role: imitationState.asRole,
        details: {
          targetUid: imitationState.targetUid,
          asRole: imitationState.asRole,
          startTime: new Date(imitationState.startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          durationMs: duration,
          durationMinutes
        }
      });
    } catch (err) {
      console.error('[Auth] Failed to audit imitation stop:', err);
      // Don't throw - allow stop to continue
    }
    
    console.log('[Auth] Imitation stopped - Duration:', durationMinutes, 'minutes');
  }
  
  clearImitationState();
  
  if (wasImitating) {
    // Dispatch event to remove banner
    window.dispatchEvent(new CustomEvent('imitation-stopped'));
  }
}

/**
 * Get current imitation state
 * @returns {Object|null} { targetUid, asRole, startTime } or null
 */
export function getImitationState() {
  return imitationState;
}

/**
 * Check if currently imitating
 * @returns {boolean}
 */
export function isImitating() {
  return imitationState !== null;
}

/**
 * Get context object for audit logging
 * Includes imitation info if active
 * @returns {Object} { actedBy, asRole, asUserId }
 */
export function getAuditContext() {
  const user = getCurrentUser();
  const claims = getClaims();
  
  if (!user) {
    throw new Error('No authenticated user for audit context');
  }
  
  if (imitationState) {
    return {
      actedBy: user.uid,
      asRole: imitationState.asRole,
      asUserId: imitationState.targetUid
    };
  }
  
  return {
    actedBy: user.uid,
    asRole: claims?.roles?.[0] || 'unknown',
    asUserId: user.uid
  };
}

/**
 * Get school context for the current user
 * Returns cached context or loads from staff profile
 * @param {boolean} forceRefresh - Force reload from database
 * @returns {Promise<Object>} { schoolId, user, claims, staff }
 */
export async function getSchoolContext(forceRefresh = false) {
  if (_schoolCtx && !forceRefresh) {
    return _schoolCtx;
  }
  
  const user = getCurrentUser();
  if (!user) {
    throw new Error('No user authenticated');
  }
  
  const claims = getClaims();
  
  try {
    // Import Firestore modules
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');
    const db = getFirestore();
    
    // Try to get schoolId from claims first (preferred method)
    let schoolId = claims?.schoolId;
    let staff = null;
    
    if (schoolId) {
      // SchoolId is in claims, load staff profile
      const staffRef = doc(db, `schools/${schoolId}/staff/${user.uid}`);
      const snap = await getDoc(staffRef);
      
      if (snap.exists()) {
        staff = snap.data();
      } else {
        console.warn('[Auth] Staff profile not found for user in school');
      }
    } else {
      // Fallback: Try default school
      // TODO: In production, this should query across schools or error
      console.warn('[Auth] No schoolId in claims, using fallback');
      schoolId = DEFAULT_SCHOOL_ID;
      
      const staffRef = doc(db, `schools/${schoolId}/staff/${user.uid}`);
      const snap = await getDoc(staffRef);
      
      if (snap.exists()) {
        staff = snap.data();
        schoolId = staff.schoolId || schoolId;
      } else {
        throw new Error('Staff record not found. Please contact your administrator.');
      }
    }
    
    _schoolCtx = { schoolId, user, claims, staff };
    console.log('[Auth] School context loaded:', { schoolId, hasStaff: !!staff });
    
    return _schoolCtx;
  } catch (err) {
    console.error('[Auth] Failed to get school context:', err);
    throw err;
  }
}

/**
 * Clear school context cache
 * Useful for testing or when user data changes
 */
export function clearSchoolContext() {
  _schoolCtx = null;
  console.log('[Auth] School context cache cleared');
}

/**
 * Sign in with email and password
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<UserCredential>}
 * @throws {Error} If credentials are invalid or network error
 */
export async function signIn(email, password) {
  // Validate inputs
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new Error('Invalid email address');
  }
  
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new Error('Invalid password');
  }
  
  try {
    console.log('[Auth] Attempting sign in...');
    const result = await signInWithEmailAndPassword(auth, email, password);
    console.log('[Auth] Sign in successful');
    return result;
  } catch (err) {
    console.error('[Auth] Sign in failed:', err.code);
    
    // Provide user-friendly error messages
    switch (err.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        throw new Error('Invalid email or password');
      case 'auth/too-many-requests':
        throw new Error('Too many failed attempts. Please try again later.');
      case 'auth/network-request-failed':
        throw new Error('Network error. Please check your connection.');
      default:
        throw new Error('Sign in failed. Please try again.');
    }
  }
}

/**
 * Sign out current user
 * Clears all cached data and imitation state
 * @returns {Promise<void>}
 */
export async function signOutUser() {
  try {
    console.log('[Auth] Signing out...');
    await stopImitate(); // This will now log the audit trail
    clearSchoolContext();
    await signOut(auth);
    console.log('[Auth] Sign out successful');
  } catch (err) {
    console.error('[Auth] Sign out failed:', err);
    // Still clear local state even if Firebase sign out fails
    await stopImitate();
    clearSchoolContext();
    throw err;
  }
}

/**
 * Refresh user's ID token to get updated claims
 * @param {boolean} forceRefresh - Force token refresh
 * @returns {Promise<Object>} Updated claims
 */
export async function refreshClaims(forceRefresh = true) {
  const user = getCurrentUser();
  if (!user) {
    throw new Error('No authenticated user');
  }
  
  try {
    const tokenResult = await user.getIdTokenResult(forceRefresh);
    currentClaims = tokenResult.claims;
    console.log('[Auth] Claims refreshed');
    return currentClaims;
  } catch (err) {
    console.error('[Auth] Failed to refresh claims:', err);
    throw err;
  }
}

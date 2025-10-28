// /scripts/data.js
import { app } from '/scripts/firebase-sdk.js';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  addDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  writeBatch,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

const db = getFirestore(app);

// Constants
const TIMEZONE = 'America/Detroit';
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

// Audit entry validation
const ALLOWED_AUDIT_FIELDS = [
  'action', 'actorId', 'actedBy', 'targetId', 'target', 
  'details', 'role', 'asRole', 'duration', 'error'
];
const MAX_AUDIT_ENTRY_SIZE = 10000; // 10KB max per audit entry
const MAX_DETAILS_SIZE = 5000; // 5KB max for details object

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxAttempts - Maximum retry attempts
 * @param {number} delay - Initial delay in ms
 * @returns {Promise<any>}
 */
async function retryWithBackoff(fn, maxAttempts = MAX_RETRY_ATTEMPTS, delay = RETRY_DELAY) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) {
        throw err;
      }
      
      // Don't retry on certain errors
      if (err.code === 'permission-denied' || err.code === 'not-found') {
        throw err;
      }
      
      console.warn(`[Data] Retry attempt ${attempt}/${maxAttempts} after error:`, err.message);
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
}

/**
 * Validate Firestore document reference parameters
 * @param {string} schoolId 
 * @param {string} docId 
 * @throws {Error} If parameters are invalid
 */
function validateDocParams(schoolId, docId = null) {
  if (!schoolId || typeof schoolId !== 'string') {
    throw new Error('Invalid schoolId: must be a non-empty string');
  }
  
  if (docId !== null && (!docId || typeof docId !== 'string')) {
    throw new Error('Invalid document ID: must be a non-empty string');
  }
}

/**
 * Sanitize object to prevent prototype pollution
 * @param {Object} obj - Object to sanitize
 * @returns {Object} - Sanitized object
 */
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  const sanitized = {};
  
  for (const key in obj) {
    // Skip prototype-polluting keys
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
  }
  
  return sanitized;
}

/**
 * Validate and sanitize audit entry
 * @param {Object} entry - Audit entry to validate
 * @returns {Object} - Sanitized entry
 * @throws {Error} If entry is invalid
 */
function validateAuditEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Audit entry must be an object');
  }
  
  // Check required fields
  if (!entry.action || typeof entry.action !== 'string') {
    throw new Error('Audit entry must have an "action" field');
  }
  
  if (!entry.actorId && !entry.actedBy) {
    throw new Error('Audit entry must have "actorId" or "actedBy" field');
  }
  
  // Whitelist fields
  const sanitized = {};
  
  for (const key of ALLOWED_AUDIT_FIELDS) {
    if (entry.hasOwnProperty(key)) {
      sanitized[key] = entry[key];
    }
  }
  
  // Sanitize nested objects to prevent prototype pollution
  if (sanitized.details && typeof sanitized.details === 'object') {
    sanitized.details = sanitizeObject(sanitized.details);
    
    // Check details size
    const detailsSize = JSON.stringify(sanitized.details).length;
    if (detailsSize > MAX_DETAILS_SIZE) {
      // Truncate details if too large
      sanitized.details = { 
        _truncated: true, 
        _size: detailsSize,
        summary: 'Details truncated due to size limit'
      };
    }
  }
  
  // Check total entry size
  const entrySize = JSON.stringify(sanitized).length;
  if (entrySize > MAX_AUDIT_ENTRY_SIZE) {
    throw new Error(`Audit entry too large: ${entrySize} bytes (max ${MAX_AUDIT_ENTRY_SIZE})`);
  }
  
  return sanitized;
}

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Get today's date key in YYYY-MM-DD format (America/Detroit timezone)
 * @param {Date} date - Date object (defaults to now)
 * @returns {string} YYYY-MM-DD
 */
export function getTodayKey(date = new Date()) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { 
      timeZone: TIMEZONE, 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
    
    const parts = fmt.formatToParts(date).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
    
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch (err) {
    console.error('[Data] Failed to get today key:', err);
    // Fallback to UTC-based date
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Get week boundaries for a given date
 * @param {Date} date 
 * @returns {Object} { startISO, endISO, key }
 */
export function getWeek(date = new Date()) {
  try {
    const d = new Date(date);
    const dayOfWeek = d.getDay();
    const diff = d.getDate() - dayOfWeek; // Sunday of the week
    
    const sunday = new Date(d);
    sunday.setDate(diff);
    sunday.setHours(0, 0, 0, 0);
    
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(23, 59, 59, 999);
    
    const weekNum = Math.ceil(sunday.getDate() / 7);
    
    return {
      startISO: sunday.toISOString(),
      endISO: saturday.toISOString(),
      key: `${sunday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
    };
  } catch (err) {
    console.error('[Data] Failed to get week:', err);
    throw new Error('Failed to calculate week boundaries');
  }
}

// ============================================================================
// LOADERS
// ============================================================================

/**
 * Load students for a specific teacher
 * @param {string} schoolId 
 * @param {string} teacherId 
 * @returns {Promise<Array>} Array of student documents
 */
export async function loadTeacherStudents(schoolId, teacherId) {
  validateDocParams(schoolId, teacherId);
  
  try {
    console.log('[Data] Loading students for teacher:', teacherId);
    
    const studentsRef = collection(db, 'schools', schoolId, 'students');
    const q = query(studentsRef, where('teacherId', '==', teacherId));
    
    const snapshot = await retryWithBackoff(() => getDocs(q));
    
    const students = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log('[Data] Loaded students:', students.length);
    return students;
  } catch (err) {
    console.error('[Data] Failed to load teacher students:', err);
    throw new Error(`Failed to load students: ${err.message}`);
  }
}

/**
 * Load all students for a specials teacher on a specific day
 * @param {string} schoolId 
 * @param {string} dayCode - e.g., 'A', 'B', 'M', 'F'
 * @param {string} subjectId 
 * @returns {Promise<Array>} Array of students with their plans
 */
export async function loadSpecialsDay(schoolId, dayCode, subjectId) {
  validateDocParams(schoolId);
  
  if (!dayCode || typeof dayCode !== 'string') {
    throw new Error('Invalid dayCode');
  }
  
  try {
    console.log('[Data] Loading specials day:', { dayCode, subjectId });
    
    const studentsRef = collection(db, 'schools', schoolId, 'students');
    const studentsSnapshot = await retryWithBackoff(() => getDocs(studentsRef));
    
    const students = [];
    
    for (const studentDoc of studentsSnapshot.docs) {
      const student = { id: studentDoc.id, ...studentDoc.data() };
      
      if (student.activePlanId) {
        try {
          const planDoc = await getDoc(doc(db, 'schools', schoolId, 'plans', student.activePlanId));
          
          if (planDoc.exists()) {
            const plan = planDoc.data();
            
            // Check if this day code exists in their schedule
            const hasDayCode = plan.schedule?.some(period => 
              period.label === dayCode || period.id === dayCode
            );
            
            if (hasDayCode) {
              students.push({
                ...student,
                plan: { id: planDoc.id, ...plan }
              });
            }
          }
        } catch (err) {
          console.warn('[Data] Failed to load plan for student:', student.id, err);
          // Continue with other students
        }
      }
    }
    
    console.log('[Data] Loaded specials students:', students.length);
    return students;
  } catch (err) {
    console.error('[Data] Failed to load specials day:', err);
    throw new Error(`Failed to load specials day: ${err.message}`);
  }
}

/**
 * Load a specific plan
 * @param {string} schoolId 
 * @param {string} planId 
 * @returns {Promise<Object|null>}
 */
export async function loadPlan(schoolId, planId) {
  validateDocParams(schoolId, planId);
  
  try {
    console.log('[Data] Loading plan:', planId);
    
    const planDoc = await retryWithBackoff(() => 
      getDoc(doc(db, 'schools', schoolId, 'plans', planId))
    );
    
    if (!planDoc.exists()) {
      console.warn('[Data] Plan not found:', planId);
      return null;
    }
    
    return {
      id: planDoc.id,
      ...planDoc.data()
    };
  } catch (err) {
    console.error('[Data] Failed to load plan:', err);
    throw new Error(`Failed to load plan: ${err.message}`);
  }
}

/**
 * Load day data for a specific plan
 * @param {string} schoolId 
 * @param {string} planId 
 * @param {string} dayKey - YYYY-MM-DD
 * @returns {Promise<Object|null>}
 */
export async function loadDay(schoolId, planId, dayKey) {
  validateDocParams(schoolId, planId);
  
  if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    throw new Error('Invalid dayKey format: expected YYYY-MM-DD');
  }
  
  try {
    console.log('[Data] Loading day:', { planId, dayKey });
    
    const dayDoc = await retryWithBackoff(() =>
      getDoc(doc(db, 'schools', schoolId, 'plans', planId, 'days', dayKey))
    );
    
    if (!dayDoc.exists()) {
      console.log('[Data] Day data not found (this is normal for new days)');
      return null;
    }
    
    return dayDoc.data();
  } catch (err) {
    console.error('[Data] Failed to load day:', err);
    throw new Error(`Failed to load day data: ${err.message}`);
  }
}

/**
 * Load school configuration
 * @param {string} schoolId 
 * @returns {Promise<Object|null>}
 */
export async function loadSchool(schoolId) {
  validateDocParams(schoolId);
  
  try {
    console.log('[Data] Loading school:', schoolId);
    
    const schoolDoc = await retryWithBackoff(() =>
      getDoc(doc(db, 'schools', schoolId))
    );
    
    if (!schoolDoc.exists()) {
      console.warn('[Data] School not found:', schoolId);
      return null;
    }
    
    return {
      id: schoolDoc.id,
      ...schoolDoc.data()
    };
  } catch (err) {
    console.error('[Data] Failed to load school:', err);
    throw new Error(`Failed to load school: ${err.message}`);
  }
}

/**
 * Load staff member
 * @param {string} schoolId 
 * @param {string} uid 
 * @returns {Promise<Object|null>}
 */
export async function loadStaff(schoolId, uid) {
  validateDocParams(schoolId, uid);
  
  try {
    console.log('[Data] Loading staff:', uid);
    
    const staffDoc = await retryWithBackoff(() =>
      getDoc(doc(db, 'schools', schoolId, 'staff', uid))
    );
    
    if (!staffDoc.exists()) {
      console.warn('[Data] Staff not found:', uid);
      return null;
    }
    
    return {
      id: staffDoc.id,
      ...staffDoc.data()
    };
  } catch (err) {
    console.error('[Data] Failed to load staff:', err);
    throw new Error(`Failed to load staff: ${err.message}`);
  }
}

/**
 * Load accommodations for a student
 * @param {string} schoolId 
 * @param {string} studentId 
 * @returns {Promise<Object|null>}
 */
export async function loadAccommodations(schoolId, studentId) {
  validateDocParams(schoolId, studentId);
  
  try {
    console.log('[Data] Loading accommodations:', studentId);
    
    const accomDoc = await retryWithBackoff(() =>
      getDoc(doc(db, 'schools', schoolId, 'accommodations', studentId))
    );
    
    if (!accomDoc.exists()) {
      console.log('[Data] No accommodations found for student');
      return null;
    }
    
    return accomDoc.data();
  } catch (err) {
    console.error('[Data] Failed to load accommodations:', err);
    throw new Error(`Failed to load accommodations: ${err.message}`);
  }
}

// ============================================================================
// WRITERS (All include audit logging)
// ============================================================================

/**
 * Save a single matrix cell value
 * @param {string} schoolId 
 * @param {string} planId 
 * @param {string} dayKey 
 * @param {string} periodId 
 * @param {string} goalId 
 * @param {number|boolean} value 
 * @param {Object} ctx - Audit context from auth
 */
export async function saveMatrixCell(schoolId, planId, dayKey, periodId, goalId, value, ctx) {
  validateDocParams(schoolId, planId);
  
  if (!dayKey || !periodId || !goalId) {
    throw new Error('Missing required parameters');
  }
  
  if (typeof value !== 'number' && typeof value !== 'boolean') {
    throw new Error('Value must be a number or boolean');
  }
  
  if (!ctx || !ctx.actedBy) {
    throw new Error('Audit context is required');
  }
  
  try {
    console.log('[Data] Saving matrix cell:', { planId, dayKey, periodId, goalId, value });
    
    const dayRef = doc(db, 'schools', schoolId, 'plans', planId, 'days', dayKey);
    
    // Update the specific cell using dot notation
    await retryWithBackoff(() =>
      setDoc(dayRef, {
        [`matrix.${periodId}.${goalId}`]: value,
        lastModified: serverTimestamp()
      }, { merge: true })
    );
    
    // Recalculate totals
    await recalculateDayTotals(schoolId, planId, dayKey);
    
    // Audit log
    await audit(schoolId, {
      ...ctx,
      action: 'matrix_cell_update',
      target: `${planId}/${dayKey}`,
      details: { periodId, goalId, value }
    });
    
    console.log('[Data] Matrix cell saved successfully');
  } catch (err) {
    console.error('[Data] Failed to save matrix cell:', err);
    throw new Error(`Failed to save matrix cell: ${err.message}`);
  }
}

/**
 * Save a comment (teacher or specials)
 * @param {string} schoolId 
 * @param {string} planId 
 * @param {string} dayKey 
 * @param {string} role - 'teacher' or specials subject ID
 * @param {string} text 
 * @param {Object} ctx 
 */
export async function saveComment(schoolId, planId, dayKey, role, text, ctx) {
  validateDocParams(schoolId, planId);
  
  if (!role || typeof role !== 'string') {
    throw new Error('Invalid role parameter');
  }
  
  if (typeof text !== 'string') {
    throw new Error('Comment text must be a string');
  }
  
  if (!ctx || !ctx.actedBy) {
    throw new Error('Audit context is required');
  }
  
  try {
    console.log('[Data] Saving comment:', { planId, dayKey, role });
    
    const dayRef = doc(db, 'schools', schoolId, 'plans', planId, 'days', dayKey);
    
    const updateData = {
      lastModified: serverTimestamp()
    };
    
    if (role === 'teacher') {
      updateData['comments.teacher'] = text;
    } else {
      updateData[`comments.specials.${role}`] = text;
    }
    
    // Use setDoc with merge to create document if it doesn't exist
    await retryWithBackoff(() =>
      setDoc(dayRef, updateData, { merge: true })
    );
    
    await audit(schoolId, {
      ...ctx,
      action: 'comment_save',
      target: `${planId}/${dayKey}`,
      details: { role, textLength: text.length }
    });
    
    console.log('[Data] Comment saved successfully');
  } catch (err) {
    console.error('[Data] Failed to save comment:', err);
    throw new Error(`Failed to save comment: ${err.message}`);
  }
}

/**
 * Log a custom incident from a button
 * @param {string} schoolId 
 * @param {string} planId 
 * @param {string} dayKey 
 * @param {Object} button - { id, label, colorHex }
 * @param {string} note - Optional note
 * @param {string} source - 'teacher' or 'specials'
 * @param {Object} ctx 
 */
export async function logCustomIncident(schoolId, planId, dayKey, button, note, source, ctx) {
  validateDocParams(schoolId, planId);
  
  if (!button || !button.label) {
    throw new Error('Invalid button object');
  }
  
  if (!source || (source !== 'teacher' && source !== 'specials')) {
    throw new Error('Source must be "teacher" or "specials"');
  }
  
  if (!ctx || !ctx.actedBy) {
    throw new Error('Audit context is required');
  }
  
  try {
    console.log('[Data] Logging incident:', { planId, dayKey, label: button.label });
    
    const dayRef = doc(db, 'schools', schoolId, 'plans', planId, 'days', dayKey);
    
    const incident = {
      id: `inc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      label: button.label,
      colorHex: button.colorHex || '#000000',
      note: note || null,
      ts: Date.now(),
      source
    };
    
    // Load current incidents
    const dayDoc = await getDoc(dayRef);
    const currentIncidents = dayDoc.exists() ? (dayDoc.data().incidents || []) : [];
    
    // Append new incident
    await retryWithBackoff(() =>
      setDoc(dayRef, {
        incidents: [...currentIncidents, incident],
        lastModified: serverTimestamp()
      }, { merge: true })
    );
    
    await audit(schoolId, {
      ...ctx,
      action: 'incident_log',
      target: `${planId}/${dayKey}`,
      details: { label: button.label, source, hasNote: !!note }
    });
    
    console.log('[Data] Incident logged successfully');
  } catch (err) {
    console.error('[Data] Failed to log incident:', err);
    throw new Error(`Failed to log incident: ${err.message}`);
  }
}

/**
 * Recalculate day totals based on matrix data
 * @param {string} schoolId 
 * @param {string} planId 
 * @param {string} dayKey 
 */
async function recalculateDayTotals(schoolId, planId, dayKey) {
  try {
    const planDoc = await getDoc(doc(db, 'schools', schoolId, 'plans', planId));
    if (!planDoc.exists()) {
      console.warn('[Data] Plan not found for recalculation');
      return;
    }
    
    const plan = planDoc.data();
    const dayDoc = await getDoc(doc(db, 'schools', schoolId, 'plans', planId, 'days', dayKey));
    
    if (!dayDoc.exists()) {
      console.warn('[Data] Day not found for recalculation');
      return;
    }
    
    const dayData = dayDoc.data();
    const matrix = dayData.matrix || {};
    
    let totalPoints = 0;
    let totalPossible = 0;
    let amPoints = 0;
    let amPossible = 0;
    let pmPoints = 0;
    let pmPossible = 0;
    
    // Calculate based on plan structure
    for (const period of (plan.schedule || [])) {
      const periodData = matrix[period.id] || {};
      
      for (const goal of (plan.goals || [])) {
        const value = periodData[goal.id];
        
        if (value !== undefined && value !== null) {
          if (goal.kind === 'stepper') {
            const numValue = Number(value);
            totalPoints += numValue;
            totalPossible += 2;
            
            if (period.am) {
              amPoints += numValue;
              amPossible += 2;
            } else {
              pmPoints += numValue;
              pmPossible += 2;
            }
          } else if (goal.kind === 'checkbox') {
            const checkValue = value ? 1 : 0;
            totalPoints += checkValue;
            totalPossible += 1;
            
            if (period.am) {
              amPoints += checkValue;
              amPossible += 1;
            } else {
              pmPoints += checkValue;
              pmPossible += 1;
            }
          }
        }
      }
    }
    
    const totals = {
      pct: totalPossible > 0 ? Math.round((totalPoints / totalPossible) * 100) : 0
    };
    
    if (plan.planType?.includes('AMPM')) {
      totals.amPct = amPossible > 0 ? Math.round((amPoints / amPossible) * 100) : 0;
      totals.pmPct = pmPossible > 0 ? Math.round((pmPoints / pmPossible) * 100) : 0;
    }
    
    await updateDoc(doc(db, 'schools', schoolId, 'plans', planId, 'days', dayKey), {
      totals
    });
    
    console.log('[Data] Totals recalculated:', totals);
  } catch (err) {
    console.error('[Data] Failed to recalculate totals:', err);
    // Don't throw - this is a background calculation
  }
}

/**
 * Set school theme
 * @param {string} schoolId 
 * @param {Object} theme - { mode, vars }
 */
export async function setTheme(schoolId, theme) {
  validateDocParams(schoolId);
  
  if (!theme || typeof theme !== 'object') {
    throw new Error('Invalid theme object');
  }
  
  try {
    console.log('[Data] Updating school theme');
    
    await retryWithBackoff(() =>
      updateDoc(doc(db, 'schools', schoolId), {
        theme,
        lastModified: serverTimestamp()
      })
    );
    
    console.log('[Data] Theme updated successfully');
  } catch (err) {
    console.error('[Data] Failed to set theme:', err);
    throw new Error(`Failed to set theme: ${err.message}`);
  }
}

/**
 * Audit log helper with validation and fallback
 * @param {string} schoolId 
 * @param {Object} entry - Audit entry
 */
export async function audit(schoolId, entry) {
  validateDocParams(schoolId);
  
  try {
    // Validate and sanitize entry
    const sanitized = validateAuditEntry(entry);
    
    // Try to write to audit_logs collection
    await addDoc(collection(db, 'schools', schoolId, 'audit_logs'), {
      ts: serverTimestamp(),
      ...sanitized
    });
    
  } catch (err) {
    console.error('[Data] Failed to write audit log:', err);
    
    // Fallback: Write to _audit_errors collection
    try {
      await addDoc(collection(db, 'schools', schoolId, '_audit_errors'), {
        ts: serverTimestamp(),
        error: err.message,
        originalEntry: entry,
        stack: err.stack
      });
    } catch (fallbackErr) {
      console.error('[Data] Failed to write to audit errors fallback:', fallbackErr);
    }
  }
}

// ============================================================================
// DEMO SEEDING
// ============================================================================

/**
 * Seed demo data for testing
 * @param {string} schoolId 
 * @param {Object} options - { seed: number, specialsMode: 'AE'|'MF' }
 * @returns {Promise<Object>} Summary of created data
 */
export async function seedDemo(schoolId, options = {}) {
  validateDocParams(schoolId);
  
  const { seed = 1337, specialsMode = 'AE' } = options;
  
  try {
    console.log('[Data] Seeding demo data...', { schoolId, specialsMode });
    
    const rng = seededRandom(seed);
    const batch = writeBatch(db);
    
    // Student names and settings
    const studentNames = [
      'Emma Johnson', 'Liam Smith', 'Olivia Brown', 'Noah Davis', 'Ava Wilson',
      'Ethan Martinez', 'Sophia Anderson', 'Mason Taylor', 'Isabella Moore', 'Lucas Jackson'
    ];
    
    const grades = ['3rd', '4th', '5th'];
    const teacherIds = ['teacher_001', 'teacher_002'];
    const studentIds = [];
    
    // Create schedule based on mode
    const schedule = specialsMode === 'AE' 
      ? [
          { id: 'A1', label: 'A', am: true },
          { id: 'A2', label: 'A', am: false },
          { id: 'B1', label: 'B', am: true },
          { id: 'B2', label: 'B', am: false },
          { id: 'C1', label: 'C', am: true },
          { id: 'C2', label: 'C', am: false },
          { id: 'D1', label: 'D', am: true },
          { id: 'D2', label: 'D', am: false },
          { id: 'E1', label: 'E', am: true },
          { id: 'E2', label: 'E', am: false }
        ]
      : [
          { id: 'M1', label: 'M', am: true },
          { id: 'M2', label: 'M', am: false },
          { id: 'T1', label: 'T', am: true },
          { id: 'T2', label: 'T', am: false },
          { id: 'W1', label: 'W', am: true },
          { id: 'W2', label: 'W', am: false },
          { id: 'TH1', label: 'TH', am: true },
          { id: 'TH2', label: 'TH', am: false },
          { id: 'F1', label: 'F', am: true },
          { id: 'F2', label: 'F', am: false }
        ];
    
    const goals = [
      { id: 'goal_1', label: 'On Task', kind: 'stepper' },
      { id: 'goal_2', label: 'Following Directions', kind: 'stepper' },
      { id: 'goal_3', label: 'Respectful', kind: 'checkbox' }
    ];
    
    // Create students and plans
    for (let i = 0; i < 10; i++) {
      const studentId = `demo_student_${i + 1}`;
      studentIds.push(studentId);
      
      const studentRef = doc(db, 'schools', schoolId, 'students', studentId);
      batch.set(studentRef, {
        name: studentNames[i],
        grade: grades[Math.floor(rng() * grades.length)],
        teacherId: teacherIds[Math.floor(rng() * teacherIds.length)],
        activePlanId: `demo_plan_${i + 1}`,
        parentEmails: [`parent${i + 1}@example.com`],
        parentPortalId: `portal_${i + 1}`
      });
      
      // Create plan
      const planRef = doc(db, 'schools', schoolId, 'plans', `demo_plan_${i + 1}`);
      batch.set(planRef, {
        studentId,
        teacherId: teacherIds[Math.floor(rng() * teacherIds.length)],
        active: true,
        planType: 'PercentageAMPM',
        schedule,
        goals,
        incentives: {
          thresholds: [
            { pct: 70, label: 'Bronze Star' },
            { pct: 85, label: 'Silver Star' },
            { pct: 95, label: 'Gold Star' }
          ]
        },
        customButtons: [
          { id: 'btn_1', label: 'Great Job!', colorHex: '#4CAF50' },
          { id: 'btn_2', label: 'Needs Redirect', colorHex: '#FF9800' }
        ],
        accommodations: []
      });
      
      // Create sample week of data
      const today = new Date();
      for (let dayOffset = -7; dayOffset < 0; dayOffset++) {
        const date = new Date(today);
        date.setDate(date.getDate() + dayOffset);
        const dayKey = getTodayKey(date);
        
        const matrix = {};
        for (const period of schedule) {
          matrix[period.id] = {};
          for (const goal of goals) {
            if (goal.kind === 'stepper') {
              matrix[period.id][goal.id] = Math.floor(rng() * 3);
            } else {
              matrix[period.id][goal.id] = rng() > 0.3;
            }
          }
        }
        
        const dayRef = doc(db, 'schools', schoolId, 'plans', `demo_plan_${i + 1}`, 'days', dayKey);
        batch.set(dayRef, {
          matrix,
          totals: { 
            pct: 70 + Math.floor(rng() * 25), 
            amPct: 75, 
            pmPct: 80 
          },
          comments: {
            teacher: rng() > 0.5 ? 'Great progress today!' : ''
          },
          incidents: []
        });
      }
    }
    
    await batch.commit();
    
    console.log('[Data] Demo data seeded successfully');
    return { 
      studentsCreated: studentIds.length,
      plansCreated: studentIds.length,
      daysCreated: studentIds.length * 7
    };
  } catch (err) {
    console.error('[Data] Failed to seed demo data:', err);
    throw new Error(`Failed to seed demo data: ${err.message}`);
  }
}

/**
 * Seeded random number generator for reproducible demo data
 * @param {number} seed 
 * @returns {Function}
 */
function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

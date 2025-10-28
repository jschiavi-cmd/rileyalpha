const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp();

// ============================================================================
// RATE LIMITING - IMPROVED FOR ACTUAL USE
// ============================================================================

/**
 * Check rate limit for a specific action
 * @param {string} uid - User ID
 * @param {string} action - Action name
 * @param {number} maxCalls - Max calls allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Promise<boolean>} - True if allowed, false if rate limited
 */
async function checkRateLimit(uid, action, maxCalls, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  const rateLimitRef = admin.firestore().doc(`_rateLimit/${uid}_${action}`);
  
  try {
    const doc = await rateLimitRef.get();
    
    if (!doc.exists) {
      // First call - create document
      await rateLimitRef.set({
        calls: [now],
        lastReset: now
      });
      return true;
    }
    
    const data = doc.data();
    let calls = data.calls || [];
    
    // Remove calls outside the window
    calls = calls.filter(timestamp => timestamp > windowStart);
    
    // Check if limit exceeded
    if (calls.length >= maxCalls) {
      return false;
    }
    
    // Add new call
    calls.push(now);
    
    await rateLimitRef.set({
      calls,
      lastReset: data.lastReset || now
    });
    
    return true;
    
  } catch (error) {
    console.error('Rate limit check error:', error);
    // On error, allow the call (fail open)
    return true;
  }
}

/**
 * Get rate limit based on user role
 * Staff gets higher limits (100/hour), others get lower (10/hour)
 */
function getRateLimitForRole(roles) {
  const staffRoles = ['admin', 'teacher', 'specials', 'achievement'];
  const isStaff = roles && roles.some(role => staffRoles.includes(role));
  
  return {
    maxCalls: isStaff ? 100 : 10,
    windowMs: 60 * 60 * 1000 // 1 hour
  };
}

// ============================================================================
// CUSTOM CLAIMS
// ============================================================================

/**
 * Set custom claims for a user (admin only)
 * Rate limited: 100 calls/hour for staff, 10/hour for others
 */
exports.setCustomClaims = functions.https.onCall(async (data, context) => {
  // Verify caller is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated', 
      'Must be logged in to set claims'
    );
  }

  // Get rate limit based on caller's role
  const callerRoles = context.auth.token.roles || [];
  const rateLimit = getRateLimitForRole(callerRoles);
  
  // Rate limiting
  const allowed = await checkRateLimit(
    context.auth.uid, 
    'setCustomClaims', 
    rateLimit.maxCalls,
    rateLimit.windowMs
  );
  
  if (!allowed) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      `Rate limit exceeded. Maximum ${rateLimit.maxCalls} claim updates per hour.`
    );
  }

  // Verify caller is admin
  const callerClaims = context.auth.token;
  const isAdmin = callerClaims.roles?.includes('admin');
  
  // For first admin setup, allow if no existing claims
  const firstTimeSetup = !callerClaims.roles;
  
  if (!isAdmin && !firstTimeSetup) {
    throw new functions.https.HttpsError(
      'permission-denied', 
      'Only admins can set custom claims'
    );
  }

  const { uid, roles, schoolId } = data;

  // Validate input
  if (!uid || !Array.isArray(roles) || !schoolId) {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      'uid, roles array, and schoolId are required'
    );
  }
  
  // Validate roles are from allowed list
  const allowedRoles = ['admin', 'teacher', 'specials', 'achievement'];
  const invalidRoles = roles.filter(r => !allowedRoles.includes(r));
  
  if (invalidRoles.length > 0) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Invalid roles: ${invalidRoles.join(', ')}`
    );
  }

  try {
    // Set custom claims on the user
    await admin.auth().setCustomUserClaims(uid, { 
      roles, 
      schoolId 
    });

    // Also update staff document
    await admin.firestore()
      .doc(`schools/${schoolId}/staff/${uid}`)
      .set({
        roles,
        schoolId,
        claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: context.auth.uid
      }, { merge: true });

    // Audit log
    await admin.firestore()
      .collection(`schools/${schoolId}/audit_logs`)
      .add({
        ts: admin.firestore.FieldValue.serverTimestamp(),
        action: 'claims_updated',
        actorId: context.auth.uid,
        targetId: uid,
        details: { roles, schoolId }
      });

    return { success: true, message: 'Claims updated successfully' };
    
  } catch (error) {
    console.error('Error setting claims:', error);
    throw new functions.https.HttpsError(
      'internal', 
      'Failed to set custom claims: ' + error.message
    );
  }
});

/**
 * Trigger: When staff document is created/updated
 * Automatically sync custom claims
 */
exports.syncStaffClaims = functions.firestore
  .document('schools/{schoolId}/staff/{uid}')
  .onWrite(async (change, context) => {
    const { schoolId, uid } = context.params;
    
    // If document deleted, skip
    if (!change.after.exists) {
      console.log(`Staff document deleted for ${uid}, skipping claim sync`);
      return null;
    }
    
    const newData = change.after.data();
    const oldData = change.before.exists ? change.before.data() : {};
    
    const roles = newData.roles || [];
    
    // Only sync if roles or schoolId actually changed
    const rolesChanged = JSON.stringify(oldData.roles) !== JSON.stringify(roles);
    const schoolIdChanged = oldData.schoolId !== schoolId;
    
    if (!rolesChanged && !schoolIdChanged && change.before.exists) {
      console.log(`No role/schoolId changes for ${uid}, skipping claim sync`);
      return null;
    }
    
    try {
      // Set custom claims
      await admin.auth().setCustomUserClaims(uid, {
        roles,
        schoolId
      });
      
      console.log(`Claims synced for ${uid}:`, { roles, schoolId });
      return null;
      
    } catch (error) {
      console.error(`Error syncing claims for ${uid}:`, error);
      return null;
    }
  });

// ============================================================================
// GOOGLE SHEETS EXPORT (MANUAL ONLY - FREE)
// ============================================================================

/**
 * Helper to get Google Sheets API client
 * Uses service account credentials stored in Firebase config
 */
async function getSheetsClient() {
  // Get service account from Firebase config or environment
  const serviceAccount = functions.config().sheets?.service_account;
  
  if (!serviceAccount) {
    throw new Error('Google Sheets service account not configured. Run: firebase functions:config:set sheets.service_account="$(cat service-account.json)"');
  }
  
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(serviceAccount),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  
  return google.sheets({ version: 'v4', auth });
}

/**
 * Export behavior data to Google Sheets
 * Manual export triggered by admin
 */
exports.exportBehaviorData = functions.https.onCall(async (data, context) => {
  // Verify authenticated admin
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const callerClaims = context.auth.token;
  if (!callerClaims.roles?.includes('admin')) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  
  const { schoolId, spreadsheetId, startDate, endDate } = data;
  
  if (!schoolId || !spreadsheetId) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId and spreadsheetId required');
  }
  
  try {
    const sheets = await getSheetsClient();
    
    // Query behavior data
    const plansSnapshot = await admin.firestore()
      .collection(`schools/${schoolId}/plans`)
      .where('active', '==', true)
      .get();
    
    const rows = [
      ['Date', 'Student', 'Teacher', 'Period', 'Goal', 'Value', 'Percentage', 'Notes']
    ];
    
    for (const planDoc of plansSnapshot.docs) {
      const plan = planDoc.data();
      
      // Get student info
      let studentName = 'Unknown';
      if (plan.studentId) {
        const studentDoc = await admin.firestore()
          .doc(`schools/${schoolId}/students/${plan.studentId}`)
          .get();
        if (studentDoc.exists) {
          studentName = studentDoc.data().name || 'Unknown';
        }
      }
      
      // Query days
      let daysQuery = admin.firestore()
        .collection(`schools/${schoolId}/plans/${planDoc.id}/days`);
      
      if (startDate) {
        daysQuery = daysQuery.where(admin.firestore.FieldPath.documentId(), '>=', startDate);
      }
      if (endDate) {
        daysQuery = daysQuery.where(admin.firestore.FieldPath.documentId(), '<=', endDate);
      }
      
      const daysSnapshot = await daysQuery.get();
      
      for (const dayDoc of daysSnapshot.docs) {
        const day = dayDoc.data();
        const dateKey = dayDoc.id;
        
        if (day.matrix) {
          for (const [periodId, goals] of Object.entries(day.matrix)) {
            for (const [goalId, value] of Object.entries(goals)) {
              const goal = plan.goals?.find(g => g.id === goalId);
              const goalLabel = goal?.label || goalId;
              
              rows.push([
                dateKey,
                studentName,
                plan.teacherId || '',
                periodId,
                goalLabel,
                value?.toString() || '',
                day.totals?.pct || '',
                day.comments?.teacher || ''
              ]);
            }
          }
        }
      }
    }
    
    // Write to sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'BehaviorData!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: rows
      }
    });
    
    // Audit log
    await admin.firestore()
      .collection(`schools/${schoolId}/audit_logs`)
      .add({
        ts: admin.firestore.FieldValue.serverTimestamp(),
        action: 'export_behavior_data',
        actorId: context.auth.uid,
        details: { 
          spreadsheetId, 
          startDate, 
          endDate, 
          rowsExported: rows.length - 1 
        }
      });
    
    return { 
      success: true, 
      rowsExported: rows.length - 1,
      message: `Exported ${rows.length - 1} behavior records`
    };
    
  } catch (error) {
    console.error('Export behavior data error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Export students list to Google Sheets
 */
exports.exportStudents = functions.https.onCall(async (data, context) => {
  // Verify authenticated admin
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const callerClaims = context.auth.token;
  if (!callerClaims.roles?.includes('admin')) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  
  const { schoolId, spreadsheetId } = data;
  
  if (!schoolId || !spreadsheetId) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId and spreadsheetId required');
  }
  
  try {
    const sheets = await getSheetsClient();
    
    // Query students
    const studentsSnapshot = await admin.firestore()
      .collection(`schools/${schoolId}/students`)
      .get();
    
    const rows = [
      ['Student ID', 'Name', 'Grade', 'Teacher', 'Active Plan', 'Parent Emails', 'Parent Portal ID']
    ];
    
    for (const doc of studentsSnapshot.docs) {
      const student = doc.data();
      
      rows.push([
        doc.id,
        student.name || '',
        student.grade || '',
        student.teacherId || '',
        student.activePlanId || '',
        (student.parentEmails || []).join(', '),
        student.parentPortalId || ''
      ]);
    }
    
    // Write to sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Students!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: rows
      }
    });
    
    // Audit log
    await admin.firestore()
      .collection(`schools/${schoolId}/audit_logs`)
      .add({
        ts: admin.firestore.FieldValue.serverTimestamp(),
        action: 'export_students',
        actorId: context.auth.uid,
        details: { 
          spreadsheetId, 
          studentsExported: rows.length - 1 
        }
      });
    
    return { 
      success: true, 
      studentsExported: rows.length - 1,
      message: `Exported ${rows.length - 1} students`
    };
    
  } catch (error) {
    console.error('Export students error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Export accommodations to Google Sheets
 */
exports.exportAccommodations = functions.https.onCall(async (data, context) => {
  // Verify authenticated admin
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const callerClaims = context.auth.token;
  if (!callerClaims.roles?.includes('admin')) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  
  const { schoolId, spreadsheetId } = data;
  
  if (!schoolId || !spreadsheetId) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId and spreadsheetId required');
  }
  
  try {
    const sheets = await getSheetsClient();
    
    // Query accommodations
    const accommodationsSnapshot = await admin.firestore()
      .collection(`schools/${schoolId}/accommodations`)
      .get();
    
    const rows = [
      ['Student ID', 'Student Name', 'Accommodation', 'Notes', 'Created At']
    ];
    
    for (const doc of accommodationsSnapshot.docs) {
      const accommodation = doc.data();
      const studentId = doc.id;
      
      // Get student name
      let studentName = 'Unknown';
      const studentDoc = await admin.firestore()
        .doc(`schools/${schoolId}/students/${studentId}`)
        .get();
      if (studentDoc.exists) {
        studentName = studentDoc.data().name || 'Unknown';
      }
      
      rows.push([
        studentId,
        studentName,
        accommodation.accommodation || '',
        accommodation.notes || '',
        accommodation.createdAt?.toDate().toISOString() || ''
      ]);
    }
    
    // Write to sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Accommodations!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: rows
      }
    });
    
    // Audit log
    await admin.firestore()
      .collection(`schools/${schoolId}/audit_logs`)
      .add({
        ts: admin.firestore.FieldValue.serverTimestamp(),
        action: 'export_accommodations',
        actorId: context.auth.uid,
        details: { 
          spreadsheetId, 
          accommodationsExported: rows.length - 1 
        }
      });
    
    return { 
      success: true, 
      accommodationsExported: rows.length - 1,
      message: `Exported ${rows.length - 1} accommodations`
    };
    
  } catch (error) {
    console.error('Export accommodations error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

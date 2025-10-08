// Firebase Cloud Functions
// File: functions/index.js

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp();
const db = admin.firestore();

// ========================================
// 1. WEEKLY GOOGLE DRIVE BACKUP
// ========================================
exports.weeklyBackup = functions.pubsub
  .schedule('every sunday 23:00')
  .timeZone('America/Detroit')
  .onRun(async (context) => {
    console.log('Starting weekly backup...');
    
    try {
      // Get school config for Drive folder ID
      const schoolConfig = await db.collection('school_config').doc('lincoln-elementary').get();
      const driveFolderId = schoolConfig.data().googleDriveBackupFolderId;
      
      if (!driveFolderId) {
        console.error('No Google Drive folder configured');
        return;
      }
      
      // Get current week dates
      const now = new Date();
      const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
      const weekEnd = new Date(now.setDate(now.getDate() - now.getDay() + 6));
      
      // Export behavior data
      await exportBehaviorData(driveFolderId, weekStart, weekEnd);
      
      // Export accommodation logs
      await exportAccommodationLogs(driveFolderId, weekStart, weekEnd);
      
      console.log('Weekly backup completed successfully');
    } catch (error) {
      console.error('Backup failed:', error);
    }
  });

async function exportBehaviorData(folderId, weekStart, weekEnd) {
  const scores = await db.collection('scores')
    .where('timestamp', '>=', weekStart)
    .where('timestamp', '<=', weekEnd)
    .get();
  
  const incidents = await db.collection('behavior_incidents')
    .where('timestamp', '>=', weekStart)
    .where('timestamp', '<=', weekEnd)
    .get();
  
  // Create CSV content
  let csvContent = 'Date,Student,Teacher,Subject,Goal,Score,Type\n';
  
  scores.forEach(doc => {
    const data = doc.data();
    Object.entries(data.scores).forEach(([goal, score]) => {
      csvContent += `"${data.date}","${data.studentId}","${data.teacherName}","${data.subject}","${goal}","${score}","score"\n`;
    });
  });
  
  incidents.forEach(doc => {
    const data = doc.data();
    csvContent += `"${data.date}","${data.studentId}","${data.teacherName}","","${data.behavior}","","incident"\n`;
  });
  
  // Upload to Google Drive
  const fileName = `behavior_data_week_${formatDate(weekStart)}_to_${formatDate(weekEnd)}.csv`;
  await uploadToDrive(folderId, fileName, csvContent, 'text/csv');
}

async function exportAccommodationLogs(folderId, weekStart, weekEnd) {
  const logs = await db.collection('accommodations_log')
    .where('timestamp', '>=', weekStart)
    .where('timestamp', '<=', weekEnd)
    .get();
  
  let csvContent = 'Week,Student,Teacher,Accommodation,Status,Notes\n';
  
  logs.forEach(doc => {
    const data = doc.data();
    Object.entries(data.accommodations).forEach(([accommodation, status]) => {
      csvContent += `"${data.week}","${data.studentId}","${data.teacherName}","${accommodation}","${status}","${data.notes || ''}"\n`;
    });
  });
  
  const fileName = `accommodation_logs_week_${formatDate(weekStart)}_to_${formatDate(weekEnd)}.csv`;
  await uploadToDrive(folderId, fileName, csvContent, 'text/csv');
}

async function uploadToDrive(folderId, fileName, content, mimeType) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive.file']
  });
  
  const drive = google.drive({ version: 'v3', auth });
  
  const fileMetadata = {
    name: fileName,
    parents: [folderId]
  };
  
  const media = {
    mimeType: mimeType,
    body: content
  };
  
  await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id'
  });
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// ========================================
// 2. PARENT ACCOUNT CREATION
// ========================================
exports.createParentAccount = functions.firestore
  .document('students/{studentId}')
  .onCreate(async (snap, context) => {
    const student = snap.data();
    const parentEmails = student.parentEmails || [];
    
    console.log(`Creating parent accounts for ${student.name}`);
    
    for (const email of parentEmails) {
      try {
        // Check if user already exists
        let userRecord;
        try {
          userRecord = await admin.auth().getUserByEmail(email);
          console.log(`Parent account already exists: ${email}`);
        } catch (error) {
          // User doesn't exist, create them
          const tempPassword = generateTempPassword();
          
          userRecord = await admin.auth().createUser({
            email: email,
            password: tempPassword,
            emailVerified: false
          });
          
          console.log(`Created parent account: ${email}`);
          
          // Send password setup email (you'll need to set up email service)
          await sendPasswordSetupEmail(email, tempPassword, student.name);
        }
        
        // Create/update user profile in Firestore
        await db.collection('users').doc(userRecord.uid).set({
          email: email,
          role: 'parent',
          assignedStudents: admin.firestore.FieldValue.arrayUnion(context.params.studentId),
          schoolId: 'lincoln-elementary',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          needsPasswordReset: true
        }, { merge: true });
        
      } catch (error) {
        console.error(`Failed to create parent account for ${email}:`, error);
      }
    }
  });

// Update parent access when student's parentEmails change
exports.updateParentAccess = functions.firestore
  .document('students/{studentId}')
  .onUpdate(async (change, context) => {
    const oldData = change.before.data();
    const newData = change.after.data();
    
    const oldEmails = oldData.parentEmails || [];
    const newEmails = newData.parentEmails || [];
    
    // Find added emails
    const addedEmails = newEmails.filter(e => !oldEmails.includes(e));
    
    // Add new parents
    for (const email of addedEmails) {
      try {
        const userRecord = await admin.auth().getUserByEmail(email).catch(() => null);
        
        if (userRecord) {
          await db.collection('users').doc(userRecord.uid).update({
            assignedStudents: admin.firestore.FieldValue.arrayUnion(context.params.studentId)
          });
        } else {
          // Create new parent account (same logic as above)
          const tempPassword = generateTempPassword();
          const newUser = await admin.auth().createUser({
            email: email,
            password: tempPassword,
            emailVerified: false
          });
          
          await db.collection('users').doc(newUser.uid).set({
            email: email,
            role: 'parent',
            assignedStudents: [context.params.studentId],
            schoolId: 'lincoln-elementary',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            needsPasswordReset: true
          });
          
          await sendPasswordSetupEmail(email, tempPassword, newData.name);
        }
      } catch (error) {
        console.error(`Failed to update parent access for ${email}:`, error);
      }
    }
  });

// ========================================
// 3. AUDIT LOGGING (FERPA Compliance)
// ========================================
exports.logParentAccess = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  const { studentId, action } = data;
  
  await db.collection('audit_logs').add({
    userId: context.auth.uid,
    userEmail: context.auth.token.email,
    action: action,
    studentId: studentId,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    ipAddress: context.rawRequest.ip,
    userAgent: context.rawRequest.headers['user-agent']
  });
  
  return { success: true };
});

// ========================================
// 4. MANUAL BACKUP TRIGGER
// ========================================
exports.triggerManualBackup = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }
  
  // Check if user is admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (userDoc.data().role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  // Trigger backup
  const { startDate, endDate } = data;
  const schoolConfig = await db.collection('school_config').doc('lincoln-elementary').get();
  const driveFolderId = schoolConfig.data().googleDriveBackupFolderId;
  
  await exportBehaviorData(driveFolderId, new Date(startDate), new Date(endDate));
  await exportAccommodationLogs(driveFolderId, new Date(startDate), new Date(endDate));
  
  return { success: true, message: 'Backup completed' };
});

// ========================================
// HELPER FUNCTIONS
// ========================================
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function sendPasswordSetupEmail(email, tempPassword, studentName) {
  // TODO: Implement email sending (using SendGrid, Firebase Extensions, etc.)
  // For now, just log it
  console.log(`
    ====================================
    PARENT ACCOUNT CREATED
    ====================================
    Email: ${email}
    Temporary Password: ${tempPassword}
    Student: ${studentName}
    
    Please change your password after first login.
    ====================================
  `);
  
  // In production, you'd send an actual email:
  // const sgMail = require('@sendgrid/mail');
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  // 
  // const msg = {
  //   to: email,
  //   from: 'noreply@school.edu',
  //   subject: 'Your Parent Portal Account',
  //   html: `
  //     <h2>Welcome to the Behavior Tracker Parent Portal</h2>
  //     <p>An account has been created for you to view ${studentName}'s behavior data.</p>
  //     <p><strong>Temporary Password:</strong> ${tempPassword}</p>
  //     <p>Please log in and change your password immediately.</p>
  //     <p><a href="https://your-app.web.app">Login Here</a></p>
  //   `
  // };
  // 
  // await sgMail.send(msg);
}

// ========================================
// 5. CLEAN UP OLD DATA (Optional)
// ========================================
exports.cleanupOldData = functions.pubsub
  .schedule('every month')
  .onRun(async (context) => {
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    
    // Archive old scores (move to archive collection)
    const oldScores = await db.collection('scores')
      .where('timestamp', '<', threeYearsAgo)
      .get();
    
    const batch = db.batch();
    let count = 0;
    
    oldScores.forEach(doc => {
      // Copy to archive
      batch.set(db.collection('scores_archive').doc(doc.id), doc.data());
      // Delete from active
      batch.delete(doc.ref);
      count++;
      
      if (count >= 500) {
        // Firestore batch limit
        return;
      }
    });
    
    await batch.commit();
    console.log(`Archived ${count} old score records`);
  });
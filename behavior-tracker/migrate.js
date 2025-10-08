// Migration Script - Run this once to populate Firestore
// File: migrate.js
// Run with: node migrate.js

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Download from Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

// ========================================
// SCHOOL CONFIGURATION
// ========================================
const schoolConfig = {
  name: 'Lincoln Elementary School',
  logoUrl: 'https://via.placeholder.com/150?text=Lincoln+Elementary',
  colorTheme: 'blue',
  address: '123 Main Street, Springfield',
  phone: '(555) 123-4567',
  principal: 'Dr. Sarah Johnson',
  assistantPrincipal: 'Mrs. Emily Rodriguez',
  googleDriveBackupFolderId: '', // Add your Google Drive folder ID here
  createdAt: admin.firestore.FieldValue.serverTimestamp()
};

// ========================================
// STAFF DATA
// ========================================
const staff = {
  admin: [
    { email: 'admin@lincoln.edu', name: 'Admin User', password: 'Admin123!' }
  ],
  achievementTeam: [
    { email: 'achievement1@lincoln.edu', name: 'Mrs. Thompson', password: 'Achieve123!', caseload: [] },
    { email: 'achievement2@lincoln.edu', name: 'Mr. Davis', password: 'Achieve123!', caseload: [] }
  ],
  classroomTeachers: [
    { email: 'stewart@lincoln.edu', name: 'Stewart', password: 'Teacher123!', grade: '3rd' },
    { email: 'bruestle@lincoln.edu', name: 'Bruestle', password: 'Teacher123!', grade: '3rd' },
    { email: 'johnson@lincoln.edu', name: 'Johnson', password: 'Teacher123!', grade: '4th' },
    { email: 'martinez@lincoln.edu', name: 'Martinez', password: 'Teacher123!', grade: '5th' }
  ],
  specialsTeachers: [
    { email: 'chen@lincoln.edu', name: 'Chen', password: 'Teacher123!', subject: 'PE' },
    { email: 'williams@lincoln.edu', name: 'Williams', password: 'Teacher123!', subject: 'Music' },
    { email: 'davis@lincoln.edu', name: 'Davis', password: 'Teacher123!', subject: 'Art' },
    { email: 'rodriguez@lincoln.edu', name: 'Rodriguez', password: 'Teacher123!', subject: 'PLTW' },
    { email: 'thompson@lincoln.edu', name: 'Thompson', password: 'Teacher123!', subject: 'LMC' }
  ],
  supportStaff: [
    { email: 'thompson.case@lincoln.edu', name: 'Mrs. Thompson', password: 'Support123!', role: 'Case Manager' },
    { email: 'johnson.speech@lincoln.edu', name: 'Mrs. Johnson', password: 'Support123!', role: 'Speech Therapist' },
    { email: 'davis.ot@lincoln.edu', name: 'Mr. Davis', password: 'Support123!', role: 'Occupational Therapist' }
  ]
};

// ========================================
// SAMPLE STUDENTS
// ========================================
const students = [
  {
    name: 'Ethan G.',
    grade: '3rd',
    primaryTeacher: 'Stewart',
    switchTeacher: 'Bruestle',
    parentEmails: ['parent.ethan@email.com'],
    supportStaff: ['Mrs. Johnson (Speech)', 'Mr. Davis (OT)'],
    caseManager: 'Mrs. Thompson',
    schedule: [
      'Check-in/Empty Pockets',
      'Homeroom/Morning Meeting',
      'ELA',
      'Special',
      'Math',
      'Lunch/Recess',
      'Science',
      'Social Studies',
      'Wildcat Time'
    ],
    goals: [
      { text: "I will get my teacher's attention", type: '0-2' },
      { text: 'I will accept adult direction without arguing', type: '0-2' },
      { text: 'I will raise my hand and wait to be called on', type: '0-2' },
      { text: 'I will follow adult directions the first time', type: '0-2' },
      { text: 'I will keep my body and myself safe', type: 'checkbox' },
      { text: 'Did I earn time on Chromebook?', type: 'checkbox' }
    ],
    goalSystem: {
      type: 'daily-percent',
      target: 60,
      amTarget: 30,
      pmTarget: 30,
      subjectTargets: {}
    },
    behaviorButtons: [
      { id: 'shoutout', label: '🗣️ Shouting out', color: 'bg-orange-600' },
      { id: 'hitting', label: '✋ Hitting', color: 'bg-red-600' }
    ],
    incentives: ['🎮 10 min free choice', '🎨 Art supplies'],
    iepAccommodations: [
      { text: 'Extended time on assessments (1.5x)', type: 'checkbox' },
      { text: 'Frequent breaks during instruction', type: 'ADI' }
    ],
    plan504Accommodations: []
  },
  {
    name: 'Sarah M.',
    grade: '3rd',
    primaryTeacher: 'Stewart',
    switchTeacher: 'Bruestle',
    parentEmails: ['parent.sarah@email.com'],
    supportStaff: [],
    caseManager: 'Mrs. Thompson',
    schedule: [
      'Check-in/Empty Pockets',
      'Homeroom/Morning Meeting',
      'ELA',
      'Special',
      'Math',
      'Lunch/Recess',
      'Science',
      'Social Studies',
      'Wildcat Time'
    ],
    goals: [
      { text: "I will get my teacher's attention", type: '0-2' },
      { text: 'I will accept adult direction without arguing', type: '0-2' },
      { text: 'I will keep my body and myself safe', type: 'checkbox' }
    ],
    goalSystem: {
      type: 'daily-percent',
      target: 55,
      amTarget: 28,
      pmTarget: 27,
      subjectTargets: {}
    },
    behaviorButtons: [
      { id: 'outofSeat', label: '🪑 Out of seat', color: 'bg-yellow-600' }
    ],
    incentives: ['💻 Extra tech time', '🏆 Treasure box'],
    iepAccommodations: [],
    plan504Accommodations: [
      { text: 'Access to sensory tools', type: 'ADI' }
    ]
  },
  {
    name: 'Marcus T.',
    grade: '3rd',
    primaryTeacher: 'Bruestle',
    switchTeacher: 'Stewart',
    parentEmails: ['parent.marcus@email.com'],
    supportStaff: [],
    caseManager: 'Mr. Davis',
    schedule: [
      'Check-in/Empty Pockets',
      'Homeroom/Morning Meeting',
      'ELA',
      'Special',
      'Math',
      'Lunch/Recess',
      'Science',
      'Social Studies',
      'Wildcat Time'
    ],
    goals: [
      { text: 'I will follow adult directions the first time', type: '0-2' },
      { text: 'I will keep my body and myself safe', type: 'checkbox' }
    ],
    goalSystem: {
      type: 'daily-percent',
      target: 50,
      amTarget: 25,
      pmTarget: 25,
      subjectTargets: {}
    },
    behaviorButtons: [
      { id: 'refusal', label: '🚫 Refusal', color: 'bg-red-600' }
    ],
    incentives: ['⭐ Star student'],
    iepAccommodations: [
      { text: 'Check for understanding', type: 'checkbox' }
    ],
    plan504Accommodations: []
  }
];

// ========================================
// SPECIALS SCHEDULE
// ========================================
const specialsSchedule = [
  {
    day: 'A',
    subject: 'Art',
    slots: [
      { class: 'Stewart-3rd', additionalStudents: [] },
      { class: 'Bruestle-3rd', additionalStudents: [] },
      { class: '', additionalStudents: [] },
      { class: '', additionalStudents: [] },
      { class: '', additionalStudents: [] }
    ]
  },
  {
    day: 'A',
    subject: 'PE',
    slots: [
      { class: 'Johnson-4th', additionalStudents: [] },
      { class: 'Martinez-5th', additionalStudents: [] },
      { class: '', additionalStudents: [] },
      { class: '', additionalStudents: [] },
      { class: '', additionalStudents: [] }
    ]
  }
  // Add more days and subjects as needed
];

// ========================================
// MIGRATION FUNCTIONS
// ========================================

async function createUser(email, password, role, additionalData = {}) {
  try {
    // Create auth user
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      emailVerified: true
    });
    
    // Create Firestore profile
    await db.collection('users').doc(userRecord.uid).set({
      email: email,
      role: role,
      schoolId: 'lincoln-elementary',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...additionalData
    });
    
    console.log(`✅ Created ${role}: ${email}`);
    return userRecord.uid;
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      console.log(`⚠️  User already exists: ${email}`);
      const existingUser = await auth.getUserByEmail(email);
      return existingUser.uid;
    } else {
      console.error(`❌ Failed to create ${email}:`, error.message);
      return null;
    }
  }
}

async function migrateSchoolConfig() {
  console.log('\n📋 Migrating school configuration...');
  await db.collection('school_config').doc('lincoln-elementary').set(schoolConfig);
  console.log('✅ School config created');
}

async function migrateStaff() {
  console.log('\n👥 Migrating staff accounts...');
  
  // Admin
  for (const admin of staff.admin) {
    await createUser(admin.email, admin.password, 'admin', { name: admin.name });
  }
  
  // Achievement Team
  for (const member of staff.achievementTeam) {
    await createUser(member.email, member.password, 'achievement_team', { 
      name: member.name,
      caseload: member.caseload 
    });
  }
  
  // Classroom Teachers
  for (const teacher of staff.classroomTeachers) {
    await createUser(teacher.email, teacher.password, 'teacher', { 
      name: teacher.name,
      grade: teacher.grade 
    });
  }
  
  // Specials Teachers
  for (const teacher of staff.specialsTeachers) {
    await createUser(teacher.email, teacher.password, 'specials_teacher', { 
      name: teacher.name,
      subject: teacher.subject 
    });
  }
  
  // Support Staff
  for (const staff of staff.supportStaff) {
    await createUser(staff.email, staff.password, 'achievement_team', { 
      name: staff.name,
      supportRole: staff.role 
    });
  }
}

async function migrateStudents() {
  console.log('\n👦 Migrating student data...');
  
  for (const student of students) {
    const docRef = await db.collection('students').add({
      ...student,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'migration_script'
    });
    
    console.log(`✅ Created student: ${student.name} (${docRef.id})`);
    
    // Parent accounts will be auto-created by Cloud Function
  }
}

async function migrateSpecialsSchedule() {
  console.log('\n📅 Migrating specials schedule...');
  
  for (const schedule of specialsSchedule) {
    await db.collection('specials_schedule').add({
      ...schedule,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Created schedule: Day ${schedule.day} - ${schedule.subject}`);
  }
}

async function createSampleScores() {
  console.log('\n📊 Creating sample score data...');
  
  const studentsSnapshot = await db.collection('students').limit(3).get();
  const today = new Date().toISOString().split('T')[0];
  
  for (const studentDoc of studentsSnapshot.docs) {
    const student = studentDoc.data();
    
    // Create scores for today
    for (const subject of student.schedule) {
      const scores = {};
      student.goals.forEach(goal => {
        if (goal.type === 'checkbox') {
          scores[goal.text] = Math.random() > 0.3;
        } else {
          scores[goal.text] = Math.floor(Math.random() * 3); // 0, 1, or 2
        }
      });
      
      await db.collection('scores').add({
        studentId: studentDoc.id,
        date: today,
        subject: subject,
        scores: scores,
        teacherId: 'migration_script',
        teacherName: student.primaryTeacher,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    console.log(`✅ Created sample scores for ${student.name}`);
  }
}

// ========================================
// MAIN MIGRATION FUNCTION
// ========================================
async function runMigration() {
  console.log('🚀 Starting database migration...\n');
  
  try {
    await migrateSchoolConfig();
    await migrateStaff();
    await migrateStudents();
    await migrateSpecialsSchedule();
    await createSampleScores();
    
    console.log('\n✅ Migration completed successfully!');
    console.log('\n📝 Default Passwords:');
    console.log('   Admin: Admin123!');
    console.log('   Teachers: Teacher123!');
    console.log('   Achievement Team: Achieve123!');
    console.log('   Support Staff: Support123!');
    console.log('\n⚠️  IMPORTANT: Change all passwords after first login!\n');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
  } finally {
    process.exit();
  }
}

// Run migration
runMigration();

// ========================================
// OPTIONAL: RESET DATABASE (USE WITH CAUTION!)
// ========================================
async function resetDatabase() {
  console.log('⚠️  WARNING: This will delete ALL data!');
  console.log('Waiting 5 seconds... Press Ctrl+C to cancel');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const collections = [
    'users',
    'students', 
    'scores',
    'accommodations_log',
    'behavior_incidents',
    'comments',
    'audit_logs',
    'specials_schedule',
    'school_config'
  ];
  
  for (const collectionName of collections) {
    const snapshot = await db.collection(collectionName).get();
    const batch = db.batch();
    
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`🗑️  Deleted ${collectionName}`);
  }
  
  // Delete all auth users
  const listUsersResult = await auth.listUsers();
  for (const user of listUsersResult.users) {
    await auth.deleteUser(user.uid);
  }
  console.log('🗑️  Deleted all auth users');
  
  console.log('✅ Database reset complete');
}

// Uncomment to reset database:
// resetDatabase().then(() => process.exit());
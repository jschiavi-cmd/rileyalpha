// src/components/dashboards/SpecialsDashboard.js
import React, { useState } from 'react';
import { Calendar, Users, Target, Sparkles, Eye, EyeOff, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeCollection, useFirestoreOperations } from '../../firebase/hooks';
import { where } from 'firebase/firestore';

export default function SpecialsDashboard() {
  const { userProfile, logout } = useAuth();
  const [selectedDay, setSelectedDay] = useState('A');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [privacyMode, setPrivacyMode] = useState(false);

  const currentSpecial = userProfile?.subject || 'PE';
  
  const { update: updateScore, create: createScore } = useFirestoreOperations('scores');
  
  // Fetch schedule for this special on selected day
  const { data: scheduleData } = useRealtimeCollection('specials_schedule', [
    where('day', '==', selectedDay),
    where('subject', '==', currentSpecial)
  ]);

  // Fetch all students to match with schedule
  const { data: allStudents } = useRealtimeCollection('students');

  // Fetch today's scores
  const { data: todaysScores } = useRealtimeCollection('scores', [
    where('date', '==', selectedDate),
    where('subject', '==', currentSpecial)
  ]);

  // Get students for this day based on schedule
  const getTodaysStudents = () => {
    if (!scheduleData || scheduleData.length === 0) return [];
    
    const schedule = scheduleData[0];
    const studentIds = new Set();
    
    // Add students from scheduled classes
    schedule.slots?.forEach(slot => {
      if (slot.class) {
        const [teacher, grade] = slot.class.split('-');
        const classStudents = allStudents.filter(s => 
          s.primaryTeacher === teacher && s.grade === grade
        );
        classStudents.forEach(s => studentIds.add(s.id));
      }
      
      // Add individually scheduled students
      slot.additionalStudents?.forEach(studentName => {
        const student = allStudents.find(s => s.name === studentName);
        if (student) studentIds.add(student.id);
      });
    });
    
    return allStudents.filter(s => studentIds.has(s.id));
  };

  const todaysStudents = getTodaysStudents();

  const goals = [
    { text: "I will get my teacher's attention", type: '0-2' },
    { text: 'I will accept adult direction without arguing', type: '0-2' },
    { text: 'I will raise my hand and wait to be called on', type: '0-2' },
    { text: 'I will follow adult directions the first time', type: '0-2' },
    { text: 'I will keep my body and myself safe', type: 'checkbox' },
    { text: 'Did I earn time on Chromebook?', type: 'checkbox' }
  ];

  const getScoreForStudent = (studentId) => {
    return todaysScores.find(s => s.studentId === studentId);
  };

  const getNextScore = (currentScore, type) => {
    if (type === 'checkbox') {
      return currentScore ? null : true;
    }
    if (currentScore === undefined || currentScore === null) return 0;
    if (currentScore === 0) return 1;
    if (currentScore === 1) return 2;
    return null;
  };

  const getScoreColor = (score, type) => {
    if (type === 'checkbox') {
      return score
        ? 'bg-green-900/50 hover:bg-green-800/50 text-green-400 border-2 border-green-700'
        : 'bg-slate-800 hover:bg-slate-700 text-slate-500 border-2 border-slate-700 hover:border-cyan-500/50';
    }
    if (score === null || score === undefined) return 'bg-slate-800 hover:bg-slate-700 text-slate-500 border-2 border-slate-700 hover:border-cyan-500/50';
    if (score === 0) return 'bg-red-900/50 hover:bg-red-800/50 text-red-400 border-2 border-red-700';
    if (score === 1) return 'bg-yellow-900/50 hover:bg-yellow-800/50 text-yellow-400 border-2 border-yellow-700';
    if (score === 2) return 'bg-green-900/50 hover:bg-green-800/50 text-green-400 border-2 border-green-700';
  };

  const handleScoreClick = async (studentId, goal) => {
    const scoreDoc = getScoreForStudent(studentId);
    const currentScore = scoreDoc?.scores?.[goal.text];
    const nextScore = getNextScore(currentScore, goal.type);
    
    const newScores = { ...(scoreDoc?.scores || {}), [goal.text]: nextScore };
    if (nextScore === null) {
      delete newScores[goal.text];
    }

    const scoreDocId = `${studentId}_${selectedDate}_${currentSpecial}`;
    
    try {
      if (scoreDoc) {
        await updateScore(scoreDocId, {
          scores: newScores,
          teacherId: userProfile.id,
          teacherName: userProfile.name
        });
      } else {
        await createScore(scoreDocId, {
          studentId,
          date: selectedDate,
          subject: currentSpecial,
          scores: newScores,
          teacherId: userProfile.id,
          teacherName: userProfile.name
        });
      }
    } catch (error) {
      console.error('Error updating score:', error);
    }
  };

  const fillRowPerfect = async (studentId) => {
    const perfectScores = {};
    goals.forEach(goal => {
      perfectScores[goal.text] = goal.type === 'checkbox' ? true : 2;
    });

    const scoreDocId = `${studentId}_${selectedDate}_${currentSpecial}`;
    try {
      await updateScore(scoreDocId, {
        studentId,
        date: selectedDate,
        subject: currentSpecial,
        scores: perfectScores,
        teacherId: userProfile.id,
        teacherName: userProfile.name
      });
    } catch (error) {
      console.error('Error filling row:', error);
    }
  };

  const calculateTotal = (studentId) => {
    const scoreDoc = getScoreForStudent(studentId);
    if (!scoreDoc) return 0;
    return Object.values(scoreDoc.scores || {}).reduce((sum, val) => {
      return sum + (typeof val === 'boolean' ? (val ? 2 : 0) : (val || 0));
    }, 0);
  };

  const getMaxPossible = () => goals.length * 2;

  const DayBubble = ({ day }) => {
    const isSelected = selectedDay === day;
    const studentCount = day === selectedDay ? todaysStudents.length : 0;

    return (
      <button
        onClick={() => setSelectedDay(day)}
        className={`relative flex flex-col items-center justify-center w-16 h-16 sm:w-24 sm:h-24 rounded-full font-bold text-xl sm:text-2xl transition-all ${
          isSelected
            ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/50 scale-110'
            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-cyan-400'
        }`}
      >
        <span>{day}</span>
        <span className="text-[10px] sm:text-xs font-normal mt-0.5 sm:mt-1">{studentCount} students</span>
      </button>
    );
  };

  const StudentCard = ({ student }) => {
    const total = calculateTotal(student.id);
    const maxPossible = getMaxPossible();
    const percentage = maxPossible > 0 ? Math.round((total / maxPossible) * 100) : 0;
    const scoreDoc = getScoreForStudent(student.id);

    return (
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800 overflow-hidden hover:border-cyan-900/50 transition-all mb-3 sm:mb-4">
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-900 flex items-center justify-center text-cyan-400 font-bold text-base sm:text-lg border-2 border-cyan-500/50 ${privacyMode ? 'blur-sm' : ''}`}>
                {student.name?.charAt(0) || '?'}
              </div>
              <div>
                <h3 className={`font-bold text-white text-base sm:text-lg ${privacyMode ? 'blur-sm' : ''}`}>
                  {student.name}
                </h3>
                <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-cyan-100">
                  <span>{student.grade}</span>
                  <span>•</span>
                  <span>{student.primaryTeacher}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg sm:text-2xl font-bold text-white">{total}/{maxPossible}</div>
              <div className="text-[10px] sm:text-xs text-cyan-100">{percentage}%</div>
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 gap-2">
            <div className="text-xs sm:text-sm font-medium text-slate-400">
              {currentSpecial} - Today's Goals
            </div>
            <button
              onClick={() => fillRowPerfect(student.id)}
              className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 w-full sm:w-auto justify-center"
            >
              <Sparkles className="w-3 h-3" />
              Perfect Score
            </button>
          </div>

          <div className="overflow-x-auto">
            <div className="flex gap-2 min-w-min">
              {goals.map((goal, idx) => {
                const score = scoreDoc?.scores?.[goal.text];
                return (
                  <div key={idx} className="flex flex-col min-w-[80px] sm:min-w-[100px]">
                    <div className="text-[10px] sm:text-xs text-slate-400 mb-1 h-8 sm:h-8 line-clamp-2 text-center">{goal.text}</div>
                    <button
                      onClick={() => handleScoreClick(student.id, goal)}
                      className={`w-full h-12 sm:h-12 rounded transition-all active:scale-95 font-bold text-base sm:text-lg ${getScoreColor(score, goal.type)}`}
                    >
                      {goal.type === 'checkbox' ? (score ? '✓' : '☐') : (score !== undefined && score !== null ? score : '---')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
      <div className="bg-slate-900/80 backdrop-blur-sm border-b border-cyan-900/50 shadow-lg shadow-cyan-500/10">
        <div className="max-w-full px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                {currentSpecial} Specials Dashboard
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">Teacher: {userProfile?.name} • {selectedDate}</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={() => setPrivacyMode(!privacyMode)}
                className={`flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg border transition-colors text-xs sm:text-sm ${
                  privacyMode
                    ? 'bg-cyan-600 border-cyan-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-cyan-400'
                }`}
              >
                {privacyMode ? <EyeOff className="w-3 h-3 sm:w-4 sm:h-4" /> : <Eye className="w-3 h-3 sm:w-4 sm:h-4" />}
                <span className="font-medium hidden sm:inline">Privacy</span>
              </button>
              <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-2 sm:px-3 py-2">
                <Calendar className="w-3 h-3 sm:w-4 sm:h-4 text-cyan-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-slate-200 text-xs sm:text-sm focus:outline-none w-24 sm:w-auto"
                />
              </div>
              <button onClick={logout} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-400">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-full px-3 sm:px-6 py-4 sm:py-6">
        <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-bold text-cyan-400 mb-3 sm:mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 sm:w-5 sm:h-5" />
            Select Rotation Day
          </h2>
          <div className="flex items-center justify-center gap-3 sm:gap-6 flex-wrap">
            {['A', 'B', 'C', 'D', 'E'].map(day => (
              <DayBubble key={day} day={day} />
            ))}
          </div>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 sm:mb-4 gap-2">
            <h2 className="text-base sm:text-lg font-bold text-cyan-400 flex items-center gap-2">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" />
              Day {selectedDay} Students ({todaysStudents.length})
            </h2>
            <div className="text-xs sm:text-sm text-slate-400">
              Click cells to score • Click "Perfect Score" for 100%
            </div>
          </div>

          {todaysStudents.length === 0 ? (
            <div className="text-center py-8 sm:py-12 text-slate-500">
              <Users className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 opacity-50" />
              <p className="text-base sm:text-lg">No students scheduled for Day {selectedDay}</p>
            </div>
          ) : (
            todaysStudents.map(student => (
              <StudentCard key={student.id} student={student} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
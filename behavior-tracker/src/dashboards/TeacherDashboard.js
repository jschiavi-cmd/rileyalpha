// src/components/dashboards/TeacherDashboard.js
import React, { useState, useEffect } from 'react';
import { MessageSquare, Calendar, ChevronDown, Sparkles, Trophy, Eye, EyeOff, ChevronLeft, ChevronRight, ArrowRightLeft, ClipboardList, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeCollection, useFirestoreOperations } from '../../firebase/hooks';
import { where } from 'firebase/firestore';

export default function TeacherDashboard() {
  const { userProfile, logout } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showFireworks, setShowFireworks] = useState(null);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [goalCelebration, setGoalCelebration] = useState(null);
  const [showAccommodations, setShowAccommodations] = useState(true);
  const [showSwitchClass, setShowSwitchClass] = useState(false);
  const [commentModal, setCommentModal] = useState(null);
  const [gridColumns, setGridColumns] = useState(2);
  const [accommodationData, setAccommodationData] = useState({});
  
  const { update: updateScore, create: createScore } = useFirestoreOperations('scores');
  const { create: createComment } = useFirestoreOperations('comments');
  const { create: createIncident } = useFirestoreOperations('behavior_incidents');
  const { update: updateAccommodation } = useFirestoreOperations('accommodations_log');

  // Fetch students - either primary class or switch class
  const primaryQuery = [where('primaryTeacher', '==', userProfile?.name || '')];
  const switchQuery = [where('switchTeacher', '==', userProfile?.name || '')];
  
  const { data: primaryStudents, loading: loadingPrimary } = useRealtimeCollection('students', primaryQuery);
  const { data: switchStudents, loading: loadingSwitch } = useRealtimeCollection('students', switchQuery);
  
  const students = showSwitchClass ? switchStudents : primaryStudents;
  const loading = showSwitchClass ? loadingSwitch : loadingPrimary;

  // Fetch scores for selected date
  const { data: todaysScores } = useRealtimeCollection('scores', [
    where('date', '==', selectedDate)
  ]);

  const goals = [
    { text: "I will get my teacher's attention", short: 'Attn', type: '0-2' },
    { text: 'I will accept adult direction without arguing', short: 'Dir', type: '0-2' },
    { text: 'I will raise my hand and wait to be called on', short: 'Hand', type: '0-2' },
    { text: 'I will follow adult directions the first time', short: '1st', type: '0-2' },
    { text: 'I will keep my body and myself safe', short: 'Safe', type: 'checkbox' },
    { text: 'Did I earn time on Chromebook?', short: 'Tech', type: 'checkbox' }
  ];

  const subjects = [
    'Check-in/Empty Pockets',
    'Homeroom/Morning Meeting',
    'ELA',
    'Special',
    'Math',
    'Lunch/Recess',
    'Science',
    'Social Studies',
    'Wildcat Time'
  ];

  const getScoreForStudent = (studentId, subject) => {
    return todaysScores.find(s => s.studentId === studentId && s.subject === subject);
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

  const handleScoreClick = async (studentId, subject, goal) => {
    const scoreDoc = getScoreForStudent(studentId, subject);
    const currentScore = scoreDoc?.scores?.[goal.text];
    const nextScore = getNextScore(currentScore, goal.type);
    
    const newScores = { ...(scoreDoc?.scores || {}), [goal.text]: nextScore };
    if (nextScore === null) {
      delete newScores[goal.text];
    }

    const scoreDocId = `${studentId}_${selectedDate}_${subject}`;
    
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
          subject,
          scores: newScores,
          teacherId: userProfile.id,
          teacherName: userProfile.name
        });
      }
    } catch (error) {
      console.error('Error updating score:', error);
    }
  };

  const fillRowPerfect = async (studentId, subject) => {
    const perfectScores = {};
    goals.forEach(goal => {
      perfectScores[goal.text] = goal.type === 'checkbox' ? true : 2;
    });

    const scoreDocId = `${studentId}_${selectedDate}_${subject}`;
    try {
      await updateScore(scoreDocId, {
        studentId,
        date: selectedDate,
        subject,
        scores: perfectScores,
        teacherId: userProfile.id,
        teacherName: userProfile.name
      });
    } catch (error) {
      console.error('Error filling row:', error);
    }
  };

  const calculateTotal = (studentId) => {
    const studentScores = todaysScores.filter(s => s.studentId === studentId);
    return studentScores.reduce((total, scoreDoc) => {
      return total + Object.values(scoreDoc.scores || {}).reduce((sum, val) => {
        return sum + (typeof val === 'boolean' ? (val ? 2 : 0) : (val || 0));
      }, 0);
    }, 0);
  };

  const getMaxPossiblePoints = () => {
    return subjects.length * goals.length * 2;
  };

  const getRowTotal = (studentId, subject) => {
    const scoreDoc = getScoreForStudent(studentId, subject);
    if (!scoreDoc) return 0;
    return Object.values(scoreDoc.scores || {}).reduce((sum, val) => {
      return sum + (typeof val === 'boolean' ? (val ? 2 : 0) : (val || 0));
    }, 0);
  };

  const changeDate = (days) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const saveComment = async (studentId, commentText) => {
    try {
      await createComment({
        studentId,
        date: selectedDate,
        text: commentText,
        teacherId: userProfile.id,
        teacherName: userProfile.name
      });
      setCommentModal(null);
    } catch (error) {
      console.error('Error saving comment:', error);
    }
  };

  const logBehavior = async (studentId, behaviorLabel) => {
    try {
      await createIncident({
        studentId,
        date: selectedDate,
        time: new Date().toISOString(),
        behavior: behaviorLabel,
        teacherId: userProfile.id,
        teacherName: userProfile.name
      });
    } catch (error) {
      console.error('Error logging behavior:', error);
    }
  };

  const StudentCard = ({ student }) => {
    const [expanded, setExpanded] = useState(true);
    const totalPoints = calculateTotal(student.id);
    const maxPossible = getMaxPossiblePoints();
    const percentage = Math.round((totalPoints / maxPossible) * 100);
    const hasMetGoal = totalPoints >= (student.dailyGoalTarget || 60);

    return (
      <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800 overflow-hidden hover:border-cyan-900/50 transition-all">
        <div className={`${hasMetGoal ? 'bg-gradient-to-r from-green-600 to-emerald-600' : 'bg-gradient-to-r from-blue-600 to-cyan-600'} px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 hover:opacity-90">
              <div className={`w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-cyan-400 font-bold text-lg border-2 border-cyan-500/50 ${privacyMode ? 'blur-sm' : ''}`}>
                {student.name?.charAt(0) || '?'}
              </div>
              <div className="text-left">
                <h3 className={`font-bold text-white text-lg flex items-center gap-2 ${privacyMode ? 'blur-sm' : ''}`}>
                  {student.name}
                  <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </h3>
                <div className="flex items-center gap-2 text-xs mt-1">
                  <span className="text-cyan-100">{percentage}% complete</span>
                  <span className={`px-2 py-0.5 rounded font-medium ${hasMetGoal ? 'bg-green-500/30 text-green-200' : 'bg-slate-700/50 text-slate-300'}`}>
                    Goal: {totalPoints}/{student.dailyGoalTarget || 60}
                  </span>
                </div>
              </div>
            </button>
            <div className="flex items-center gap-2">
              {hasMetGoal && (
                <button onClick={() => setGoalCelebration(student.id)} className="bg-yellow-500 hover:bg-yellow-400 rounded-lg p-2 animate-pulse">
                  <Trophy className="w-5 h-5 text-slate-900" />
                </button>
              )}
              <button onClick={() => setCommentModal(student.id)} className="bg-slate-900/60 hover:bg-slate-800/60 text-cyan-400 rounded-lg p-2 border border-cyan-500/30">
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {expanded && (
          <div className="p-4">
            {student.behaviorButtons && student.behaviorButtons.length > 0 && (
              <div className="mb-3 flex gap-2 flex-wrap">
                {student.behaviorButtons.map(behavior => (
                  <button 
                    key={behavior.id} 
                    onClick={() => logBehavior(student.id, behavior.label)} 
                    className={`${behavior.color} hover:opacity-80 text-white text-xs font-medium px-3 py-1 rounded-full`}
                  >
                    {behavior.label}
                  </button>
                ))}
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 text-left p-2 bg-slate-800 border border-slate-700 font-semibold text-cyan-400 w-24">Period</th>
                    {goals.map((goal, idx) => (
                      <th key={idx} className="p-2 bg-slate-800/50 border border-slate-700 font-medium text-slate-300 text-[10px] min-w-[90px]" title={goal.text}>
                        <div className="text-center">{goal.text}</div>
                      </th>
                    ))}
                    <th className="sticky right-0 z-10 p-2 bg-blue-950 border border-slate-700 font-semibold text-cyan-400 w-14">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((subject, subjectIdx) => {
                    const scoreDoc = getScoreForStudent(student.id, subject);
                    return (
                      <tr key={subjectIdx} className="hover:bg-slate-800/30">
                        <td 
                          className="sticky left-0 z-10 p-2 border border-slate-700 text-slate-200 bg-slate-900 cursor-pointer hover:bg-cyan-900/30 text-[11px] leading-tight" 
                          onClick={() => fillRowPerfect(student.id, subject)} 
                          title="Click for 100%"
                        >
                          <div className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-cyan-400 opacity-60 flex-shrink-0" />
                            <span className="line-clamp-2">{subject}</span>
                          </div>
                        </td>
                        {goals.map((goal, goalIdx) => {
                          const score = scoreDoc?.scores?.[goal.text];
                          return (
                            <td key={goalIdx} className="p-1 border border-slate-700">
                              <button 
                                onClick={() => handleScoreClick(student.id, subject, goal)} 
                                className={`w-full h-10 rounded transition-all active:scale-95 font-bold text-sm ${getScoreColor(score, goal.type)}`}
                              >
                                {goal.type === 'checkbox' ? (score ? '✓' : '☐') : (score !== undefined && score !== null ? score : '---')}
                              </button>
                            </td>
                          );
                        })}
                        <td className="sticky right-0 z-10 p-2 border border-slate-700 text-center bg-blue-950">
                          <span className="font-bold text-cyan-400 text-sm">{getRowTotal(student.id, subject)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Loading students...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
      <div className="bg-slate-900/80 backdrop-blur-sm border-b border-cyan-900/50 shadow-lg shadow-cyan-500/10">
        <div className="max-w-full px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">Behavior Tracker</h1>
              <p className="text-sm text-slate-400 mt-1">Click cells to score • Click period name for 100%</p>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setGridColumns(gridColumns === 2 ? 1 : 2)} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-slate-800/50 border-slate-700 text-slate-400 hover:text-cyan-400 transition-colors">
                <span className="text-sm font-medium">{gridColumns === 2 ? '2 Col' : '1 Col'}</span>
              </button>
              <button onClick={() => setShowSwitchClass(!showSwitchClass)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${showSwitchClass ? 'bg-purple-600 border-purple-500 text-white' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-cyan-400'}`}>
                <ArrowRightLeft className="w-4 h-4" />
                <span className="text-sm font-medium">{showSwitchClass ? 'Switch' : 'My Class'}</span>
              </button>
              <button onClick={() => setPrivacyMode(!privacyMode)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${privacyMode ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-cyan-400'}`}>
                {privacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span className="text-sm font-medium">Privacy</span>
              </button>
              <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-lg">
                <button onClick={() => changeDate(-1)} className="p-2 hover:bg-slate-700 rounded-l-lg">
                  <ChevronLeft className="w-4 h-4 text-cyan-400" />
                </button>
                <div className="flex items-center gap-2 px-3">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent text-slate-200 text-sm focus:outline-none w-32" />
                </div>
                <button onClick={() => changeDate(1)} className="p-2 hover:bg-slate-700 rounded-r-lg">
                  <ChevronRight className="w-4 h-4 text-cyan-400" />
                </button>
              </div>
              <button onClick={logout} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-400 transition-colors">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-full px-6 py-6">
        <div className={`grid ${gridColumns === 2 ? 'grid-cols-2' : 'grid-cols-1'} gap-6`}>
          {students.map(student => (
            <StudentCard key={student.id} student={student} />
          ))}
        </div>
      </div>

      {commentModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-cyan-400 mb-4">Add Comment</h3>
            <textarea 
              id="comment-input"
              placeholder="Notes about today..." 
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-cyan-500 resize-none placeholder:text-slate-500" 
              rows="4" 
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => {
                const comment = document.getElementById('comment-input').value;
                saveComment(commentModal, comment);
              }} className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium py-2 px-4 rounded-lg">Save</button>
              <button onClick={() => setCommentModal(null)} className="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {goalCelebration && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gradient-to-br from-slate-900 to-blue-950 border-4 border-cyan-400 rounded-2xl shadow-2xl shadow-cyan-500/50 max-w-lg w-full p-8 text-center">
            <Trophy className="w-20 h-20 text-yellow-400 mx-auto mb-4" />
            <h2 className="text-4xl font-bold text-cyan-400 mb-2">GOAL MET!</h2>
            <p className="text-xl text-white mb-6">Amazing work today!</p>
            <button onClick={() => setGoalCelebration(null)} className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-6 rounded-lg">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
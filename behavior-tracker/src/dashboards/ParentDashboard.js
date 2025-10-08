// src/components/dashboards/ParentDashboard.js
import React, { useState, useEffect } from 'react';
import { Calendar, MessageSquare, TrendingUp, Award, ChevronLeft, ChevronRight, Home, LogOut } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart } from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeCollection } from '../../firebase/hooks';
import { where, orderBy, limit } from 'firebase/firestore';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';

export default function ParentDashboard() {
  const { userProfile, logout } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Fetch students where this parent's email is in parentEmails array
  const { data: students, loading } = useRealtimeCollection('students', [
    where('parentEmails', 'array-contains', userProfile?.email || '')
  ]);

  // Auto-select first student
  useEffect(() => {
    if (students.length > 0 && !selectedStudent) {
      setSelectedStudent(students[0]);
    }
  }, [students, selectedStudent]);

  // Fetch scores for selected student and date
  const { data: scores } = useRealtimeCollection('scores', [
    where('studentId', '==', selectedStudent?.id || ''),
    where('date', '==', selectedDate)
  ]);

  // Fetch comments for selected student
  const { data: comments } = useRealtimeCollection('comments', [
    where('studentId', '==', selectedStudent?.id || ''),
    orderBy('date', 'desc'),
    limit(5)
  ]);

  // Fetch weekly scores for chart
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const { data: weeklyScores } = useRealtimeCollection('scores', [
    where('studentId', '==', selectedStudent?.id || ''),
    where('date', '>=', weekStart.toISOString().split('T')[0])
  ]);

  // Log parent access (FERPA compliance)
  useEffect(() => {
    if (selectedStudent && userProfile) {
      const logAccess = async () => {
        try {
          await addDoc(collection(db, 'audit_logs'), {
            userId: userProfile.id,
            userEmail: userProfile.email,
            action: 'parent_view_student_data',
            studentId: selectedStudent.id,
            studentName: selectedStudent.name,
            timestamp: serverTimestamp(),
            metadata: {
              date: selectedDate,
              userAgent: navigator.userAgent
            }
          });
        } catch (error) {
          console.error('Failed to log access:', error);
        }
      };
      logAccess();
    }
  }, [selectedStudent, selectedDate, userProfile]);

  const goals = [
    { text: "Get teacher's attention appropriately", short: 'Attention' },
    { text: 'Accept adult direction without arguing', short: 'Direction' },
    { text: 'Raise hand and wait to be called on', short: 'Hand Raising' },
    { text: 'Follow directions the first time', short: '1st Time' },
    { text: 'Keep body and self safe', short: 'Safety' },
    { text: 'Earned Chromebook time', short: 'Tech Time' }
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

  const calculateSubjectTotal = (subject) => {
    const scoreDoc = scores.find(s => s.subject === subject);
    if (!scoreDoc) return 0;
    return Object.values(scoreDoc.scores || {}).reduce((sum, val) => {
      return sum + (typeof val === 'boolean' ? (val ? 2 : 0) : (val || 0));
    }, 0);
  };

  const calculateDailyTotal = () => {
    return scores.reduce((total, scoreDoc) => {
      return total + Object.values(scoreDoc.scores || {}).reduce((sum, val) => {
        return sum + (typeof val === 'boolean' ? (val ? 2 : 0) : (val || 0));
      }, 0);
    }, 0);
  };

  const getScoreColor = (score, type) => {
    if (type === 'checkbox') {
      return score
        ? 'bg-green-100 text-green-800 border-2 border-green-400'
        : 'bg-gray-100 text-gray-400 border-2 border-gray-300';
    }
    if (score === 0) return 'bg-red-100 text-red-800 border-2 border-red-400';
    if (score === 1) return 'bg-yellow-100 text-yellow-800 border-2 border-yellow-400';
    if (score === 2) return 'bg-green-100 text-green-800 border-2 border-green-400';
    return 'bg-gray-100 text-gray-400 border-2 border-gray-300';
  };

  const changeDate = (days) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  // Prepare weekly chart data
  const getWeeklyChartData = () => {
    const dateMap = new Map();
    weeklyScores.forEach(scoreDoc => {
      if (!dateMap.has(scoreDoc.date)) {
        dateMap.set(scoreDoc.date, 0);
      }
      const total = Object.values(scoreDoc.scores || {}).reduce((sum, val) => {
        return sum + (typeof val === 'boolean' ? (val ? 2 : 0) : (val || 0));
      }, 0);
      dateMap.set(scoreDoc.date, dateMap.get(scoreDoc.date) + total);
    });

    return Array.from(dateMap.entries())
      .map(([date, points]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
        points,
        goal: selectedStudent?.dailyGoalTarget || 60
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!selectedStudent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No students found for your account.</p>
        </div>
      </div>
    );
  }

  const dailyTotal = calculateDailyTotal();
  const maxPossible = subjects.length * goals.length * 2;
  const percentage = Math.round((dailyTotal / maxPossible) * 100);
  const metGoal = dailyTotal >= (selectedStudent.dailyGoalTarget || 60);
  const weeklyChartData = getWeeklyChartData();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white border-b border-blue-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Home className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Parent Portal</h1>
                <p className="text-sm text-gray-600">Lincoln Elementary School</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-gray-800 text-sm focus:outline-none"
                />
              </div>
              <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-100 rounded-lg">
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
              <button onClick={logout} className="text-gray-600 hover:text-red-600 flex items-center gap-2">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Student Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center">
                <span className="text-3xl font-bold text-blue-600">{selectedStudent.name?.charAt(0) || '?'}</span>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-white">{selectedStudent.name}</h2>
                <p className="text-blue-100 text-sm mt-1">
                  {selectedStudent.grade} Grade • Teacher: {selectedStudent.primaryTeacher}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-5xl font-bold text-white">{dailyTotal}/{maxPossible}</div>
              <div className="text-blue-100 text-sm mt-1">
                {percentage}% • Goal: {selectedStudent.dailyGoalTarget || 60}
              </div>
              {metGoal && (
                <div className="mt-2 bg-green-500 text-white px-4 py-1 rounded-full text-sm font-semibold inline-flex items-center gap-1">
                  <Award className="w-4 h-4" />
                  Goal Met!
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Behavior Matrix */}
          <div className="col-span-2 bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Today's Behavior Report
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left p-3 bg-blue-50 border border-blue-200 font-semibold text-gray-700 text-sm sticky left-0 z-10">
                      Period
                    </th>
                    {goals.map((goal, idx) => (
                      <th key={idx} className="p-3 bg-blue-50 border border-blue-200 font-medium text-gray-700 text-xs min-w-[80px]">
                        <div className="text-center leading-tight">{goal.short}</div>
                      </th>
                    ))}
                    <th className="p-3 bg-indigo-100 border border-indigo-300 font-semibold text-gray-800 text-sm">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((subject, subjectIdx) => {
                    const scoreDoc = scores.find(s => s.subject === subject);
                    const total = calculateSubjectTotal(subject);
                    return (
                      <tr key={subjectIdx} className="hover:bg-gray-50">
                        <td className="p-3 border border-gray-200 text-sm font-medium text-gray-700 sticky left-0 bg-white z-10">
                          {subject}
                        </td>
                        {goals.map((goal, goalIdx) => {
                          const score = scoreDoc?.scores?.[goal.text];
                          const isCheckbox = goalIdx >= 4;
                          return (
                            <td key={goalIdx} className="p-2 border border-gray-200">
                              <div className={`w-full h-12 rounded-lg flex items-center justify-center font-bold text-lg ${getScoreColor(score, isCheckbox ? 'checkbox' : 'score')}`}>
                                {isCheckbox ? (score ? '✓' : '○') : (score !== undefined && score !== null ? score : '-')}
                              </div>
                            </td>
                          );
                        })}
                        <td className="p-3 border border-indigo-200 bg-indigo-50 text-center">
                          <span className="font-bold text-indigo-700 text-lg">{total}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 bg-blue-50 rounded-lg p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-600">2</div>
                  <div className="text-xs text-gray-600">Met Expectation</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-600">1</div>
                  <div className="text-xs text-gray-600">Partial Success</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">0</div>
                  <div className="text-xs text-gray-600">Needs Support</div>
                </div>
              </div>
            </div>
          </div>

          {/* Daily Comments */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              Teacher Notes
            </h3>
            <div className="space-y-3">
              {comments.length > 0 ? (
                comments.map((comment, idx) => (
                  <div key={idx} className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border-l-4 border-blue-500">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-blue-700">{comment.teacherName}</span>
                      <span className="text-xs text-gray-500">{comment.date}</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{comment.text}</p>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">No comments for this date</p>
              )}
            </div>

            <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-green-800 text-sm mb-1">This Week's Progress</div>
                  <div className="text-xs text-green-700">
                    {weeklyChartData.filter(d => d.points >= d.goal).length} out of {weeklyChartData.length} days met goal
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
              <div className="text-xs text-amber-800 font-medium mb-2">Daily Goal</div>
              <div className="text-2xl font-bold text-amber-900">{selectedStudent.dailyGoalTarget || 60} points</div>
              <div className="text-xs text-amber-700 mt-1">
                {dailyTotal >= (selectedStudent.dailyGoalTarget || 60)
                  ? `${dailyTotal - (selectedStudent.dailyGoalTarget || 60)} points above goal!`
                  : `${(selectedStudent.dailyGoalTarget || 60) - dailyTotal} points to goal`}
              </div>
            </div>
          </div>
        </div>

        {/* Weekly Bar Graph */}
        <div className="mt-6 bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <BarChart className="w-5 h-5 text-blue-600" />
            This Week's Daily Points
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={weeklyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="points" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              <Line
                type="monotone"
                dataKey="goal"
                stroke="#f59e0b"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={false}
                name="Daily Goal"
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-4 flex items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-500"></div>
              <span className="text-gray-600">Daily Points</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-1 bg-amber-500 rounded"></div>
              <span className="text-gray-600">Goal Line ({selectedStudent.dailyGoalTarget || 60} pts)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
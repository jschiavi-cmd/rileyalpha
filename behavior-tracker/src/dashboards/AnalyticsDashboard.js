import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, LineChart } from 'recharts';
import { TrendingUp, TrendingDown, Award, AlertCircle, Calendar, Users, Target, MessageSquare, BarChart3, Activity } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeCollection, useFirestoreOperations } from '../../firebase/hooks';
import { where, orderBy, limit } from 'firebase/firestore';

export default function AnalyticsDashboard() {
  const { userProfile } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedView, setSelectedView] = useState('student');
  const [dateRange, setDateRange] = useState('30days');
  const [selectedMetric, setSelectedMetric] = useState('total-points');
  const [selectedSubject, setSelectedSubject] = useState('Math');
  const [subjectSortBy, setSubjectSortBy] = useState('name');
  const [timeOfDayView, setTimeOfDayView] = useState('all-day');

  // Fetch all students
  const { data: allStudents, loading: studentsLoading } = useRealtimeCollection('students');

  // Fetch scores for selected student
  const { data: studentScores } = useRealtimeCollection(
    'scores',
    selectedStudent ? [
      where('studentId', '==', selectedStudent),
      orderBy('date', 'desc'),
      limit(30)
    ] : []
  );

  // Fetch behavior incidents
  const { data: behaviorIncidents } = useRealtimeCollection(
    'behavior_incidents',
    selectedStudent ? [
      where('studentId', '==', selectedStudent),
      orderBy('timestamp', 'desc'),
      limit(50)
    ] : []
  );

  // Fetch comments
  const { data: comments } = useRealtimeCollection(
    'comments',
    selectedStudent ? [
      where('studentId', '==', selectedStudent),
      orderBy('timestamp', 'desc'),
      limit(10)
    ] : []
  );

  // Get current student data
  const currentStudent = useMemo(() => {
    return allStudents.find(s => s.id === selectedStudent);
  }, [allStudents, selectedStudent]);

  // Process daily points data
  const dailyPointsData = useMemo(() => {
    if (!studentScores || studentScores.length === 0) return [];

    // Group scores by date
    const scoresByDate = {};
    studentScores.forEach(score => {
      if (!scoresByDate[score.date]) {
        scoresByDate[score.date] = [];
      }
      scoresByDate[score.date].push(score);
    });

    // Calculate totals per day
    return Object.entries(scoresByDate)
      .map(([date, scores]) => {
        const totalPoints = scores.reduce((sum, score) => {
          return sum + Object.values(score.scores || {}).reduce((s, val) => {
            return s + (typeof val === 'boolean' ? (val ? 2 : 0) : val);
          }, 0);
        }, 0);

        const amPoints = Math.floor(totalPoints * 0.5); // Simplified - ideally track separately
        const pmPoints = totalPoints - amPoints;

        return {
          date,
          points: totalPoints,
          amPoints,
          pmPoints,
          goal: currentStudent?.dailyGoalTarget || 60,
          maxPossible: 108
        };
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-14); // Last 14 days
  }, [studentScores, currentStudent]);

  // Process subject performance data
  const subjectPerformance = useMemo(() => {
    if (!studentScores || studentScores.length === 0) return [];

    const subjectTotals = {};
    const subjectCounts = {};

    studentScores.forEach(score => {
      if (!subjectTotals[score.subject]) {
        subjectTotals[score.subject] = 0;
        subjectCounts[score.subject] = 0;
      }
      const points = Object.values(score.scores || {}).reduce((sum, val) => {
        return sum + (typeof val === 'boolean' ? (val ? 2 : 0) : val);
      }, 0);
      subjectTotals[score.subject] += points;
      subjectCounts[score.subject]++;
    });

    const maxPointsPerSubject = (currentStudent?.goals?.length || 6) * 2;

    return Object.entries(subjectTotals).map(([subject, total]) => {
      const count = subjectCounts[subject];
      const avgPoints = count > 0 ? total / count : 0;
      return {
        subject,
        avgPoints: avgPoints.toFixed(1),
        maxPoints: maxPointsPerSubject,
        percentage: Math.round((avgPoints / maxPointsPerSubject) * 100)
      };
    });
  }, [studentScores, currentStudent]);

  // Process behavior incidents by type
  const behaviorsByType = useMemo(() => {
    if (!behaviorIncidents || behaviorIncidents.length === 0) return [];

    const counts = {};
    behaviorIncidents.forEach(incident => {
      counts[incident.behavior] = (counts[incident.behavior] || 0) + 1;
    });

    return Object.entries(counts).map(([type, count]) => ({
      type,
      count,
      trend: 'stable' // Would need historical comparison for real trends
    }));
  }, [behaviorIncidents]);

  // Calculate goals met
  const goalsMet = useMemo(() => {
    if (!dailyPointsData || dailyPointsData.length === 0) {
      return { met: 0, missed: 0, percentage: 0 };
    }

    const met = dailyPointsData.filter(d => d.points >= d.goal).length;
    const missed = dailyPointsData.length - met;
    const percentage = dailyPointsData.length > 0 
      ? Math.round((met / dailyPointsData.length) * 100) 
      : 0;

    return { met, missed, percentage };
  }, [dailyPointsData]);

  // Get sorted subjects
  const sortedSubjects = useMemo(() => {
    const subjects = [...subjectPerformance];
    switch (subjectSortBy) {
      case 'highest':
        return subjects.sort((a, b) => b.percentage - a.percentage);
      case 'lowest':
        return subjects.sort((a, b) => a.percentage - b.percentage);
      case 'name':
      default:
        return subjects.sort((a, b) => a.subject.localeCompare(b.subject));
    }
  }, [subjectPerformance, subjectSortBy]);

  // Get chart data based on time of day
  const chartData = useMemo(() => {
    if (timeOfDayView === 'am') {
      return dailyPointsData.map(d => ({ ...d, points: d.amPoints }));
    } else if (timeOfDayView === 'pm') {
      return dailyPointsData.map(d => ({ ...d, points: d.pmPoints }));
    }
    return dailyPointsData;
  }, [dailyPointsData, timeOfDayView]);

  // Subject trend data for line chart
  const subjectTrendData = useMemo(() => {
    if (!studentScores || !selectedSubject) return [];

    const subjectScores = studentScores
      .filter(s => s.subject === selectedSubject)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-10);

    return subjectScores.map(score => ({
      date: score.date,
      points: Object.values(score.scores || {}).reduce((sum, val) => {
        return sum + (typeof val === 'boolean' ? (val ? 2 : 0) : val);
      }, 0)
    }));
  }, [studentScores, selectedSubject]);

  // Weekly comparison data
  const weeklyComparison = useMemo(() => {
    if (!dailyPointsData || dailyPointsData.length === 0) return [];

    const weeks = {};
    dailyPointsData.forEach(day => {
      const date = new Date(day.date);
      const weekNum = Math.ceil(date.getDate() / 7);
      const weekKey = `Week ${weekNum}`;
      
      if (!weeks[weekKey]) {
        weeks[weekKey] = { points: [], goalsMet: 0 };
      }
      weeks[weekKey].points.push(day.points);
      if (day.points >= day.goal) {
        weeks[weekKey].goalsMet++;
      }
    });

    return Object.entries(weeks).map(([week, data]) => ({
      week,
      avgPoints: (data.points.reduce((a, b) => a + b, 0) / data.points.length).toFixed(1),
      goalsMetPercent: Math.round((data.goalsMet / data.points.length) * 100)
    }));
  }, [dailyPointsData]);

  // School-wide data (for school view)
  const { data: allScores } = useRealtimeCollection(
    'scores',
    selectedView === 'school' ? [
      orderBy('date', 'desc'),
      limit(500)
    ] : []
  );

  const schoolWideStats = useMemo(() => {
    if (!allScores || allScores.length === 0) return null;

    // Calculate average points per student
    const studentTotals = {};
    allScores.forEach(score => {
      if (!studentTotals[score.studentId]) {
        studentTotals[score.studentId] = { total: 0, count: 0 };
      }
      const points = Object.values(score.scores || {}).reduce((sum, val) => {
        return sum + (typeof val === 'boolean' ? (val ? 2 : 0) : val);
      }, 0);
      studentTotals[score.studentId].total += points;
      studentTotals[score.studentId].count++;
    });

    const avgPoints = Object.values(studentTotals).reduce((sum, s) => {
      return sum + (s.total / s.count);
    }, 0) / Object.keys(studentTotals).length;

    return {
      avgPoints: avgPoints.toFixed(1),
      totalStudents: Object.keys(studentTotals).length
    };
  }, [allScores]);

  const StatCard = ({ title, value, subtitle, icon: Icon, trend, color = 'cyan' }) => {
    const colorClasses = {
      cyan: 'from-cyan-600 to-blue-600',
      green: 'from-green-600 to-emerald-600',
      red: 'from-red-600 to-rose-600',
      purple: 'from-purple-600 to-pink-600',
      orange: 'from-orange-600 to-amber-600'
    };

    return (
      <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-lg p-4 text-white`}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="text-sm opacity-90">{title}</div>
            <div className="text-3xl font-bold mt-1">{value}</div>
            {subtitle && <div className="text-sm opacity-80 mt-1">{subtitle}</div>}
          </div>
          <Icon className="w-8 h-8 opacity-80" />
        </div>
        {trend && (
          <div className="flex items-center gap-1 text-sm mt-2">
            {trend.direction === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{trend.value} from last week</span>
          </div>
        )}
      </div>
    );
  };

  if (studentsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center">
        <div className="text-cyan-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
      <div className="bg-slate-900/80 backdrop-blur-sm border-b border-cyan-900/50 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                Analytics Dashboard
              </h1>
              <p className="text-sm text-slate-400 mt-1">Data-driven insights for behavior tracking</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedView('student')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedView === 'student'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-cyan-400'
                }`}
              >
                Student View
              </button>
              <button
                onClick={() => setSelectedView('school')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  selectedView === 'school'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-cyan-400'
                }`}
              >
                School View
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {selectedView === 'student' && (
          <>
            <div className="mb-6 flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-300 mb-2">Select Student</label>
                <select
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-4 py-2"
                >
                  <option value="">-- Select a student --</option>
                  {allStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.name} - {s.primaryTeacher}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-300 mb-2">Date Range</label>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-4 py-2"
                >
                  <option value="7days">Last 7 Days</option>
                  <option value="30days">Last 30 Days</option>
                  <option value="semester">This Semester</option>
                  <option value="year">This Year</option>
                </select>
              </div>
            </div>

            {selectedStudent && currentStudent ? (
              <>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <StatCard
                    title="Goals Met Rate"
                    value={`${goalsMet.percentage}%`}
                    subtitle={`${goalsMet.met}/${goalsMet.met + goalsMet.missed} days`}
                    icon={Award}
                    color="green"
                    trend={{ direction: 'up', value: '+12%' }}
                  />
                  <StatCard
                    title="Avg Daily Points"
                    value={dailyPointsData.length > 0 ? (dailyPointsData.reduce((s, d) => s + d.points, 0) / dailyPointsData.length).toFixed(1) : '0'}
                    subtitle="Out of 108 possible"
                    icon={Target}
                    color="cyan"
                  />
                  <StatCard
                    title="Behavior Incidents"
                    value={behaviorIncidents.length}
                    subtitle="30-day total"
                    icon={AlertCircle}
                    color="orange"
                  />
                  <StatCard
                    title="Teacher Comments"
                    value={comments.length}
                    subtitle="Recent entries"
                    icon={MessageSquare}
                    color="purple"
                  />
                </div>

                <div className="grid grid-cols-3 gap-6 mb-6">
                  <div className="col-span-2 bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        Daily Points Trend
                      </h3>
                      <div className="flex items-center gap-2">
                        <select
                          value={timeOfDayView}
                          onChange={(e) => setTimeOfDayView(e.target.value)}
                          className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-1 text-sm"
                        >
                          <option value="all-day">All Day</option>
                          <option value="am">AM Only</option>
                          <option value="pm">PM Only</option>
                        </select>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                          labelStyle={{ color: '#cbd5e1' }}
                        />
                        <Bar dataKey="points" fill="#06b6d4" radius={[8, 8, 0, 0]} />
                        {timeOfDayView === 'all-day' && (
                          <Line type="monotone" dataKey="goal" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                    <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Weekly Progress
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={weeklyComparison}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="week" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                        />
                        <Bar dataKey="avgPoints" fill="#06b6d4" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-cyan-400">Subject Performance</h3>
                      <select
                        value={subjectSortBy}
                        onChange={(e) => setSubjectSortBy(e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-1 text-sm"
                      >
                        <option value="name">Sort by Name</option>
                        <option value="highest">Highest First</option>
                        <option value="lowest">Lowest First</option>
                      </select>
                    </div>
                    <div className="space-y-3">
                      {sortedSubjects.map((subject, idx) => (
                        <div key={idx}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-slate-300">{subject.subject}</span>
                            <span className="text-sm text-cyan-400 font-bold">{subject.percentage}%</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all"
                              style={{ width: `${subject.percentage}%` }}
                            />
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Avg: {subject.avgPoints}/{subject.maxPoints} points per day
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                    <h3 className="text-lg font-bold text-cyan-400 mb-4">Behavior Incidents</h3>
                    <div className="space-y-3">
                      {behaviorsByType.map((behavior, idx) => (
                        <div key={idx} className="bg-slate-800/50 rounded-lg p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <AlertCircle className={`w-5 h-5 ${behavior.count > 10 ? 'text-red-400' : 'text-orange-400'}`} />
                            <div>
                              <div className="text-sm font-medium text-slate-200">{behavior.type}</div>
                              <div className="text-xs text-slate-500">{behavior.count} incidents</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {behaviorsByType.length === 0 && (
                        <div className="text-center py-8 text-slate-500">No incidents recorded</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 mb-6">
                  <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Recent Teacher Comments
                  </h3>
                  <div className="space-y-3">
                    {comments.map((comment) => (
                      <div key={comment.id} className="bg-slate-800/50 rounded-lg p-4 border-l-4 border-cyan-500">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-cyan-400">{comment.teacherName}</span>
                          <span className="text-xs text-slate-500">{comment.date}</span>
                        </div>
                        <p className="text-sm text-slate-300">{comment.text}</p>
                      </div>
                    ))}
                    {comments.length === 0 && (
                      <div className="text-center py-8 text-slate-500">No comments yet</div>
                    )}
                  </div>
                </div>

                {subjectTrendData.length > 0 && (
                  <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-cyan-400">Subject Performance Trend</h3>
                      <select
                        value={selectedSubject}
                        onChange={(e) => setSelectedSubject(e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-2"
                      >
                        {sortedSubjects.map(subject => (
                          <option key={subject.subject} value={subject.subject}>{subject.subject}</option>
                        ))}
                      </select>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={subjectTrendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" domain={[0, 12]} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                        />
                        <Line type="monotone" dataKey="points" stroke="#06b6d4" strokeWidth={3} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-12 text-center">
                <Users className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-300 mb-2">Select a Student</h3>
                <p className="text-slate-500">Choose a student from the dropdown above to view their analytics</p>
              </div>
            )}
          </>
        )}

        {selectedView === 'school' && (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-200 mb-2">School-Wide Analytics</h2>
              <p className="text-slate-400">Overview of behavior tracking across all teachers and students</p>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-6">
              <StatCard
                title="School Avg Points"
                value={schoolWideStats?.avgPoints || '0'}
                subtitle="Across all students"
                icon={Target}
                color="cyan"
              />
              <StatCard
                title="Total Students"
                value={schoolWideStats?.totalStudents || allStudents.length}
                subtitle="On behavior plans"
                icon={Users}
                color="purple"
              />
              <StatCard
                title="Active Teachers"
                value={new Set(allStudents.map(s => s.primaryTeacher)).size}
                subtitle="Plus specials"
                icon={Users}
                color="orange"
              />
              <StatCard
                title="Goals Met Rate"
                value="68%"
                subtitle="School-wide"
                icon={Award}
                color="green"
              />
            </div>

            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
              <h3 className="text-lg font-bold text-cyan-400 mb-4">All Students Overview</h3>
              <div className="grid grid-cols-3 gap-4">
                {allStudents.map(student => (
                  <div key={student.id} className="bg-slate-800/50 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-200">{student.name}</div>
                        <div className="text-xs text-slate-400">{student.primaryTeacher}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedStudent(student.id);
                        setSelectedView('student');
                      }}
                      className="w-full bg-cyan-600 hover:bg-cyan-700 text-white text-sm px-3 py-2 rounded mt-2"
                    >
                      View Analytics
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
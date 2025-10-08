// src/components/dashboards/AchievementDashboard.js
import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Save, X, Users, ChevronDown, Mail, Calendar, Target, Award, FileText, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeCollection, useFirestoreOperations } from '../../firebase/hooks';

export default function AchievementDashboard() {
  const { userProfile, logout } = useAuth();
  const [editingStudent, setEditingStudent] = useState(null);
  const [expandedStudents, setExpandedStudents] = useState(new Set());
  const [caseloadView, setCaseloadView] = useState(false);
  const [selectedCaseloadManager, setSelectedCaseloadManager] = useState('All');

  const { data: students, loading } = useRealtimeCollection('students');
  const { create, update, remove } = useFirestoreOperations('students');

  const teachers = ['Stewart', 'Bruestle', 'Johnson', 'Martinez', 'Chen'];

  const defaultGoals = [
    { text: "I will get my teacher's attention appropriately", type: '0-2' },
    { text: 'I will accept adult direction without arguing', type: '0-2' },
    { text: 'I will raise my hand and wait to be called on', type: '0-2' },
    { text: 'I will follow adult directions the first time', type: '0-2' }
  ];

  const defaultSchedule = [
    'Morning Meeting',
    'ELA',
    'Special',
    'Math',
    'Lunch/Recess',
    'Science',
    'Social Studies',
    'Wildcat Time'
  ];

  const createNewStudent = () => {
    setEditingStudent({
      id: null,
      name: '',
      grade: '3rd',
      primaryTeacher: teachers[0],
      switchTeacher: teachers[1],
      parentEmails: [''],
      supportStaff: [],
      caseManager: userProfile?.name || '',
      schedule: [...defaultSchedule],
      goals: [...defaultGoals],
      goalSystem: {
        type: 'daily-percent',
        target: 60,
        amTarget: 30,
        pmTarget: 30,
        subjectTargets: {}
      },
      behaviorButtons: [],
      incentives: [],
      iepAccommodations: [],
      plan504Accommodations: []
    });
  };

  const saveStudent = async () => {
    if (!editingStudent.name.trim()) {
      alert('Please enter a student name');
      return;
    }

    try {
      if (editingStudent.id) {
        await update(editingStudent.id, editingStudent);
      } else {
        await create(editingStudent);
      }
      setEditingStudent(null);
    } catch (error) {
      console.error('Error saving student:', error);
      alert('Failed to save student');
    }
  };

  const deleteStudent = async (id) => {
    if (window.confirm('Are you sure you want to delete this student plan?')) {
      try {
        await remove(id);
      } catch (error) {
        console.error('Error deleting student:', error);
      }
    }
  };

  const toggleExpanded = (id) => {
    setExpandedStudents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const updateField = (field, value) => {
    setEditingStudent(prev => ({ ...prev, [field]: value }));
  };

  const addGoal = () => {
    updateField('goals', [...editingStudent.goals, { text: '', type: '0-2' }]);
  };

  const updateGoal = (index, field, value) => {
    const newGoals = [...editingStudent.goals];
    newGoals[index][field] = value;
    updateField('goals', newGoals);
  };

  const removeGoal = (index) => {
    updateField('goals', editingStudent.goals.filter((_, i) => i !== index));
  };

  const addParentEmail = () => {
    updateField('parentEmails', [...editingStudent.parentEmails, '']);
  };

  const updateParentEmail = (index, value) => {
    const newEmails = [...editingStudent.parentEmails];
    newEmails[index] = value;
    updateField('parentEmails', newEmails);
  };

  const removeParentEmail = (index) => {
    updateField('parentEmails', editingStudent.parentEmails.filter((_, i) => i !== index));
  };

  const addAccommodation = (type) => {
    const field = type === 'iep' ? 'iepAccommodations' : 'plan504Accommodations';
    updateField(field, [...editingStudent[field], { text: '', type: 'checkbox' }]);
  };

  const updateAccommodation = (type, index, field, value) => {
    const fieldName = type === 'iep' ? 'iepAccommodations' : 'plan504Accommodations';
    const newAccom = [...editingStudent[fieldName]];
    newAccom[index][field] = value;
    updateField(fieldName, newAccom);
  };

  const removeAccommodation = (type, index) => {
    const field = type === 'iep' ? 'iepAccommodations' : 'plan504Accommodations';
    updateField(field, editingStudent[field].filter((_, i) => i !== index));
  };

  const StudentForm = () => {
    if (!editingStudent) return null;

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 overflow-y-auto">
        <div className="min-h-screen py-8 px-4 flex justify-center">
          <div className="bg-slate-900 border-2 border-cyan-500 rounded-xl shadow-2xl max-w-5xl w-full h-fit">
            <div className="bg-gradient-to-r from-cyan-600 to-blue-600 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-2xl font-bold text-white">
                {editingStudent.name ? `Edit: ${editingStudent.name}` : 'Create New Student Plan'}
              </h2>
              <button onClick={() => setEditingStudent(null)} className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Basic Info */}
              <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
                <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Basic Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Student Name *</label>
                    <input
                      type="text"
                      value={editingStudent.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      placeholder="Enter student name"
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Grade</label>
                    <select
                      value={editingStudent.grade}
                      onChange={(e) => updateField('grade', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="K">Kindergarten</option>
                      <option value="1st">1st Grade</option>
                      <option value="2nd">2nd Grade</option>
                      <option value="3rd">3rd Grade</option>
                      <option value="4th">4th Grade</option>
                      <option value="5th">5th Grade</option>
                      <option value="6th">6th Grade</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Primary Teacher</label>
                    <select
                      value={editingStudent.primaryTeacher}
                      onChange={(e) => updateField('primaryTeacher', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-cyan-500"
                    >
                      {teachers.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Switch Teacher</label>
                    <select
                      value={editingStudent.switchTeacher}
                      onChange={(e) => updateField('switchTeacher', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-cyan-500"
                    >
                      {teachers.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Parent/Guardian Emails
                  </label>
                  {editingStudent.parentEmails.map((email, idx) => (
                    <div key={idx} className="flex gap-2 mb-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => updateParentEmail(idx, e.target.value)}
                        placeholder="parent@email.com"
                        className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-cyan-500"
                      />
                      <button onClick={() => removeParentEmail(idx)} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button onClick={addParentEmail} className="bg-slate-700 hover:bg-slate-600 text-cyan-400 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Add Email
                  </button>
                </div>
              </div>

              {/* Goals */}
              <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
                <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Behavior Goals
                </h3>
                <div className="space-y-3">
                  {editingStudent.goals.map((goal, idx) => (
                    <div key={idx} className="bg-slate-900/50 p-4 rounded-lg">
                      <div className="flex gap-3">
                        <input
                          type="text"
                          value={goal.text}
                          onChange={(e) => updateGoal(idx, 'text', e.target.value)}
                          placeholder="Goal description"
                          className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500"
                        />
                        <select
                          value={goal.type}
                          onChange={(e) => updateGoal(idx, 'type', e.target.value)}
                          className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500"
                        >
                          <option value="0-2">0-2 Scale</option>
                          <option value="checkbox">Checkbox</option>
                        </select>
                        <button onClick={() => removeGoal(idx)} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={addGoal} className="mt-3 bg-slate-700 hover:bg-slate-600 text-cyan-400 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Add Goal
                </button>
              </div>

              {/* Goal System */}
              <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
                <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Goal Achievement System
                </h3>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Daily Point Target</label>
                  <input
                    type="number"
                    value={editingStudent.goalSystem.target}
                    onChange={(e) => updateField('goalSystem', { ...editingStudent.goalSystem, target: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Accommodations */}
              <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
                <h3 className="text-lg font-bold text-cyan-400 mb-4">IEP & 504 Accommodations</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="text-md font-semibold text-blue-400 mb-3">IEP Accommodations</h4>
                    <div className="space-y-3">
                      {editingStudent.iepAccommodations.map((accom, idx) => (
                        <div key={idx} className="bg-slate-900/50 p-3 rounded-lg flex gap-3">
                          <input
                            type="text"
                            value={accom.text}
                            onChange={(e) => updateAccommodation('iep', idx, 'text', e.target.value)}
                            placeholder="Accommodation description"
                            className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-2"
                          />
                          <select
                            value={accom.type}
                            onChange={(e) => updateAccommodation('iep', idx, 'type', e.target.value)}
                            className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-2"
                          >
                            <option value="checkbox">Checkbox</option>
                            <option value="ADI">ADI</option>
                          </select>
                          <button onClick={() => removeAccommodation('iep', idx)} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => addAccommodation('iep')} className="mt-3 bg-slate-700 hover:bg-slate-600 text-blue-400 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Add IEP Accommodation
                    </button>
                  </div>

                  <div>
                    <h4 className="text-md font-semibold text-purple-400 mb-3">504 Plan Accommodations</h4>
                    <div className="space-y-3">
                      {editingStudent.plan504Accommodations.map((accom, idx) => (
                        <div key={idx} className="bg-slate-900/50 p-3 rounded-lg flex gap-3">
                          <input
                            type="text"
                            value={accom.text}
                            onChange={(e) => updateAccommodation('504', idx, 'text', e.target.value)}
                            placeholder="Accommodation description"
                            className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-2"
                          />
                          <select
                            value={accom.type}
                            onChange={(e) => updateAccommodation('504', idx, 'type', e.target.value)}
                            className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-3 py-2"
                          >
                            <option value="checkbox">Checkbox</option>
                            <option value="ADI">ADI</option>
                          </select>
                          <button onClick={() => removeAccommodation('504', idx)} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => addAccommodation('504')} className="mt-3 bg-slate-700 hover:bg-slate-600 text-purple-400 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Add 504 Accommodation
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 px-6 py-4 border-t border-slate-700 flex justify-end gap-3 rounded-b-xl">
              <button onClick={() => setEditingStudent(null)} className="px-6 py-2 border border-slate-700 hover:bg-slate-700 text-slate-300 font-medium rounded-lg">
                Cancel
              </button>
              <button onClick={saveStudent} className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium px-6 py-2 rounded-lg flex items-center gap-2">
                <Save className="w-4 h-4" />
                Save Student Plan
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const filteredStudents = caseloadView
    ? students.filter(s => selectedCaseloadManager === 'All' || s.caseManager === selectedCaseloadManager)
    : students;

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
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                Achievement Team Dashboard
              </h1>
              <p className="text-sm text-slate-400 mt-1">Create and manage student behavior plans</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCaseloadView(!caseloadView)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                  caseloadView
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-purple-400'
                }`}
              >
                <Users className="w-4 h-4" />
                Caseload View
              </button>
              <button
                onClick={createNewStudent}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium px-6 py-3 rounded-lg flex items-center gap-2 shadow-lg shadow-cyan-500/20"
              >
                <Plus className="w-5 h-5" />
                New Student Plan
              </button>
              <button onClick={logout} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-400">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-800 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-cyan-400" />
              <span className="text-lg font-semibold text-slate-200">
                {filteredStudents.length} Student Plan{filteredStudents.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {filteredStudents.map(student => (
            <div key={student.id} className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800 overflow-hidden hover:border-cyan-900/50 transition-all">
              <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => toggleExpanded(student.id)}
                    className="flex items-center gap-3 hover:opacity-90"
                  >
                    <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center text-cyan-400 font-bold text-xl border-2 border-cyan-500/50">
                      {student.name?.charAt(0) || '?'}
                    </div>
                    <div className="text-left">
                      <h3 className="font-bold text-white text-xl flex items-center gap-2">
                        {student.name}
                        <ChevronDown className={`w-5 h-5 transition-transform ${expandedStudents.has(student.id) ? 'rotate-180' : ''}`} />
                      </h3>
                      <div className="flex items-center gap-3 text-sm text-cyan-100 mt-1">
                        <span>👤 {student.primaryTeacher}</span>
                        <span>•</span>
                        <span>📧 {student.parentEmails?.length || 0} contact{student.parentEmails?.length !== 1 ? 's' : ''}</span>
                        <span>•</span>
                        <span>🎯 {student.goals?.length || 0} goals</span>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingStudent(student)}
                      className="bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg p-2"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => deleteStudent(student.id)}
                      className="bg-red-600 hover:bg-red-700 text-white rounded-lg p-2"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {expandedStudents.has(student.id) && (
                <div className="p-6 grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <h4 className="text-sm font-bold text-cyan-400 mb-3">Goals ({student.goals?.length || 0})</h4>
                      <div className="space-y-2">
                        {student.goals?.map((goal, idx) => (
                          <div key={idx} className="text-sm text-slate-300 flex items-center justify-between">
                            <span>{goal.text}</span>
                            <span className={`text-xs px-2 py-1 rounded ${goal.type === 'checkbox' ? 'bg-green-600/30 text-green-400' : 'bg-blue-600/30 text-blue-400'}`}>
                              {goal.type === 'checkbox' ? '☐' : '0-2'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <h4 className="text-sm font-bold text-cyan-400 mb-3">Accommodations</h4>
                      <div className="space-y-2">
                        {student.iepAccommodations?.length > 0 && (
                          <div>
                            <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded">IEP</span>
                            <div className="mt-1 text-sm text-slate-300">
                              {student.iepAccommodations.length} accommodation{student.iepAccommodations.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        )}
                        {student.plan504Accommodations?.length > 0 && (
                          <div>
                            <span className="text-xs font-bold bg-purple-600 text-white px-2 py-0.5 rounded">504</span>
                            <div className="mt-1 text-sm text-slate-300">
                              {student.plan504Accommodations.length} accommodation{student.plan504Accommodations.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <h4 className="text-sm font-bold text-cyan-400 mb-3">Parent Contacts</h4>
                      <div className="space-y-1">
                        {student.parentEmails?.map((email, idx) => (
                          <div key={idx} className="text-sm text-slate-300 flex items-center gap-2">
                            <Mail className="w-3 h-3 text-slate-500" />
                            {email}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {editingStudent && <StudentForm />}
    </div>
  );
}
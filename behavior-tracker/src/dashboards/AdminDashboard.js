// src/components/dashboards/AdminDashboard.js
import React, { useState } from 'react';
import { Settings, Users, School, Palette, Database, Download, Upload, Shield, Activity, Calendar, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeCollection, useFirestoreOperations } from '../../firebase/hooks';

export default function AdminDashboard() {
  const { userProfile, logout } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');
  const [editingSchool, setEditingSchool] = useState(false);

  const { data: students } = useRealtimeCollection('students');
  const { data: users } = useRealtimeCollection('users');
  const { data: schoolConfigData } = useRealtimeCollection('school_config');
  const { update: updateSchoolConfig } = useFirestoreOperations('school_config');

  const [schoolConfig, setSchoolConfig] = useState(schoolConfigData[0] || {
    name: 'Lincoln Elementary School',
    logoUrl: 'https://via.placeholder.com/150?text=School',
    colorTheme: 'blue',
    address: '123 Main Street',
    phone: '(555) 123-4567',
    principal: 'Dr. Sarah Johnson',
    assistantPrincipal: 'Mrs. Emily Rodriguez',
    googleDriveBackupFolderId: ''
  });

  const teachers = users.filter(u => u.role === 'teacher' || u.role === 'specials_teacher');
  const activeTeachers = teachers.filter(t => t.active !== false);

  const colorThemes = [
    { id: 'blue', name: 'Blue', from: 'from-cyan-600', to: 'to-blue-600' },
    { id: 'green', name: 'Green', from: 'from-green-600', to: 'to-emerald-600' },
    { id: 'purple', name: 'Purple', from: 'from-purple-600', to: 'to-pink-600' },
    { id: 'orange', name: 'Orange', from: 'from-orange-600', to: 'to-amber-600' }
  ];

  const currentTheme = colorThemes.find(t => t.id === schoolConfig.colorTheme) || colorThemes[0];

  const saveSchoolConfig = async () => {
    try {
      if (schoolConfigData[0]?.id) {
        await updateSchoolConfig(schoolConfigData[0].id, schoolConfig);
      }
      setEditingSchool(false);
    } catch (error) {
      console.error('Error saving config:', error);
    }
  };

  const StatCard = ({ title, value, subtitle, icon: Icon, color = 'cyan' }) => {
    const colorClasses = {
      cyan: 'from-cyan-600 to-blue-600',
      green: 'from-green-600 to-emerald-600',
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
      </div>
    );
  };

  const DashboardView = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Students"
          value={students.length}
          subtitle="On behavior plans"
          icon={Users}
          color="cyan"
        />
        <StatCard
          title="Active Teachers"
          value={`${activeTeachers.length}/${teachers.length}`}
          subtitle="All staff members"
          icon={Users}
          color="green"
        />
        <StatCard
          title="System Health"
          value="98%"
          subtitle="All systems operational"
          icon={Activity}
          color="purple"
        />
        <StatCard
          title="This Month"
          value={new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          subtitle="Current period"
          icon={Calendar}
          color="orange"
        />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className={`col-span-2 bg-slate-900/50 backdrop-blur-sm rounded-xl border ${currentTheme.from} p-6`}>
          <h3 className="text-lg font-bold text-cyan-400 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <button className="bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg p-4 text-left flex items-center justify-between">
              <span className="text-sm">Export All Data</span>
              <Download className="w-4 h-4 text-cyan-400" />
            </button>
            <button className="bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg p-4 text-left flex items-center justify-between">
              <span className="text-sm">Import Students</span>
              <Upload className="w-4 h-4 text-green-400" />
            </button>
            <button className="bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg p-4 text-left flex items-center justify-between">
              <span className="text-sm">Backup Database</span>
              <Database className="w-4 h-4 text-purple-400" />
            </button>
            <button className="bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg p-4 text-left flex items-center justify-between">
              <span className="text-sm">System Logs</span>
              <Shield className="w-4 h-4 text-orange-400" />
            </button>
          </div>
        </div>

        <div className={`bg-slate-900/50 backdrop-blur-sm rounded-xl border ${currentTheme.from} p-6`}>
          <h3 className="text-lg font-bold text-cyan-400 mb-4">School Info</h3>
          <div className="space-y-3 text-sm text-slate-300">
            <div>
              <div className="text-slate-500 text-xs">School Name</div>
              <div className="font-medium">{schoolConfig.name}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">Principal</div>
              <div className="font-medium">{schoolConfig.principal}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">Phone</div>
              <div className="font-medium">{schoolConfig.phone}</div>
            </div>
            <button
              onClick={() => setCurrentView('school')}
              className="w-full mt-4 bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-lg text-sm font-medium"
            >
              Edit School Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const SchoolSetupView = () => (
    <div className="space-y-6">
      <div className={`bg-slate-900/50 backdrop-blur-sm rounded-xl border ${currentTheme.from} p-6`}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
            <School className="w-5 h-5" />
            School Information
          </h3>
          <button
            onClick={() => editingSchool ? saveSchoolConfig() : setEditingSchool(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              editingSchool ? 'bg-green-600 hover:bg-green-700' : `bg-gradient-to-r ${currentTheme.from} ${currentTheme.to}`
            } text-white`}
          >
            {editingSchool ? 'Save Changes' : 'Edit'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">School Name</label>
            <input
              type="text"
              value={schoolConfig.name}
              onChange={(e) => setSchoolConfig(prev => ({ ...prev, name: e.target.value }))}
              disabled={!editingSchool}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-4 py-2 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Logo URL</label>
            <input
              type="text"
              value={schoolConfig.logoUrl}
              onChange={(e) => setSchoolConfig(prev => ({ ...prev, logoUrl: e.target.value }))}
              disabled={!editingSchool}
              placeholder="https://example.com/logo.png"
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-4 py-2 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Address</label>
            <input
              type="text"
              value={schoolConfig.address}
              onChange={(e) => setSchoolConfig(prev => ({ ...prev, address: e.target.value }))}
              disabled={!editingSchool}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-4 py-2 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Phone</label>
            <input
              type="text"
              value={schoolConfig.phone}
              onChange={(e) => setSchoolConfig(prev => ({ ...prev, phone: e.target.value }))}
              disabled={!editingSchool}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-4 py-2 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Principal</label>
            <input
              type="text"
              value={schoolConfig.principal}
              onChange={(e) => setSchoolConfig(prev => ({ ...prev, principal: e.target.value }))}
              disabled={!editingSchool}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-4 py-2 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Assistant Principal</label>
            <input
              type="text"
              value={schoolConfig.assistantPrincipal}
              onChange={(e) => setSchoolConfig(prev => ({ ...prev, assistantPrincipal: e.target.value }))}
              disabled={!editingSchool}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-4 py-2 disabled:opacity-60"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <Database className="w-4 h-4" />
              Google Drive Backup Folder ID
            </label>
            <input
              type="text"
              value={schoolConfig.googleDriveBackupFolderId}
              onChange={(e) => setSchoolConfig(prev => ({ ...prev, googleDriveBackupFolderId: e.target.value }))}
              disabled={!editingSchool}
              placeholder="Folder ID from Google Drive URL"
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-4 py-2 disabled:opacity-60"
            />
            <p className="text-xs text-slate-500 mt-1">
              Paste the folder ID from your Google Drive URL for automatic backups
            </p>
          </div>
        </div>
      </div>

      <div className={`bg-slate-900/50 backdrop-blur-sm rounded-xl border ${currentTheme.from} p-6`}>
        <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
          <Palette className="w-5 h-5" />
          Color Theme
        </h3>
        <div className="grid grid-cols-4 gap-4">
          {colorThemes.map(theme => (
            <button
              key={theme.id}
              onClick={() => setSchoolConfig(prev => ({ ...prev, colorTheme: theme.id }))}
              disabled={!editingSchool}
              className={`p-4 rounded-lg border-2 transition-all ${
                schoolConfig.colorTheme === theme.id
                  ? 'border-white scale-105'
                  : 'border-slate-700 hover:border-slate-600'
              } disabled:opacity-50`}
            >
              <div className={`h-12 rounded-lg bg-gradient-to-r ${theme.from} ${theme.to} mb-2`}></div>
              <div className="text-sm text-slate-300 text-center">{theme.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
      <div className="bg-slate-900/80 backdrop-blur-sm border-b border-cyan-900/50 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                Admin Dashboard
              </h1>
              <p className="text-sm text-slate-400 mt-1">{schoolConfig.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentView('dashboard')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  currentView === 'dashboard'
                    ? `bg-gradient-to-r ${currentTheme.from} ${currentTheme.to} text-white`
                    : 'bg-slate-800 text-slate-400 hover:text-cyan-400'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setCurrentView('school')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  currentView === 'school'
                    ? `bg-gradient-to-r ${currentTheme.from} ${currentTheme.to} text-white`
                    : 'bg-slate-800 text-slate-400 hover:text-cyan-400'
                }`}
              >
                School Setup
              </button>
              <button onClick={logout} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-400">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {currentView === 'dashboard' && <DashboardView />}
        {currentView === 'school' && <SchoolSetupView />}
      </div>
    </div>
  );
}
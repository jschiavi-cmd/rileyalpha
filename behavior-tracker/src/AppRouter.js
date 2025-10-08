import React from 'react';
import { useAuth } from './contexts/AuthContext';
import TeacherDashboard from './components/dashboards/TeacherDashboard';
import AdminDashboard from './components/dashboards/AdminDashboard';
// Add other dashboard imports as needed

function AppRouter() {
  const { userProfile, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!userProfile) {
    return <div>Please log in</div>;
  }

  switch (userProfile.role) {
    case 'admin':
      return <AdminDashboard />;
    case 'teacher':
      return <TeacherDashboard />;
    default:
      return <div>Unknown role</div>;
  }
}

export default AppRouter;
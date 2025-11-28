import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import ResetPassword from './ResetPassword';
import AdminDashboard from './AdminDashboard';
import AdministratorDashboard from './AdministratorDashboard';
import WorkflowList from './WorkflowList';
import WorkflowEditor from './WorkflowEditor';
import Settings from '../pages/Settings';
import ProtectedRoute from './ProtectedRoute';
import UserDashboard from './UserDashboard';
import WebManagerUserDashboard from './WebManagerUserDashboard';

function App() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  const [isWebManagerDomain, setIsWebManagerDomain] = useState(false);
  const [checkingDomain, setCheckingDomain] = useState(true);

  useEffect(() => {
    const checkDomain = async () => {
      try {
        const response = await fetch('/api/web-manager/domain-check');
        const data = await response.json();
        console.log('Domain check result:', data);
        setIsWebManagerDomain(data.is_web_manager_domain || false);
      } catch (error) {
        console.error('Domain check error:', error);
        setIsWebManagerDomain(false);
      } finally {
        setCheckingDomain(false);
      }
    };
    checkDomain();
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute requireAdmin={true}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/administrator/*"
          element={
            <ProtectedRoute requireAdministrator={true}>
              <AdministratorDashboard />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/dashboard/*"
          element={
            <ProtectedRoute>
              {checkingDomain ? (
                <div className="flex items-center justify-center min-h-screen">
                  <div className="text-center">Đang tải...</div>
                </div>
              ) : isWebManagerDomain ? (
                <WebManagerUserDashboard />
              ) : (
                <UserDashboard />
              )}
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/*"
          element={
            token && user ? (
              (() => {
                const userObj = JSON.parse(user || '{}');
                if (userObj.role === 'administrator') {
                  return <Navigate to="/administrator" replace />;
                } else if (userObj.role === 'admin') {
                  return <Navigate to="/admin" replace />;
                }
                // For user role, check domain and redirect accordingly
                if (checkingDomain) {
                  return <div className="flex items-center justify-center min-h-screen">Đang tải...</div>;
                }
                return <Navigate to="/dashboard" replace />;
              })()
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import AdminDashboard from './AdminDashboard';
import AdministratorDashboard from './AdministratorDashboard';
import WorkflowList from './WorkflowList';
import WorkflowEditor from './WorkflowEditor';
import Settings from '../pages/Settings';
import ProtectedRoute from './ProtectedRoute';
import UserDashboard from './UserDashboard';

function App() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
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
              <UserDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workflows"
          element={
            <ProtectedRoute>
              <WorkflowList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workflows/:id"
          element={
            <ProtectedRoute>
              <WorkflowEditor />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute requireAdministrator={true}>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            token && user ? (
              (() => {
                const userObj = JSON.parse(user || '{}');
                if (userObj.role === 'administrator') {
                  return <Navigate to="/administrator" replace />;
                } else if (userObj.role === 'admin') {
                  return <Navigate to="/admin" replace />;
                }
                return <Navigate to="/dashboard/automations/manage" replace />;
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

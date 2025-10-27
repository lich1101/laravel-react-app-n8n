import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children, requireAdmin = false, requireAdministrator = false }) => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const token = localStorage.getItem('token');

    if (!token || !user) {
        return <Navigate to="/login" replace />;
    }

    if (requireAdministrator && user.role !== 'administrator') {
        return <Navigate to="/workflows" replace />;
    }

    if (requireAdmin && user.role !== 'admin' && user.role !== 'administrator') {
        return <Navigate to="/workflows" replace />;
    }

    return children;
};

export default ProtectedRoute;

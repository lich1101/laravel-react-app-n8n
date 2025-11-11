import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ProjectsTab from './AdministratorDashboard/ProjectsTab';
import FoldersTab from './AdministratorDashboard/FoldersTab';
import UsersTab from './AdministratorDashboard/UsersTab';
import Settings from '../pages/Settings';
import Sidebar from './Sidebar';
import AutomationTablesTab from './Automation/AutomationTablesTab';

const AdministratorDashboard = () => {
    const [activeTab, setActiveTab] = useState('folders');
    const [isCollapsed, setIsCollapsed] = useState(false);
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    const menuItems = [
        { id: 'folders', label: 'Folders', icon: '📁' },
        { id: 'projects', label: 'Projects', icon: '🏢' },
        { id: 'automation', label: 'Automation', icon: '🤖' },
        { id: 'users', label: 'Users', icon: '👥' },
        { id: 'settings', label: 'Settings', icon: '⚙️' },
    ];

    const user = JSON.parse(localStorage.getItem('user') || '{}');

    return (
        <div className="flex min-h-screen bg-gray-50">
            {/* Sidebar */}
            <Sidebar
                isCollapsed={isCollapsed}
                setIsCollapsed={setIsCollapsed}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                menuItems={menuItems}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col">
                {/* Header */}
                <nav className="bg-white shadow">
                    <div className="px-4 sm:px-6 lg:px-8">
                        <div className="flex justify-between h-16">
                            <div className="flex items-center">
                                <h1 className="text-xl font-semibold text-gray-900">
                                    Administrator Dashboard
                                </h1>
                            </div>
                            <div className="flex items-center space-x-4">
                                <span className="text-gray-700">{user.name}</span>
                                <button
                                    onClick={handleLogout}
                                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                                >
                                    Logout
                                </button>
                            </div>
                        </div>
                    </div>
                </nav>

                {/* Content Area */}
                <div className="flex-1 p-6">
                    {activeTab === 'settings' ? (
                        <Settings />
                    ) : (
                    <div className="bg-white shadow rounded-lg p-6">
                        {activeTab === 'folders' && <FoldersTab />}
                        {activeTab === 'projects' && <ProjectsTab />}
                        {activeTab === 'automation' && <AutomationTablesTab />}
                        {activeTab === 'users' && <UsersTab />}
                    </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdministratorDashboard;

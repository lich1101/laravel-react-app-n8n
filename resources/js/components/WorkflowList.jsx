import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import { useNavigate } from 'react-router-dom';

const WorkflowList = () => {
    const [workflows, setWorkflows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const navigate = useNavigate();

    // Group workflows by folder
    const folderMap = {};
    const workflowsWithoutFolder = [];

    workflows.forEach(workflow => {
        if (workflow.is_from_folder && workflow.folder_id && workflow.folder_id !== null) {
            if (!folderMap[workflow.folder_id]) {
                folderMap[workflow.folder_id] = {
                    id: workflow.folder_id,
                    name: workflow.name.split(' - ')[0], // Extract folder name from workflow name
                    workflows: []
                };
            }
            folderMap[workflow.folder_id].workflows.push(workflow);
        } else {
            workflowsWithoutFolder.push(workflow);
        }
    });

    const folders = Object.values(folderMap);

    useEffect(() => {
        fetchWorkflows();
    }, []);

    const fetchWorkflows = async () => {
        try {
            const response = await axios.get('/workflows');
            setWorkflows(response.data);
        } catch (error) {
            console.error('Error fetching workflows:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to delete this workflow?')) {
            try {
                await axios.delete(`/workflows/${id}`);
                fetchWorkflows();
            } catch (error) {
                console.error('Error deleting workflow:', error);
            }
        }
    };

    const handleToggleActive = async (workflow, e) => {
        e.stopPropagation();
        try {
            const newActive = !workflow.active;
            await axios.put(`/workflows/${workflow.id}`, { active: newActive });
            fetchWorkflows();
        } catch (error) {
            if (error.response?.status === 400) {
                alert('Cannot activate workflow without a webhook node');
            } else {
                console.error('Error toggling workflow:', error);
            }
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    const filteredWorkflows = workflows.filter(workflow =>
        workflow.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Sort by last updated
    const sortedWorkflows = [...filteredWorkflows].sort((a, b) =>
        new Date(b.updated_at) - new Date(a.updated_at)
    );

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {/* Header */}
            <nav className="bg-gray-900 border-b border-gray-800 px-6 py-4">
                <div className="flex justify-between items-center">
                    <h1 className="text-xl font-semibold">My Workflows</h1>
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={() => navigate('/workflows/new')}
                            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium"
                        >
                            New Workflow
                        </button>
                        <button
                            onClick={handleLogout}
                            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm font-medium"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </nav>

            <div className="px-6 py-6">
                {/* Search and Filter Bar */}
                <div className="flex items-center space-x-3 mb-6">
                    <div className="flex-1 relative">
                        <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search"
                            className="w-full bg-gray-900 border border-gray-700 rounded px-10 py-2 text-sm focus:outline-none focus:border-blue-600"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button className="bg-gray-900 border border-gray-700 rounded px-4 py-2 text-sm flex items-center space-x-2">
                        <span>Sort by last updated</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    <button className="bg-gray-900 border border-gray-700 rounded px-4 py-2 text-sm">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                    </button>
                </div>

                {/* Workflow List */}
                <div className="space-y-2">
                    {sortedWorkflows.map((workflow) => (
                        <div
                            key={workflow.id}
                            onClick={() => navigate(`/workflows/${workflow.id}`)}
                            className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-800 transition-colors"
                        >
                            <div className="flex-1 min-w-0">
                                <h3 className="text-white font-medium mb-1">{workflow.name}</h3>
                                <div className="flex items-center space-x-3 text-sm text-gray-400">
                                    <span>Last updated {getTimeAgo(workflow.updated_at)}</span>
                                    <span>|</span>
                                    <span>Created {formatDate(workflow.created_at)}</span>
                                </div>
                            </div>
                            <div className="flex items-center space-x-6 ml-4">
                                <div className="flex items-center space-x-2">
                                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    <span className="text-sm text-gray-400">Personal</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <span className={`text-sm ${workflow.active ? 'text-green-400' : 'text-gray-400'}`}>
                                        {workflow.active ? 'Active' : 'Inactive'}
                                    </span>
                                    <button
                                        onClick={(e) => handleToggleActive(workflow, e)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                            workflow.active ? 'bg-green-600' : 'bg-gray-700'
                                        }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                workflow.active ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                        />
                                    </button>
                                </div>
                                <div className="relative">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(workflow.id, e);
                                        }}
                                        className="text-gray-400 hover:text-white p-2"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {sortedWorkflows.length === 0 && (
                        <div className="text-center py-12 text-gray-400">
                            <p>No workflows found. Create your first workflow!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Helper functions
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval !== 1 ? 's' : ''} ago`;
        }
    }
    return 'just now';
}

function formatDate(date) {
    const d = new Date(date);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
}

export default WorkflowList;

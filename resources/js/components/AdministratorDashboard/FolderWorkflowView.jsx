import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import SyncModal from './SyncModal';

const FolderWorkflowView = ({ folder, onBack }) => {
    const [workflows, setWorkflows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showWorkflowForm, setShowWorkflowForm] = useState(false);
    const [newWorkflowName, setNewWorkflowName] = useState('');
    const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
    const [showSyncModal, setShowSyncModal] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        fetchFolderWorkflows();
    }, [folder]);

    const fetchFolderWorkflows = async () => {
        try {
            // If folder already has workflows loaded (from project-folders API), use them
            if (folder.workflows && folder.workflows.length > 0) {
                setWorkflows(folder.workflows);
                setLoading(false);
                return;
            }

            // Otherwise fetch from folders API (for administrator)
            const response = await axios.get(`/folders/${folder.id}`);
            const folderData = response.data;
            setWorkflows(folderData.workflows || []);
        } catch (error) {
            console.error('Error fetching folder workflows:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredWorkflows = workflows.filter(workflow =>
        workflow.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleWorkflowClick = (workflowId) => {
        navigate(`/workflows/${workflowId}`);
    };

    const handleCreateWorkflow = async (e) => {
        e.preventDefault();
        try {
            // Create new workflow
            const workflowResponse = await axios.post('/workflows', {
                name: newWorkflowName,
                description: newWorkflowDescription,
                nodes: [],
                edges: [],
                active: false
            });

            // Add workflow to folder
            await axios.post(`/folders/${folder.id}/add-workflows`, {
                workflow_ids: [workflowResponse.data.id]
            });

            setNewWorkflowName('');
            setNewWorkflowDescription('');
            setShowWorkflowForm(false);
            fetchFolderWorkflows();
        } catch (error) {
            console.error('Error creating workflow:', error);
        }
    };

    const handleDeleteWorkflow = async (workflowId, e) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to delete this workflow?')) {
            try {
                await axios.post(`/folders/${folder.id}/remove-workflows`, {
                    workflow_ids: [workflowId]
                });
                fetchFolderWorkflows();
            } catch (error) {
                console.error('Error deleting workflow:', error);
            }
        }
    };

    const handleSyncFolder = async () => {
        setShowSyncModal(true);
    };

    const handleSyncConfirm = async () => {
        try {
            const response = await axios.post(`/folders/${folder.id}/sync`);
            return response; // Return response for SyncModal to process
        } catch (error) {
            console.error('Error syncing folder:', error);
            throw error; // Re-throw to let SyncModal handle the error display
        }
    };

    const getTimeAgo = (date) => {
        if (!date) return 'Never';
        const now = new Date();
        const then = new Date(date);
        const seconds = Math.floor((now - then) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        if (seconds < 2592000) return `${Math.floor(seconds / 86400)} days ago`;
        return then.toLocaleDateString();
    };

    const formatDate = (date) => {
        if (!date) return 'Never';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return <div className="text-center py-4">Loading...</div>;
    }

    return (
        <div>
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={onBack}
                        className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    >
                        ← Back to Folders
                    </button>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {folder.name}
                    </h2>
                </div>
                <div className="flex space-x-2">
                    <button
                        onClick={handleSyncFolder}
                        className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                        Sync
                    </button>
                    <button
                        onClick={() => setShowWorkflowForm(!showWorkflowForm)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                        New Workflow
                    </button>
                </div>
            </div>

            {/* Create Workflow Form */}
            {showWorkflowForm && (
                <div className="mb-6 bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-md font-semibold mb-3 text-gray-900 dark:text-white">
                        Create New Workflow
                    </h3>
                    <form onSubmit={handleCreateWorkflow} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Name
                            </label>
                            <input
                                type="text"
                                required
                                value={newWorkflowName}
                                onChange={(e) => setNewWorkflowName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                placeholder="Enter workflow name"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Description
                            </label>
                            <textarea
                                value={newWorkflowDescription}
                                onChange={(e) => setNewWorkflowDescription(e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                placeholder="Enter workflow description (optional)"
                            />
                        </div>
                        <div className="flex space-x-2">
                            <button
                                type="submit"
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                            >
                                Create
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowWorkflowForm(false);
                                    setNewWorkflowName('');
                                    setNewWorkflowDescription('');
                                }}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Search workflows..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredWorkflows.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
                        {searchTerm ? 'No workflows match your search' : 'No workflows in this folder'}
                    </div>
                ) : (
                    filteredWorkflows.map((workflow) => (
                        <div
                            key={workflow.id}
                            className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 relative"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <h3
                                    onClick={() => handleWorkflowClick(workflow.id)}
                                    className="text-lg font-semibold text-gray-900 dark:text-white truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                                >
                                    {workflow.name}
                                </h3>
                                <div className="flex items-center space-x-2">
                                    <span
                                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                            workflow.active
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        {workflow.active ? 'Active' : 'Inactive'}
                                    </span>
                                    <button
                                        onClick={(e) => handleDeleteWorkflow(workflow.id, e)}
                                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 text-sm"
                                        title="Delete workflow"
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                            {workflow.description && (
                                <p
                                    onClick={() => handleWorkflowClick(workflow.id)}
                                    className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2 cursor-pointer"
                                >
                                    {workflow.description}
                                </p>
                            )}
                            <div
                                onClick={() => handleWorkflowClick(workflow.id)}
                                className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 cursor-pointer"
                            >
                                <span>Updated {getTimeAgo(workflow.updated_at)}</span>
                                <span>{formatDate(workflow.updated_at)}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Sync Modal */}
            <SyncModal
                isOpen={showSyncModal}
                onClose={() => setShowSyncModal(false)}
                onConfirm={handleSyncConfirm}
                folderName={folder.name}
            />
        </div>
    );
};

export default FolderWorkflowView;

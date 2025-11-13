import React, { useState, useEffect } from 'react';
import axios from '../../config/axios';

const UsersTab = () => {
    const [users, setUsers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdministrator = currentUser.role === 'administrator';
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'user',
        project_id: null
    });
    const [editingUser, setEditingUser] = useState(null);

    // Protected users that cannot be deleted
    const protectedEmails = ['administrator@chatplus.vn', 'admin@chatplus.vn'];
    const isProtectedUser = (email) => protectedEmails.includes(email);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            
            // Admin users don't have access to projects API
            if (user.role === 'admin') {
                const usersRes = await axios.get('/users');
                setUsers(usersRes.data);
                setProjects([]); // No projects for admin users
            } else {
                // Administrator has access to projects API
                const [usersRes, projectsRes] = await Promise.all([
                    axios.get('/users'),
                    axios.get('/projects')
                ]);
                setUsers(usersRes.data);
                setProjects(projectsRes.data);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const userData = {
                name: formData.name,
                email: formData.email,
                role: formData.role,
                project_id: formData.project_id || null
            };

            if (formData.password) {
                userData.password = formData.password;
            }

            if (editingUser) {
                await axios.put(`/users/${editingUser.id}`, userData);
            } else {
                await axios.post('/users', userData);
            }

            setFormData({ name: '', email: '', password: '', role: 'user', project_id: null });
            setShowForm(false);
            setEditingUser(null);
            fetchData();
        } catch (error) {
            console.error('Error saving user:', error);
        }
    };

    const handleEdit = (user) => {
        setEditingUser(user);
        setFormData({
            name: user.name,
            email: user.email,
            password: '',
            role: user.role,
            project_id: user.project_id || null
        });
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this user?')) {
            try {
                await axios.delete(`/users/${id}`);
                fetchData();
            } catch (error) {
                console.error('Error deleting user:', error);
                if (error.response?.data?.error) {
                    alert(error.response.data.error);
                } else {
                    alert('Failed to delete user');
                }
            }
        }
    };

    const handleAssignProject = (user) => {
        setSelectedUser(user);
        setShowProjectModal(true);
    };

    const getProjectName = (projectId) => {
        const project = projects.find(p => p.id === projectId);
        return project ? project.name : 'No Project';
    };

    if (loading) {
        return <div className="text-center py-4">Loading...</div>;
    }

    return (
        <div className="bg-surface-elevated shadow-card p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Users</h2>
                <button
                    onClick={() => {
                        setShowForm(true);
                        setEditingUser(null);
                        setFormData({ name: '', email: '', password: '', role: 'user', project_id: null });
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                    Add User
                </button>
            </div>

            {showForm && (
                <div className="mb-6 bg-gray-100 p-4 rounded-lg">
                    <h3 className="text-md font-semibold mb-3 text-gray-900">
                        {editingUser ? 'Edit User' : 'Add New User'}
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Name
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Email
                                {editingUser && isProtectedUser(editingUser.email) && (
                                    <span className="ml-2 text-xs text-orange-600">(Protected - Cannot change)</span>
                                )}
                            </label>
                            <input
                                type="email"
                                required
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                disabled={editingUser && isProtectedUser(editingUser.email)}
                                className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900 ${
                                    editingUser && isProtectedUser(editingUser.email) ? 'opacity-60 cursor-not-allowed' : ''
                                }`}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Password {editingUser && '(leave empty to keep current)'}
                            </label>
                            <input
                                type="password"
                                required={!editingUser}
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Role
                            </label>
                            <select
                                value={formData.role}
                                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900"
                            >
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        {isAdministrator && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Project
                                </label>
                                <select
                                    value={formData.project_id || ''}
                                    onChange={(e) => setFormData({ ...formData, project_id: e.target.value || null })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900"
                            >
                                <option value="">No Project</option>
                                {projects.map((project) => (
                                    <option key={project.id} value={project.id}>
                                        {project.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        )}
                        <div className="flex space-x-2">
                            <button
                                type="submit"
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                            >
                                {editingUser ? 'Update' : 'Create'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowForm(false);
                                    setEditingUser(null);
                                }}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200" style={{ border: 'var(--border-subtle)' }}>
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Name
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Email
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Role
                            </th>
                            {isAdministrator && (
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Project
                                </th>
                            )}
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-surface-elevated divide-y divide-subtle border-subtle">
                        {users.map((user) => (
                            <tr key={user.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-primary">
                                    {user.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                                    {user.email}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span
                                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            user.role === 'administrator'
                                                ? 'bg-purple-100 text-purple-800'
                                                : user.role === 'admin'
                                                ? 'bg-blue-100 text-blue-800'
                                                : 'bg-surface-muted text-secondary'
                                        }`}
                                    >
                                        {user.role}
                                    </span>
                                </td>
                                {isAdministrator && (
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                                        {getProjectName(user.project_id)}
                                    </td>
                                )}
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                    <button
                                        onClick={() => handleEdit(user)}
                                        className="text-primary hover:text-primary/80"
                                    >
                                        Edit
                                    </button>
                                    {isAdministrator && (
                                        <button
                                            onClick={() => handleAssignProject(user)}
                                            className="text-emerald-600 hover:text-emerald-500"
                                        >
                                            Project
                                        </button>
                                    )}
                                    {!isProtectedUser(user.email) ? (
                                        <button
                                            onClick={() => handleDelete(user.id)}
                                            className="text-rose-600 hover:text-rose-500"
                                        >
                                            Delete
                                        </button>
                                    ) : (
                                        <span className="text-muted cursor-not-allowed" title="Protected system user">
                                            🔒 Protected
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Project Assignment Modal */}
            {showProjectModal && (
                <ProjectAssignmentModal
                    user={selectedUser}
                    projects={projects}
                    onClose={() => {
                        setShowProjectModal(false);
                        setSelectedUser(null);
                    }}
                    onSave={fetchData}
                />
            )}
        </div>
    );
};

// Project Assignment Modal Component
const ProjectAssignmentModal = ({ user, projects, onClose, onSave }) => {
    const [selectedProjectId, setSelectedProjectId] = useState(user.project_id || null);

    const handleSave = async () => {
        try {
            await axios.put(`/users/${user.id}`, {
                name: user.name,
                email: user.email,
                role: user.role,
                project_id: selectedProjectId
            });
            onSave();
            onClose();
        } catch (error) {
            console.error('Error assigning project:', error);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Assign Project - {user.name}
                </h3>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Project
                    </label>
                    <select
                        value={selectedProjectId || ''}
                        onChange={(e) => setSelectedProjectId(e.target.value || null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-gray-900"
                    >
                        <option value="">No Project</option>
                        {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                                {project.name} ({project.subdomain})
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex space-x-2">
                    <button
                        onClick={handleSave}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                        Save
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UsersTab;

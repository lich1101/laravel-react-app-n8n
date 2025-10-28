import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';

const CredentialsTab = () => {
    const [credentials, setCredentials] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingCredential, setEditingCredential] = useState(null);

    useEffect(() => {
        fetchCredentials();
    }, []);

    const fetchCredentials = async () => {
        try {
            const response = await axios.get('/credentials');
            setCredentials(response.data);
        } catch (error) {
            console.error('Error fetching credentials:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = async (credential) => {
        try {
            // Fetch full credential details including decrypted data
            const response = await axios.get(`/credentials/${credential.id}`);
            setEditingCredential(response.data);
            setShowModal(true);
        } catch (error) {
            console.error('Error fetching credential details:', error);
            alert('Failed to load credential details');
        }
    };

    const handleDelete = async (credentialId) => {
        if (!confirm('Are you sure you want to delete this credential?')) {
            return;
        }

        try {
            await axios.delete(`/credentials/${credentialId}`);
            fetchCredentials();
        } catch (error) {
            console.error('Error deleting credential:', error);
            alert('Failed to delete credential');
        }
    };

    const handleSave = (savedCredential) => {
        fetchCredentials();
        setShowModal(false);
        setEditingCredential(null);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingCredential(null);
    };

    const filteredCredentials = credentials.filter(cred =>
        cred.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cred.type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getCredentialIcon = (type) => {
        const icons = {
            bearer: '🔑',
            api_key: '🗝️',
            oauth2: '🔐',
            basic: '🔓',
            custom: '⚙️'
        };
        return icons[type] || '🔒';
    };

    const getCredentialTypeLabel = (type) => {
        const labels = {
            bearer: 'Bearer Token',
            api_key: 'API Key',
            oauth2: 'OAuth2',
            basic: 'Basic Auth',
            custom: 'Custom Header'
        };
        return labels[type] || type;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Credentials</h2>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your API credentials and authentication</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center space-x-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Create Credential</span>
                </button>
            </div>

            {/* Search */}
            <div className="mb-4">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search credentials..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <svg
                        className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            {/* Credentials List */}
            {filteredCredentials.length === 0 ? (
                <div className="text-center py-12">
                    <div className="text-6xl mb-4">🔐</div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                        {searchTerm ? 'No credentials found' : 'No credentials yet'}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                        {searchTerm ? 'Try a different search term' : 'Create your first credential to get started'}
                    </p>
                    {!searchTerm && (
                        <button
                            onClick={() => setShowModal(true)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                        >
                            Create Credential
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredCredentials.map((credential) => (
                        <div
                            key={credential.id}
                            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-start space-x-4 flex-1">
                                    {/* Icon */}
                                    <div className="text-3xl">{getCredentialIcon(credential.type)}</div>

                                    {/* Details */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                                            {credential.name}
                                        </h3>
                                        <div className="flex items-center space-x-2 mt-1">
                                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-medium rounded">
                                                {getCredentialTypeLabel(credential.type)}
                                            </span>
                                        </div>
                                        {credential.description && (
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                                                {credential.description}
                                            </p>
                                        )}
                                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                                            <span>Created {new Date(credential.created_at).toLocaleDateString()}</span>
                                            <span>•</span>
                                            <span>Updated {new Date(credential.updated_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center space-x-2 ml-4">
                                    <button
                                        onClick={() => handleEdit(credential)}
                                        className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                                        title="Edit credential"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => handleDelete(credential.id)}
                                        className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
                                        title="Delete credential"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <CredentialModal
                    isOpen={showModal}
                    onClose={handleCloseModal}
                    onSave={handleSave}
                    existingCredential={editingCredential}
                />
            )}
        </div>
    );
};

export default CredentialsTab;


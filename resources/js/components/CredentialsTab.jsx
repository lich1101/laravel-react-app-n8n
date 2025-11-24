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

        // Check for OAuth2 callback params
        const urlParams = new URLSearchParams(window.location.search);
        const oauthSuccess = urlParams.get('oauth_success');
        const oauthError = urlParams.get('oauth_error');
        const credentialId = urlParams.get('credential_id');

        if (oauthSuccess === 'true') {
            alert('✅ OAuth2 authorization successful! Your credential is now connected and ready to use.');
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
            // Refresh credentials to show updated status
            setTimeout(() => fetchCredentials(), 1000);
        } else if (oauthError) {
            alert('❌ OAuth2 authorization failed: ' + decodeURIComponent(oauthError));
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
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

    const handleConnectOAuth2 = async (credential) => {
        try {
            // Get authorization URL from backend
            const response = await axios.get(`/credentials/${credential.id}/oauth2/authorize`);
            const authUrl = response.data.authorization_url;
            
            // Open authorization URL in current window
            window.location.href = authUrl;
        } catch (error) {
            console.error('Error starting OAuth2 authorization:', error);
            alert('Failed to start authorization: ' + (error.response?.data?.error || error.message));
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

    const handleExport = async () => {
        try {
            const response = await axios.get('/credentials/export', {
                responseType: 'blob',
            });

            // Create blob and download
            const blob = new Blob([response.data], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `credentials_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            alert('✅ Credentials exported successfully!');
        } catch (error) {
            console.error('Error exporting credentials:', error);
            alert('❌ Failed to export credentials: ' + (error.response?.data?.message || error.message));
        }
    };

    const handleImport = async (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        // Validate file type
        if (!file.name.endsWith('.json')) {
            alert('❌ Please select a JSON file');
            event.target.value = '';
            return;
        }

        if (!confirm('⚠️ Importing credentials will update existing credentials with the same name. Continue?')) {
            event.target.value = '';
            return;
        }

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await axios.post('/credentials/import', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            const { imported, skipped, errors } = response.data;

            let message = `✅ Import completed!\n\n`;
            message += `• Imported: ${imported} credential(s)\n`;
            message += `• Skipped: ${skipped} credential(s)`;

            if (errors && errors.length > 0) {
                message += `\n\n⚠️ Errors (${errors.length}):\n`;
                errors.slice(0, 5).forEach(err => {
                    message += `  - ${err}\n`;
                });
                if (errors.length > 5) {
                    message += `  ... and ${errors.length - 5} more errors`;
                }
            }

            alert(message);

            // Reset file input
            event.target.value = '';

            // Refresh credentials list
            fetchCredentials();
        } catch (error) {
            console.error('Error importing credentials:', error);
            const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Unknown error';
            alert('❌ Failed to import credentials: ' + errorMessage);
            event.target.value = '';
        }
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
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="p-6 bg-surface-elevated border border-subtle rounded-2xl shadow-card">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-primary">Credentials</h2>
                    <p className="text-muted mt-1">Manage your API credentials and authentication</p>
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={handleExport}
                        className="btn btn-secondary text-sm flex items-center space-x-2"
                        title="Export credentials to JSON file"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>Export</span>
                    </button>
                    <button
                        onClick={() => document.getElementById('import-file-input').click()}
                        className="btn btn-secondary text-sm flex items-center space-x-2"
                        title="Import credentials from JSON file"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span>Import</span>
                    </button>
                    <input
                        id="import-file-input"
                        type="file"
                        accept=".json"
                        style={{ display: 'none' }}
                        onChange={handleImport}
                    />
                    <button
                        onClick={() => setShowModal(true)}
                        className="btn btn-primary text-sm flex items-center space-x-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>+ Create Credential</span>
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="mb-4">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search credentials..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 pl-10 border border-subtle rounded-xl bg-surface text-secondary focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <svg
                        className="absolute left-3 top-2.5 w-5 h-5 text-muted"
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
                    <h3 className="text-xl font-semibold text-primary mb-2">
                        {searchTerm ? 'No credentials found' : 'No credentials yet'}
                    </h3>
                    <p className="text-muted mb-4">
                        {searchTerm ? 'Try a different search term' : 'Create your first credential to get started'}
                    </p>
                    {!searchTerm && (
                        <button
                            onClick={() => setShowModal(true)}
                            className="btn btn-primary text-sm"
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
                            className="bg-surface-elevated rounded-2xl border border-subtle p-4 hover:shadow-card transition-shadow"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-start space-x-4 flex-1">
                                    {/* Icon */}
                                    <div className="text-3xl">{getCredentialIcon(credential.type)}</div>

                                    {/* Details */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-semibold text-primary truncate">
                                            {credential.name}
                                        </h3>
                                        <div className="flex items-center space-x-2 mt-1">
                                            <span className="px-2 py-1 bg-primary-soft text-primary text-xs font-medium rounded-full">
                                                {getCredentialTypeLabel(credential.type)}
                                            </span>
                                            {credential.status && (
                                                <span
                                                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                        credential.status === 'connected'
                                                            ? 'bg-emerald-50 text-emerald-600'
                                                            : 'bg-amber-100 text-amber-600'
                                                    }`}
                                                >
                                                    {credential.status === 'connected' ? 'Connected' : credential.status}
                                                </span>
                                            )}
                                        </div>
                                        {credential.description && (
                                            <p className="text-sm text-muted mt-2">
                                                {credential.description}
                                            </p>
                                        )}
                                        <div className="flex items-center space-x-4 mt-2 text-xs text-muted">
                                            <span>Created {new Date(credential.created_at).toLocaleDateString()}</span>
                                            <span>•</span>
                                            <span>Updated {new Date(credential.updated_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center space-x-2 ml-4">
                                    {credential.type === 'oauth2' && (
                                        <button
                                            onClick={() => handleConnectOAuth2(credential)}
                                            className="btn btn-success text-sm px-3 py-1.5 flex items-center space-x-1"
                                            title="Connect to OAuth2 provider"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                            </svg>
                                            <span>Connect</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleEdit(credential)}
                                        className="btn btn-ghost text-sm px-3 py-1.5"
                                        title="Edit credential"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => handleDelete(credential.id)}
                                        className="btn btn-danger text-sm px-3 py-1.5"
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


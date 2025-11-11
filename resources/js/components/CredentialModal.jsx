import React, { useState, useEffect } from 'react';
import axios from '../config/axios';

const CredentialModal = ({ isOpen, onClose, onSave, credentialType = 'bearer', existingCredential = null }) => {
    const [formData, setFormData] = useState({
        name: '',
        type: credentialType,
        description: '',
        data: {}
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null); // { success: true/false, message: '...' }

    useEffect(() => {
        if (existingCredential) {
            // Load existing credential for editing
            loadCredential(existingCredential.id);
        } else {
            // Reset form for new credential
            setFormData({
                name: '',
                type: credentialType,
                description: '',
                data: getDefaultDataForType(credentialType)
            });
        }
    }, [existingCredential, credentialType, isOpen]);

    const getDefaultDataForType = (type) => {
        switch (type) {
            case 'bearer':
                return { token: '' };
            case 'api_key':
                return { key: '', headerName: 'X-API-Key' };
            case 'basic':
                return { username: '', password: '' };
            case 'oauth2':
                return { 
                    service: 'google', // google, microsoft, etc.
                    clientId: '', 
                    clientSecret: '', 
                    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
                    accessTokenUrl: 'https://oauth2.googleapis.com/token',
                    scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/documents',
                    redirectUrl: `${window.location.origin}/api/oauth2/callback`,
                    accessToken: '', 
                    refreshToken: '',
                    tokenType: 'Bearer',
                    expiresAt: null
                };
            case 'custom':
                return { headerName: 'Authorization', headerValue: '' };
            default:
                return {};
        }
    };

    const loadCredential = async (id) => {
        try {
            setLoading(true);
            const response = await axios.get(`/credentials/${id}`);
            setFormData({
                name: response.data.name,
                type: response.data.type,
                description: response.data.description || '',
                data: response.data.data || getDefaultDataForType(response.data.type)
            });
        } catch (err) {
            console.error('Error loading credential:', err);
            setError('Failed to load credential');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            let response;
            if (existingCredential) {
                response = await axios.put(`/credentials/${existingCredential.id}`, formData);
            } else {
                response = await axios.post('/credentials', formData);
            }

            onSave(response.data.credential);
            onClose();
        } catch (err) {
            console.error('Error saving credential:', err);
            setError(err.response?.data?.message || 'Failed to save credential');
        } finally {
            setLoading(false);
        }
    };

    const handleConnectOAuth2 = async () => {
        setTesting(true);
        setTestResult(null);
        setError('');

        try {
            // Validate required fields
            if (!formData.data.clientId || !formData.data.clientSecret) {
                setTestResult({
                    success: false,
                    message: 'Please fill in Client ID and Client Secret first'
                });
                setTesting(false);
                return;
            }

            if (!formData.name) {
                setError('Please enter a credential name first');
                setTesting(false);
                return;
            }

            let authResponse;
            
            if (existingCredential?.id) {
                // Existing credential - just update and get auth URL
                await axios.put(`/credentials/${existingCredential.id}`, formData);
                authResponse = await axios.get(`/credentials/${existingCredential.id}/oauth2/authorize`);
            } else {
                // New credential - send data to backend, it will be saved after successful authorization
                authResponse = await axios.post('/credentials/oauth2/authorize', formData);
            }

            const authUrl = authResponse.data.authorization_url;
            
            // Redirect to Google authorization
            window.location.href = authUrl;
        } catch (err) {
            console.error('OAuth2 connect error:', err);
            setTestResult({
                success: false,
                message: err.response?.data?.error || err.response?.data?.message || 'Failed to start authorization. Please check your credentials.'
            });
            setTesting(false);
        }
    };

    const renderDataFields = () => {
        switch (formData.type) {
            case 'bearer':
                return (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Bearer Token *
                        </label>
                        <input
                            type="password"
                            value={formData.data.token || ''}
                            onChange={(e) => setFormData({
                                ...formData,
                                data: { ...formData.data, token: e.target.value }
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                            placeholder="Enter Bearer token"
                            required
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            This will be sent in the Authorization header as "Bearer {'{token}'}"
                        </p>
                    </div>
                );
            
            case 'api_key':
                return (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                API Key *
                            </label>
                            <input
                                type="password"
                                value={formData.data.key || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, key: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                placeholder="Enter API key"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Header Name
                            </label>
                            <input
                                type="text"
                                value={formData.data.headerName || 'X-API-Key'}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, headerName: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                placeholder="X-API-Key"
                            />
                        </div>
                    </>
                );
            
            case 'basic':
                return (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Username *
                            </label>
                            <input
                                type="text"
                                value={formData.data.username || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, username: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                placeholder="Username"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Password *
                            </label>
                            <input
                                type="password"
                                value={formData.data.password || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, password: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                placeholder="Password"
                                required
                            />
                        </div>
                    </>
                );
            
            case 'oauth2':
                return (
                    <>
                        {/* Service Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Service *
                            </label>
                            <select
                                value={formData.data.service || 'google'}
                                onChange={(e) => {
                                    const service = e.target.value;
                                    let authUrl = '';
                                    let accessTokenUrl = '';
                                    let scope = '';
                                    
                                    if (service === 'google') {
                                        authUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
                                        accessTokenUrl = 'https://oauth2.googleapis.com/token';
                                        scope = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/documents';
                                    } else if (service === 'microsoft') {
                                        authUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
                                        accessTokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
                                        scope = 'Files.ReadWrite.All Sites.ReadWrite.All';
                                    }
                                    
                                    setFormData({
                                        ...formData,
                                        data: { 
                                            ...formData.data, 
                                            service,
                                            authUrl,
                                            accessTokenUrl,
                                            scope
                                        }
                                    });
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                            >
                                <option value="google">Google (Drive, Sheets, Docs)</option>
                                <option value="microsoft">Microsoft (OneDrive, Excel)</option>
                                <option value="custom">Custom OAuth2</option>
                            </select>
                        </div>

                        {/* OAuth Redirect URL - Read only */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                OAuth Redirect URL
                            </label>
                            <input
                                type="text"
                                value={formData.data.redirectUrl || `${window.location.origin}/api/oauth2/callback`}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-700"
                            />
                            <p className="mt-1 text-xs text-amber-600">
                                ⚠️ Use this URL in {formData.data.service === 'google' ? 'Google Cloud Console' : 'OAuth provider'} as the redirect URI
                            </p>
                        </div>

                        {/* Client ID */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Client ID *
                            </label>
                            <input
                                type="text"
                                value={formData.data.clientId || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, clientId: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 font-mono text-sm"
                                placeholder="123456789.apps.googleusercontent.com"
                                required
                            />
                        </div>

                        {/* Client Secret */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Client Secret *
                            </label>
                            <input
                                type="password"
                                value={formData.data.clientSecret || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, clientSecret: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 font-mono text-sm"
                                placeholder="Enter client secret"
                                required
                            />
                        </div>

                        {/* Scope */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Scope
                            </label>
                            <textarea
                                value={formData.data.scope || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, scope: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 font-mono text-xs"
                                placeholder="Space-separated scopes"
                                rows={2}
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Default scopes for {formData.data.service === 'google' ? 'Google Drive, Sheets, Docs' : 'selected service'}
                            </p>
                        </div>

                        {/* Authorization Instruction (if tokens not present) */}
                        {(!formData.data.accessToken || !formData.data.refreshToken) && formData.data.clientId && formData.data.clientSecret && (
                            <div className="bg-green-50 border border-green-200 rounded p-3">
                                <p className="text-sm text-green-800 mb-2">
                                    🔐 Ready to authorize with {formData.data.service === 'google' ? 'Google' : 'OAuth provider'}!
                                </p>
                                <p className="text-xs text-green-700">
                                    Click the green "Connect" button above to save and authorize in one step.
                                </p>
                            </div>
                        )}

                        {/* Token Status (if tokens exist) */}
                        {formData.data.accessToken && formData.data.refreshToken && (
                            <div className="bg-green-50 border border-green-200 rounded p-3">
                                <div className="flex items-center space-x-2">
                                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-sm font-medium text-green-800">
                                        Account Connected
                                    </span>
                                </div>
                                {formData.data.expiresAt && (
                                    <p className="text-xs text-green-700 mt-1">
                                        Token expires: {new Date(formData.data.expiresAt).toLocaleString()}
                                    </p>
                                )}
                            </div>
                        )}
                    </>
                );
            
            case 'custom':
                return (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Header Name *
                            </label>
                            <input
                                type="text"
                                value={formData.data.headerName || 'Authorization'}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, headerName: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                placeholder="Authorization"
                                required
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                E.g., "Authorization", "X-Custom-Auth", "Api-Token"
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Header Value *
                            </label>
                            <input
                                type="password"
                                value={formData.data.headerValue || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, headerValue: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                placeholder="Enter header value/key"
                                required
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                The value that will be sent in the header
                            </p>
                        </div>
                    </>
                );
            
            default:
                return null;
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-gray-900">
                        {existingCredential ? 'Edit Credential' : 'Create New Credential'}
                    </h2>
                    <div className="flex items-center space-x-2">
                        {/* Connect Button (only for OAuth2) */}
                        {formData.type === 'oauth2' && (
                            <button
                                type="button"
                                onClick={handleConnectOAuth2}
                                disabled={testing || !formData.data.clientId || !formData.data.clientSecret || !formData.name}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                                title="Connect and authorize with OAuth2 provider"
                            >
                                {testing ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span>Connecting...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                        </svg>
                                        <span>Connect</span>
                                    </>
                                )}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                            {error}
                        </div>
                    )}

                    {/* Test Result */}
                    {testResult && (
                        <div className={`border px-4 py-3 rounded-2xl ${
                            testResult.success 
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                : 'bg-rose-50 border-rose-300 text-rose-700'
                        }`}>
                            <div className="flex items-start space-x-2">
                                {testResult.success ? (
                                    <svg className="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                )}
                                <div>
                                    <p className="font-medium">{testResult.success ? 'Connection Successful!' : 'Connection Failed'}</p>
                                    <p className="text-sm mt-1">{testResult.message}</p>
                                    
                                    {/* Show detailed test results for OAuth2 */}
                                    {testResult.success && testResult.details && formData.type === 'oauth2' && (
                                        <div className="mt-2 text-xs text-muted">
                                            <div className="flex items-center space-x-4">
                                                <span className="flex items-center">
                                                    <svg className="w-3 h-3 text-green-500 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                    Format valid
                                                </span>
                                                <span className="flex items-center">
                                                    <svg className="w-3 h-3 text-green-500 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                    OAuth endpoints reachable
                                                </span>
                                                <span className="flex items-center">
                                                    <svg className="w-3 h-3 text-green-500 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                    Ready to use
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Credential Name *
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                            placeholder="e.g., Production API Key"
                            required
                        />
                    </div>

                    {/* Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Authentication Type
                        </label>
                        <select
                            value={formData.type}
                            onChange={(e) => setFormData({
                                ...formData,
                                type: e.target.value,
                                data: getDefaultDataForType(e.target.value)
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                            disabled={!!existingCredential}
                        >
                            <option value="bearer">Bearer Token</option>
                            <option value="api_key">API Key</option>
                            <option value="basic">Basic Auth</option>
                            <option value="oauth2">OAuth2</option>
                            <option value="custom">Custom Header</option>
                        </select>
                    </div>

                    {/* Type-specific fields */}
                    {renderDataFields()}

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Description (Optional)
                        </label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                            placeholder="Add notes about this credential"
                            rows={3}
                        />
                    </div>

                    {/* Info message */}
                    <div className="bg-blue-50 border border-blue-200 rounded p-3">
                        <p className="text-sm text-blue-800">
                            🔒 Your credential data will be encrypted and stored securely.
                        </p>
                    </div>

                    {/* OAuth2 Connect Instruction */}
                    {formData.type === 'oauth2' && (!formData.data.accessToken || !formData.data.refreshToken) && (
                        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded">
                            <div className="flex items-start space-x-2">
                                <svg className="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <div>
                                    <p className="font-medium">Authorization Required</p>
                                    <p className="text-sm mt-1">Click the green "Connect" button at the top to authorize with {formData.data.service === 'google' ? 'Google' : 'OAuth provider'}. This will save your credential and redirect you to authorize in one step.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Buttons */}
                    <div className="flex space-x-3 pt-4">
                        {/* For OAuth2 without tokens, hide Create/Update button (use Connect instead) */}
                        {!(formData.type === 'oauth2' && !formData.data.accessToken) && (
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium disabled:opacity-50"
                            >
                                {loading ? 'Saving...' : existingCredential ? 'Update' : 'Create'}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md font-medium"
                        >
                            {formData.type === 'oauth2' && !formData.data.accessToken ? 'Cancel' : 'Close'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CredentialModal;


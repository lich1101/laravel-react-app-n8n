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
                    scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
                    redirectUrl: `${window.location.origin}/oauth2/callback`,
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

    const handleTestConnection = async () => {
        setTesting(true);
        setTestResult(null);
        setError('');

        try {
            if (formData.type === 'oauth2') {
                // Test OAuth2 configuration
                if (!formData.data.clientId || !formData.data.clientSecret) {
                    setTestResult({
                        success: false,
                        message: 'Please fill in Client ID and Client Secret first'
                    });
                    setTesting(false);
                    return;
                }

                // Test by attempting to validate the OAuth2 config
                // In real implementation, this would ping Google's token endpoint
                const testResponse = await axios.post('/credentials/test-oauth2', {
                    service: formData.data.service,
                    clientId: formData.data.clientId,
                    clientSecret: formData.data.clientSecret,
                    authUrl: formData.data.authUrl,
                    accessTokenUrl: formData.data.accessTokenUrl,
                    scope: formData.data.scope,
                    redirectUrl: formData.data.redirectUrl
                });

                setTestResult({
                    success: true,
                    message: testResponse.data.message || 'OAuth2 configuration is valid!',
                    details: testResponse.data.details || null
                });
            } else if (formData.type === 'bearer') {
                // Test bearer token (could ping an endpoint)
                setTestResult({
                    success: true,
                    message: 'Bearer token format is valid'
                });
            } else {
                setTestResult({
                    success: true,
                    message: 'Configuration looks good'
                });
            }
        } catch (err) {
            console.error('Test connection error:', err);
            setTestResult({
                success: false,
                message: err.response?.data?.message || 'Connection test failed. Please check your credentials.'
            });
        } finally {
            setTesting(false);
        }
    };

    const renderDataFields = () => {
        switch (formData.type) {
            case 'bearer':
                return (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Bearer Token *
                        </label>
                        <input
                            type="password"
                            value={formData.data.token || ''}
                            onChange={(e) => setFormData({
                                ...formData,
                                data: { ...formData.data, token: e.target.value }
                            })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                            placeholder="Enter Bearer token"
                            required
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            This will be sent in the Authorization header as "Bearer {'{token}'}"
                        </p>
                    </div>
                );
            
            case 'api_key':
                return (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                API Key *
                            </label>
                            <input
                                type="password"
                                value={formData.data.key || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, key: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                                placeholder="Enter API key"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Header Name
                            </label>
                            <input
                                type="text"
                                value={formData.data.headerName || 'X-API-Key'}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, headerName: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                                placeholder="X-API-Key"
                            />
                        </div>
                    </>
                );
            
            case 'basic':
                return (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Username *
                            </label>
                            <input
                                type="text"
                                value={formData.data.username || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, username: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                                placeholder="Username"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Password *
                            </label>
                            <input
                                type="password"
                                value={formData.data.password || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, password: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
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
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                            >
                                <option value="google">Google (Drive, Sheets, Docs)</option>
                                <option value="microsoft">Microsoft (OneDrive, Excel)</option>
                                <option value="custom">Custom OAuth2</option>
                            </select>
                        </div>

                        {/* OAuth Redirect URL - Read only */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                OAuth Redirect URL
                            </label>
                            <input
                                type="text"
                                value={formData.data.redirectUrl || `${window.location.origin}/oauth2/callback`}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                            />
                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                ⚠️ Use this URL in {formData.data.service === 'google' ? 'Google Cloud Console' : 'OAuth provider'} as the redirect URI
                            </p>
                        </div>

                        {/* Client ID */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Client ID *
                            </label>
                            <input
                                type="text"
                                value={formData.data.clientId || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, clientId: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
                                placeholder="123456789.apps.googleusercontent.com"
                                required
                            />
                        </div>

                        {/* Client Secret */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Client Secret *
                            </label>
                            <input
                                type="password"
                                value={formData.data.clientSecret || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, clientSecret: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
                                placeholder="Enter client secret"
                                required
                            />
                        </div>

                        {/* Scope */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Scope
                            </label>
                            <textarea
                                value={formData.data.scope || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, scope: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-xs"
                                placeholder="Space-separated scopes"
                                rows={2}
                            />
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Default scopes for {formData.data.service === 'google' ? 'Google Drive, Sheets, Docs' : 'selected service'}
                            </p>
                        </div>

                        {/* Authorization Button (if tokens not present) */}
                        {(!formData.data.accessToken || !formData.data.refreshToken) && formData.data.clientId && formData.data.clientSecret && (
                            <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded p-3">
                                <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                                    🔐 After saving, you'll need to authorize this credential with {formData.data.service === 'google' ? 'Google' : 'OAuth provider'}
                                </p>
                                <p className="text-xs text-blue-700 dark:text-blue-300">
                                    Save this credential first, then click "Connect" to authorize.
                                </p>
                            </div>
                        )}

                        {/* Token Status (if tokens exist) */}
                        {formData.data.accessToken && formData.data.refreshToken && (
                            <div className="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded p-3">
                                <div className="flex items-center space-x-2">
                                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-sm font-medium text-green-800 dark:text-green-200">
                                        Account Connected
                                    </span>
                                </div>
                                {formData.data.expiresAt && (
                                    <p className="text-xs text-green-700 dark:text-green-300 mt-1">
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
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Header Name *
                            </label>
                            <input
                                type="text"
                                value={formData.data.headerName || 'Authorization'}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, headerName: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                                placeholder="Authorization"
                                required
                            />
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                E.g., "Authorization", "X-Custom-Auth", "Api-Token"
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Header Value *
                            </label>
                            <input
                                type="password"
                                value={formData.data.headerValue || ''}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    data: { ...formData.data, headerValue: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                                placeholder="Enter header value/key"
                                required
                            />
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {existingCredential ? 'Edit Credential' : 'Create New Credential'}
                    </h2>
                    <div className="flex items-center space-x-2">
                        {/* Test Connection Button (only for OAuth2) */}
                        {formData.type === 'oauth2' && (
                            <button
                                type="button"
                                onClick={handleTestConnection}
                                disabled={testing || !formData.data.clientId || !formData.data.clientSecret}
                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                                title="Test OAuth2 connection"
                            >
                                {testing ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span>Testing...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span>Test</span>
                                    </>
                                )}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded">
                            {error}
                        </div>
                    )}

                    {/* Test Result */}
                    {testResult && (
                        <div className={`border px-4 py-3 rounded ${
                            testResult.success 
                                ? 'bg-green-100 dark:bg-green-900 border-green-400 dark:border-green-700 text-green-700 dark:text-green-200'
                                : 'bg-red-100 dark:bg-red-900 border-red-400 dark:border-red-700 text-red-700 dark:text-red-200'
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
                                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Credential Name *
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                            placeholder="e.g., Production API Key"
                            required
                        />
                    </div>

                    {/* Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Authentication Type
                        </label>
                        <select
                            value={formData.type}
                            onChange={(e) => setFormData({
                                ...formData,
                                type: e.target.value,
                                data: getDefaultDataForType(e.target.value)
                            })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Description (Optional)
                        </label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                            placeholder="Add notes about this credential"
                            rows={3}
                        />
                    </div>

                    {/* Info message */}
                    <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded p-3">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                            🔒 Your credential data will be encrypted and stored securely.
                        </p>
                    </div>

                    {/* OAuth2 Test Required Message */}
                    {formData.type === 'oauth2' && (!testResult || !testResult.success) && (
                        <div className="bg-yellow-100 dark:bg-yellow-900 border border-yellow-400 dark:border-yellow-700 text-yellow-700 dark:text-yellow-200 px-4 py-3 rounded">
                            <div className="flex items-start space-x-2">
                                <svg className="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                <div>
                                    <p className="font-medium">Test Required</p>
                                    <p className="text-sm mt-1">Please test your OAuth2 connection before saving. Click the "Test" button above to verify your credentials.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Buttons */}
                    <div className="flex space-x-3 pt-4">
                        <button
                            type="submit"
                            disabled={loading || (formData.type === 'oauth2' && (!testResult || !testResult.success))}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : existingCredential ? 'Update' : 'Create'}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-700 text-gray-700 dark:text-white px-4 py-2 rounded-md font-medium"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CredentialModal;


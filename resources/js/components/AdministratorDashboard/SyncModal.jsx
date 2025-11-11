import React, { useState } from 'react';

const SyncModal = ({ isOpen, onClose, onConfirm, folderName }) => {
    const [isSyncing, setIsSyncing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState('');
    const [syncResults, setSyncResults] = useState(null);
    const [errors, setErrors] = useState([]);

    const handleConfirm = async () => {
        setIsSyncing(true);
        setProgress(0);
        setCurrentStep('Preparing sync...');
        setSyncResults(null);
        setErrors([]);

        try {
            // Call the actual sync function
            const response = await onConfirm();

            // Check if response contains sync results
            if (response && response.data) {
                setSyncResults(response.data.sync_results || []);
                setErrors(response.data.errors || []);
            }

            setProgress(100);
            setCurrentStep('Sync completed!');

            // Close modal after a short delay
            setTimeout(() => {
                setIsSyncing(false);
                setProgress(0);
                setCurrentStep('');
                setSyncResults(null);
                setErrors([]);
                onClose();
            }, 3000);

        } catch (error) {
            setCurrentStep('Sync failed: ' + (error.response?.data?.message || error.message || 'Unknown error'));
            setIsSyncing(false);

            // Show error details if available
            if (error.response?.data?.errors) {
                setErrors(error.response.data.errors);
            }
            if (error.response?.data?.sync_results) {
                setSyncResults(error.response.data.sync_results);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                        Sync Folder
                    </h3>
                    {!isSyncing && (
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className="mb-4">
                    <p className="text-gray-600 mb-2">
                        Sync folder <span className="font-semibold text-gray-900">"{folderName}"</span> to all assigned projects?
                    </p>
                    <p className="text-sm text-gray-500">
                        This will update all workflows in those projects and may take a few moments.
                    </p>
                </div>

                {isSyncing ? (
                    <div className="space-y-4">
                        <div className="bg-surface-muted rounded-full h-2">
                            <div
                                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                        <div className="text-center">
                            <p className="text-sm text-secondary">
                                {currentStep}
                            </p>
                            <p className="text-xs text-muted mt-1">
                                {progress}% complete
                            </p>
                        </div>

                        {/* Show sync results if available */}
                        {syncResults && syncResults.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-sm font-medium text-primary mb-2">Sync Results:</h4>
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {syncResults.map((result, index) => (
                                        <div key={index} className="text-xs p-2 rounded bg-surface-muted">
                                            <span className="font-medium text-secondary">{result.project}:</span>
                                            <span className={`ml-2 ${
                                                result.status === 'success' || result.status === 'created' || result.status === 'updated'
                                                    ? 'text-emerald-600'
                                                    : result.status === 'failed'
                                                        ? 'text-rose-600'
                                                        : 'text-amber-600'
                                            }`}>
                                                {result.status}
                                            </span>
                                            {result.error && (
                                                <div className="text-rose-500 text-xs mt-1">{result.error}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Show errors if any */}
                        {errors && errors.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-sm font-medium text-rose-600 mb-2">Errors:</h4>
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {errors.map((error, index) => (
                                        <div key={index} className="text-xs text-rose-500 p-2 rounded bg-rose-50">
                                            {error}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex space-x-3">
                        <button
                            onClick={onClose}
                            className="flex-1 btn btn-muted text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="flex-1 btn text-sm bg-amber-500 hover:bg-amber-600 text-white shadow-card"
                        >
                            Sync
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SyncModal;

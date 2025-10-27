import React, { useState } from 'react';

const SyncModal = ({ isOpen, onClose, onConfirm, folderName }) => {
    const [isSyncing, setIsSyncing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState('');

    const handleConfirm = async () => {
        setIsSyncing(true);
        setProgress(0);
        setCurrentStep('Preparing sync...');

        try {
            // Simulate progress steps
            const steps = [
                'Validating folder data...',
                'Finding assigned projects...',
                'Calling project domain APIs...',
                'Creating/updating folders in projects...',
                'Finalizing sync...'
            ];

            for (let i = 0; i < steps.length; i++) {
                setCurrentStep(steps[i]);
                setProgress((i + 1) * 20);
                await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay
            }

            // Call the actual sync function
            await onConfirm();

            setProgress(100);
            setCurrentStep('Sync completed successfully!');

            // Close modal after a short delay
            setTimeout(() => {
                setIsSyncing(false);
                setProgress(0);
                setCurrentStep('');
                onClose();
            }, 1000);

        } catch (error) {
            setCurrentStep('Sync failed: ' + (error.message || 'Unknown error'));
            setIsSyncing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 max-w-md mx-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Sync Folder
                    </h3>
                    {!isSyncing && (
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className="mb-4">
                    <p className="text-gray-600 dark:text-gray-400 mb-2">
                        Sync folder <span className="font-semibold text-gray-900 dark:text-white">"{folderName}"</span> to all assigned projects?
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">
                        This will update all workflows in those projects and may take a few moments.
                    </p>
                </div>

                {isSyncing ? (
                    <div className="space-y-4">
                        <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                        <div className="text-center">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {currentStep}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                {progress}% complete
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex space-x-3">
                        <button
                            onClick={onClose}
                            className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md text-sm font-medium dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            className="flex-1 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md text-sm font-medium"
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

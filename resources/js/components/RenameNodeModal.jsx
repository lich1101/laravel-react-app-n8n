import React, { useState, useEffect } from 'react';

function RenameNodeModal({ isOpen, currentName, onRename, onClose, existingNames = [] }) {
    const [newName, setNewName] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setNewName(currentName || '');
            setError('');
        }
    }, [isOpen, currentName]);

    const handleSubmit = () => {
        const trimmedName = newName.trim();
        
        if (!trimmedName) {
            setError('Tên node không được để trống');
            return;
        }

        // Check if name is duplicate
        if (existingNames.includes(trimmedName)) {
            setError('Tên này đã được sử dụng. Hệ thống sẽ tự động thêm số.');
            // Auto-number
            let counter = 1;
            let finalName = `${trimmedName} ${counter}`;
            while (existingNames.includes(finalName)) {
                counter++;
                finalName = `${trimmedName} ${counter}`;
            }
            onRename(finalName);
            onClose();
            return;
        }

        onRename(trimmedName);
        onClose();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSubmit();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
            <div className="bg-white rounded-lg shadow-2xl w-[400px] border border-gray-200">
                {/* Header */}
                <div className="border-b border-gray-200 px-6 py-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                        Rename node
                    </h3>
                </div>

                {/* Content */}
                <div className="p-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Node name
                        </label>
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => {
                                setNewName(e.target.value);
                                setError('');
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter node name"
                            autoFocus
                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        {error && (
                            <p className="mt-2 text-sm text-yellow-600">
                                ⚠️ {error}
                            </p>
                        )}
                        <p className="mt-2 text-xs text-gray-500">
                            💡 Tên node sẽ được dùng để reference trong các node khác. Ví dụ: <code className="bg-gray-100 px-1 rounded">{`{{${newName || 'NodeName'}.field}}`}</code>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!newName.trim()}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-md transition-colors"
                    >
                        Rename
                    </button>
                </div>
            </div>
        </div>
    );
}

export default RenameNodeModal;


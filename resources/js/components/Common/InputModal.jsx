import React, { useState } from 'react';

const InputModal = ({ isOpen, onClose, onConfirm, title, message, placeholder = '', confirmText = 'Xác nhận', cancelText = 'Hủy' }) => {
    const [inputValue, setInputValue] = useState('');

    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm(inputValue);
        setInputValue('');
    };

    const handleClose = () => {
        setInputValue('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
                    <p className="text-gray-600 mb-4">{message}</p>
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={placeholder}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-6"
                        autoFocus
                    />
                    <div className="flex justify-end space-x-3">
                        {cancelText && (
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                {cancelText}
                            </button>
                        )}
                        <button
                            onClick={handleConfirm}
                            disabled={!inputValue.trim()}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InputModal;


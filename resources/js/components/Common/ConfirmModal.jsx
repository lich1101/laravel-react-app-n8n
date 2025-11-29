import React from 'react';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Xác nhận', cancelText = 'Hủy', type = 'info' }) => {
    if (!isOpen) {
        return null;
    }
    
    console.log('ConfirmModal rendering, isOpen:', isOpen);

    const getButtonColor = () => {
        switch (type) {
            case 'danger':
                return 'bg-red-600 hover:bg-red-700';
            case 'warning':
                return 'bg-yellow-600 hover:bg-yellow-700';
            case 'success':
                return 'bg-green-600 hover:bg-green-700';
            default:
                return 'bg-blue-600 hover:bg-blue-700';
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
                    <p className="text-gray-600 mb-6">{message}</p>
                    <div className="flex justify-end space-x-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`px-4 py-2 text-white rounded-lg transition-colors ${getButtonColor()}`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;


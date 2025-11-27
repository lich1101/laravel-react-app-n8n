import React from 'react';

const WorkflowLimitModal = ({ isOpen, onClose, subscriptionPackageName, currentCount, maxLimit }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="p-6">
                    <div className="flex items-center justify-center w-12 h-12 mx-auto bg-yellow-100 rounded-full mb-4">
                        <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                        Đã đạt giới hạn workflow
                    </h3>
                    <p className="text-sm text-gray-600 text-center mb-4">
                        Số lượng workflows có thể tạo đã đến giới hạn của <strong>{subscriptionPackageName || 'gói cước hiện tại'}</strong>
                    </p>
                    <div className="bg-gray-50 rounded-lg p-3 mb-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Số workflow hiện tại:</span>
                            <span className="font-semibold text-gray-900">{currentCount}</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                            <span className="text-gray-600">Giới hạn:</span>
                            <span className="font-semibold text-gray-900">{maxLimit}</span>
                        </div>
                    </div>
                    <p className="text-sm text-gray-700 text-center mb-6">
                        Vui lòng liên hệ đội ngũ hỗ trợ để đổi gói cước
                    </p>
                    <button
                        onClick={onClose}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
                    >
                        Đã hiểu
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WorkflowLimitModal;


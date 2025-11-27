import React from 'react';
import ModalHeader from './ModalHeader';

/**
 * Layout wrapper cho config modals với structure chung
 * @param {Object} props
 * @param {Object} props.node - Node object
 * @param {Function} props.onRename - Rename handler
 * @param {Function} props.onClose - Close handler
 * @param {string} props.title - Modal title
 * @param {string|ReactNode} props.icon - Icon (emoji or React component) - deprecated, use iconPath instead
 * @param {string} props.iconPath - Path to icon SVG file
 * @param {boolean} props.readOnly - Whether modal is read-only
 * @param {boolean} props.isTesting - Whether test is running
 * @param {ReactNode} props.testButtons - Test/Stop test buttons
 * @param {ReactNode} props.children - Modal content
 * @param {string} props.size - Modal size ('default' | 'large' | 'extra-large')
 */
export default function ConfigModalLayout({
    node,
    onRename,
    onClose,
    title,
    icon,
    iconPath,
    readOnly = false,
    isTesting = false,
    testButtons,
    children,
    size = 'default'
}) {
    const sizeClasses = {
        default: 'w-[90vw] h-[90vh]',
        large: 'w-[95vw] h-[95vh]',
        'extra-large': 'w-[98vw] h-[98vh]'
    };

    const headerActions = (
        <>
            {testButtons}
            {readOnly && (
                <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded font-medium">
                    📖 Viewing execution history (Read-only)
                </span>
            )}
        </>
    );

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
            <div className={`bg-white rounded-lg shadow-xl ${sizeClasses[size]} flex flex-col`}>
                <ModalHeader
                    node={node}
                    onRename={onRename}
                    onClose={onClose}
                    title={title}
                    icon={icon}
                    iconPath={iconPath}
                    readOnly={readOnly}
                    actions={headerActions}
                />
                
                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {isTesting ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                            <p className="text-center">Đang xử lý...</p>
                        </div>
                    ) : (
                        children
                    )}
                </div>
            </div>
        </div>
    );
}


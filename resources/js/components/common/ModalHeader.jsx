import React from 'react';

/**
 * Reusable modal header component với rename functionality
 * @param {Object} props
 * @param {Object} props.node - Node object
 * @param {Function} props.onRename - Rename handler
 * @param {Function} props.onClose - Close handler
 * @param {string} props.title - Modal title
 * @param {string|ReactNode} props.icon - Icon (emoji or React component) - deprecated, use iconPath instead
 * @param {string} props.iconPath - Path to icon SVG file
 * @param {boolean} props.readOnly - Whether modal is read-only
 * @param {ReactNode} props.actions - Additional action buttons (e.g., test buttons)
 * @param {string} props.className - Additional CSS classes
 */
export default function ModalHeader({
    node,
    onRename,
    onClose,
    title,
    icon,
    iconPath,
    readOnly = false,
    actions,
    className = ''
}) {
    const displayTitle = node?.data?.customName || title || 'Config';

    return (
        <div className={`border-b border-gray-200 px-6 py-4 flex items-center justify-between bg-white ${className}`}>
            <div className="flex items-center gap-3">
                {iconPath ? (
                    <img 
                        src={iconPath} 
                        alt={title || 'Node'}
                        className="w-8 h-8"
                    />
                ) : icon && (
                    <span className="text-3xl">{icon}</span>
                )}
                <h2
                    className={`text-xl font-semibold text-gray-900 ${
                        !readOnly && onRename
                            ? 'cursor-pointer hover:text-blue-600 transition-colors'
                            : 'cursor-default'
                    } flex items-center gap-2`}
                    onClick={() => {
                        if (onRename && !readOnly) {
                            onRename();
                        }
                    }}
                    title={readOnly ? "Read-only mode" : onRename ? "Click để đổi tên node" : ""}
                >
                    {displayTitle}
                    {!readOnly && onRename && (
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                    )}
                </h2>
            </div>
            <div className="flex items-center gap-3">
                {actions}
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        title="Đóng"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}


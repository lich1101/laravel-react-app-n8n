import React from 'react';

const VariableInput = ({ value, onChange, onDrop, onDragOver, ...props }) => {
    // Function to render text with variable highlighting
    const renderWithVariableHighlight = (text) => {
        if (!text || typeof text !== 'string') return null;

        const parts = text.split(/(\{\{[^}]+\}\})/g);
        return parts.map((part, index) => {
            if (part.match(/^\{\{[^}]+\}\}$/)) {
                return (
                    <span key={index} className="text-blue-500 dark:text-blue-400 font-mono bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded border border-blue-300 dark:border-blue-700 font-semibold">
                        {part}
                    </span>
                );
            }
            return <span key={index} className="text-gray-900 dark:text-gray-100">{part}</span>;
        });
    };

    return (
        <div>
            <input
                value={value}
                onChange={onChange}
                onDrop={onDrop}
                onDragOver={onDragOver}
                {...props}
                className={`${props.className || ''} font-mono`}
            />
            {value && value.includes('{{') && (
                <div className="mt-1 text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400">Preview: </span>
                    {renderWithVariableHighlight(value)}
                </div>
            )}
        </div>
    );
};

export default VariableInput;

import React from 'react';

const VariableInput = ({ value, onChange, onDrop, onDragOver, inputData, ...props }) => {
    // Function to resolve variables from inputData
    const resolveVariables = (text) => {
        if (!text || typeof text !== 'string' || !inputData) return text;
        
        let resolved = text;
        const variablePattern = /\{\{([^}]+)\}\}/g;
        
        resolved = resolved.replace(variablePattern, (match, path) => {
            try {
                // Remove spaces
                const cleanPath = path.trim();
                
                console.log('🔍 Resolving variable:', cleanPath);
                console.log('📦 inputData:', inputData);
                
                // Handle input-0.body.name format
                // Split into parts: ['input-0', 'body', 'name']
                const pathParts = cleanPath.split('.');
                
                console.log('🔢 Path parts:', pathParts);
                
                let currentValue = null;
                
                // First part should be like "input-0", "input-1", etc.
                const firstPart = pathParts[0];
                if (firstPart && firstPart.startsWith('input-')) {
                    const inputIndex = parseInt(firstPart.replace('input-', ''));
                    console.log(`  → Input index: ${inputIndex}`);
                    
                    if (Array.isArray(inputData) && inputData[inputIndex]) {
                        currentValue = inputData[inputIndex];
                        console.log(`  ✓ Found input[${inputIndex}]:`, currentValue);
                        
                        // Navigate through remaining parts
                        for (let i = 1; i < pathParts.length; i++) {
                            const part = pathParts[i];
                            console.log(`  → Looking for "${part}" in:`, currentValue);
                            
                            if (currentValue && typeof currentValue === 'object') {
                                currentValue = currentValue[part];
                                console.log(`    ✓ Found:`, currentValue);
                            } else {
                                console.log(`    ✗ Cannot navigate further`);
                                return match;
                            }
                        }
                    } else {
                        console.log(`  ✗ Input ${inputIndex} not found in inputData`);
                        return match;
                    }
                } else {
                    console.log(`  ✗ First part "${firstPart}" is not in input-X format`);
                    return match;
                }
                
                // Return resolved value
                if (currentValue !== undefined && currentValue !== null) {
                    const result = typeof currentValue === 'object' ? JSON.stringify(currentValue) : String(currentValue);
                    console.log('✅ Resolved to:', result);
                    return result;
                }
                
                console.log('❌ Value is undefined/null');
                return match;
            } catch (error) {
                console.error('❌ Error resolving variable:', error);
                return match;
            }
        });
        
        return resolved;
    };

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

    const resolvedValue = resolveVariables(value);
    const hasVariables = value && value.includes('{{');
    const hasResolved = hasVariables && resolvedValue !== value;

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
            {hasVariables && (
                <div className="mt-1 text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-700">
                    <div className="flex items-start space-x-2">
                        <span className="text-gray-500 dark:text-gray-400 font-semibold shrink-0">
                            Preview:
                        </span>
                        <span className="text-green-600 dark:text-green-400 font-mono break-all">
                            {resolvedValue}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VariableInput;

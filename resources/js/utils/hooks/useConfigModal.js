import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook để quản lý logic chung cho config modals
 * @param {Object} props - Configuration props
 * @param {Function} props.onTest - Test handler function
 * @param {Function} props.onSave - Save handler function
 * @param {Function} props.onClose - Close handler function
 * @param {Function} props.onTestResult - Test result callback
 * @param {Object} props.node - Node object
 * @param {Object} props.config - Current config state
 * @param {Object} props.inputData - Input data for testing
 * @param {Object} props.outputData - Output data to display
 * @param {boolean} props.readOnly - Whether modal is read-only
 * @returns {Object} Modal state and handlers
 */
export function useConfigModal({
    onTest,
    onSave,
    onClose,
    onTestResult,
    node,
    config,
    inputData,
    outputData,
    readOnly = false
}) {
    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const testAbortControllerRef = useRef(null);
    const [inputViewMode, setInputViewMode] = useState('schema'); // 'schema' or 'json'
    const [outputViewMode, setOutputViewMode] = useState('json'); // 'schema' or 'json'
    const [collapsedPaths, setCollapsedPaths] = useState(new Set());

    const handleSave = () => {
        if (onSave && config) {
            onSave(config);
        }
    };

    const handleClose = () => {
        // Stop test if currently testing
        if (isTesting && testAbortControllerRef.current) {
            handleStopTest();
        }
        handleSave();
        if (onClose) {
            onClose();
        }
    };

    const handleTest = async () => {
        if (!onTest || readOnly) return;

        setIsTesting(true);
        setTestResults(null);
        
        // Create AbortController for this test
        const abortController = new AbortController();
        testAbortControllerRef.current = abortController;
        
        try {
            const result = await onTest(config);
            
            // Check if test was cancelled
            if (abortController.signal.aborted) {
                console.log('Test was cancelled');
                return;
            }
            
            setTestResults(result);

            if (onTestResult && node?.id) {
                onTestResult(node.id, result);
            }
        } catch (error) {
            // Check if test was cancelled
            if (abortController.signal.aborted) {
                console.log('Test was cancelled');
                return;
            }
            
            const errorResult = {
                error: error.message || 'An error occurred',
            };
            setTestResults(errorResult);

            if (onTestResult && node?.id) {
                onTestResult(node.id, errorResult);
            }
        } finally {
            if (!abortController.signal.aborted) {
                setIsTesting(false);
            }
            testAbortControllerRef.current = null;
        }
    };

    const handleStopTest = () => {
        if (testAbortControllerRef.current) {
            testAbortControllerRef.current.abort();
            setIsTesting(false);
            setTestResults(null);
            testAbortControllerRef.current = null;
            console.log('Test stopped by user');
        }
    };

    const getDisplayOutput = () => {
        if (testResults) return testResults;
        if (outputData) return outputData;
        return null;
    };

    const togglePathCollapse = (path) => {
        setCollapsedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    return {
        // State
        testResults,
        isTesting,
        inputViewMode,
        outputViewMode,
        collapsedPaths,
        displayOutput: getDisplayOutput(),
        
        // Setters
        setInputViewMode,
        setOutputViewMode,
        
        // Handlers
        handleSave,
        handleClose,
        handleTest,
        handleStopTest,
        togglePathCollapse,
    };
}


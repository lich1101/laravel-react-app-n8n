import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from '../config/axios';
import ReactFlow, { Background, Controls, MiniMap, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import NodeViewModal from './NodeViewModal';

const WorkflowHistory = () => {
    const { id: workflowId } = useParams();
    const [executions, setExecutions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedExecution, setSelectedExecution] = useState(null);
    const [executionDetails, setExecutionDetails] = useState(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [workflowNodes, setWorkflowNodes] = useState([]);
    const [workflowEdges, setWorkflowEdges] = useState([]);
    const [selectedNodeForView, setSelectedNodeForView] = useState(null);

    useEffect(() => {
        fetchExecutions();
        fetchWorkflow();
    }, [workflowId]);

    const fetchWorkflow = async () => {
        try {
            const response = await axios.get(`/workflows/${workflowId}`);
            setWorkflowNodes(response.data.nodes || []);
            setWorkflowEdges(response.data.edges || []);
        } catch (err) {
            console.error('Error fetching workflow:', err);
        }
    };

    const fetchExecutions = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`/workflows/${workflowId}/executions`);
            setExecutions(response.data.data || response.data);
        } catch (err) {
            setError('Failed to fetch workflow executions.');
            console.error('Error fetching executions:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchExecutionDetails = async (executionId) => {
        try {
            setDetailsLoading(true);
            const response = await axios.get(`/workflows/${workflowId}/executions/${executionId}`);
            setExecutionDetails(response.data);
        } catch (err) {
            console.error('Error fetching execution details:', err);
        } finally {
            setDetailsLoading(false);
        }
    };

    const handleSelectExecution = (execution) => {
        setSelectedExecution(execution);
        fetchExecutionDetails(execution.id);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleString('vi-VN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        } catch (e) {
            return dateString;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'success':
                return 'text-green-400';
            case 'failed':
                return 'text-red-400';
            case 'running':
                return 'text-yellow-400';
            default:
                return 'text-gray-400';
        }
    };

    // Create execution display nodes with input/output data
    const createExecutionNodes = () => {
        if (!executionDetails || !workflowNodes.length) return [];

        const nodeResults = executionDetails.node_results || {};

        return workflowNodes.map((node) => {
            const nodeData = nodeResults[node.id] || {};
            const inputData = nodeData.input || {};
            const outputData = nodeData.output || nodeData;

            // Create a custom node display
            let nodeContent = null;

            if (node.type === 'webhook') {
                nodeContent = (
                    <div className="bg-purple-100 dark:bg-purple-900 border-2 border-purple-500 rounded-lg p-3 min-w-[250px] max-w-[350px]">
                        <Handle type="source" position={Position.Right} className="!bg-purple-500 !w-3 !h-3" />
                        <div className="font-semibold text-purple-700 dark:text-purple-300 mb-2">Webhook</div>
                        {inputData && Object.keys(inputData).length > 0 && (
                            <div className="mb-2">
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Input:</div>
                                <pre className="text-xs bg-white dark:bg-gray-800 p-2 rounded max-h-24 overflow-y-auto">
                                    {JSON.stringify(inputData, null, 2).substring(0, 200)}
                                </pre>
                            </div>
                        )}
                        {outputData && Object.keys(outputData).length > 0 && (
                            <div>
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Output:</div>
                                <pre className="text-xs bg-white dark:bg-gray-800 p-2 rounded max-h-24 overflow-y-auto">
                                    {JSON.stringify(outputData, null, 2).substring(0, 200)}
                                </pre>
                            </div>
                        )}
                    </div>
                );
            } else if (node.type === 'http') {
                nodeContent = (
                    <div className="bg-blue-100 dark:bg-blue-900 border-2 border-blue-500 rounded-lg p-3 min-w-[250px] max-w-[350px]">
                        <Handle type="target" position={Position.Left} className="!bg-blue-500 !w-3 !h-3" />
                        <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-3 !h-3" />
                        <div className="font-semibold text-blue-700 dark:text-blue-300 mb-2">
                            {node.data?.label || 'HTTP Request'}
                        </div>
                        {inputData && Object.keys(inputData).length > 0 && (
                            <div className="mb-2">
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Input:</div>
                                <pre className="text-xs bg-white dark:bg-gray-800 p-2 rounded max-h-24 overflow-y-auto">
                                    {JSON.stringify(inputData, null, 2).substring(0, 200)}
                                </pre>
                            </div>
                        )}
                        {outputData && Object.keys(outputData).length > 0 && (
                            <div>
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Output:</div>
                                <pre className="text-xs bg-white dark:bg-gray-800 p-2 rounded max-h-24 overflow-y-auto">
                                    {JSON.stringify(outputData, null, 2).substring(0, 200)}
                                </pre>
                            </div>
                        )}
                    </div>
                );
            } else if (node.type === 'code') {
                nodeContent = (
                    <div className="bg-green-100 dark:bg-green-900 border-2 border-green-500 rounded-lg p-3 min-w-[250px] max-w-[350px]">
                        <Handle type="target" position={Position.Left} className="!bg-green-500 !w-3 !h-3" />
                        <Handle type="source" position={Position.Right} className="!bg-green-500 !w-3 !h-3" />
                        <div className="font-semibold text-green-700 dark:text-green-300 mb-2">Code</div>
                        {inputData && Object.keys(inputData).length > 0 && (
                            <div className="mb-2">
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Input:</div>
                                <pre className="text-xs bg-white dark:bg-gray-800 p-2 rounded max-h-24 overflow-y-auto">
                                    {JSON.stringify(inputData, null, 2).substring(0, 200)}
                                </pre>
                            </div>
                        )}
                        {outputData && Object.keys(outputData).length > 0 && (
                            <div>
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Output:</div>
                                <pre className="text-xs bg-white dark:bg-gray-800 p-2 rounded max-h-24 overflow-y-auto">
                                    {JSON.stringify(outputData, null, 2).substring(0, 200)}
                                </pre>
                            </div>
                        )}
                    </div>
                );
            }

            return {
                ...node,
                type: 'custom',
                data: {
                    content: nodeContent,
                    nodeData: node,
                    nodeResults: { input: inputData, output: outputData }
                }
            };
        });
    };

    const handleNodeDoubleClick = (event, node) => {
        setSelectedNodeForView(node);
    };

    const nodeTypes = {
        custom: ({ data }) => data.content,
    };

    if (loading) return <div className="p-4 text-gray-300">Đang tải lịch sử thực thi...</div>;
    if (error) return <div className="p-4 text-red-500">{error}</div>;

    return (
        <>
            {selectedNodeForView && (
                <NodeViewModal
                    node={selectedNodeForView.data.nodeData}
                    onClose={() => setSelectedNodeForView(null)}
                    inputData={selectedNodeForView.data.nodeResults.input}
                    outputData={selectedNodeForView.data.nodeResults.output}
                />
            )}
            <div className="flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-200">
                {/* Left Panel: Execution List */}
                <div className="w-1/3 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    {/* Fixed Header */}
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                        <h2 className="text-xl font-semibold">Lịch sử thực thi</h2>
                    </div>
                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto">
                        {executions.length === 0 ? (
                            <p className="p-4 text-gray-400">Chưa có lịch sử thực thi nào.</p>
                        ) : (
                            <ul>
                                {executions.map((execution) => (
                                    <li
                                        key={execution.id}
                                        className={`p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700 ${
                                            selectedExecution?.id === execution.id ? 'bg-blue-50 dark:bg-blue-900' : ''
                                        }`}
                                        onClick={() => handleSelectExecution(execution)}
                                    >
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-sm">{formatDate(execution.started_at)}</span>
                                            <span className={`text-sm font-semibold ${getStatusColor(execution.status)}`}>
                                                {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            {execution.duration_ms ? `Hoàn thành trong ${execution.duration_ms}ms` : 'Đang chạy...'}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">ID#{execution.id}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

            {/* Right Panel: Execution Canvas */}
            <div className="w-2/3 relative bg-gray-50 dark:bg-gray-900">
                {selectedExecution ? (
                    <div className="absolute inset-0">
                        <div className="absolute top-0 left-0 right-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 z-10">
                            <h2 className="text-xl font-semibold">
                                Chi tiết thực thi #{selectedExecution.id}
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {formatDate(selectedExecution.started_at)} - Status:
                                <span className={`ml-2 font-semibold ${getStatusColor(selectedExecution.status)}`}>
                                    {selectedExecution.status}
                                </span>
                            </p>
                        </div>
                        {detailsLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <p className="text-gray-300">Đang tải chi tiết thực thi...</p>
                            </div>
                        ) : executionDetails ? (
                            <div className="absolute inset-0" style={{ paddingTop: '80px' }}>
                                <ReactFlow
                                    nodes={createExecutionNodes()}
                                    edges={workflowEdges}
                                    nodeTypes={nodeTypes}
                                    onNodeDoubleClick={handleNodeDoubleClick}
                                    fitView
                                    draggable={false}
                                    nodesConnectable={false}
                                    elementsSelectable={false}
                                    panOnDrag={true}
                                    zoomOnPinch={true}
                                    zoomOnScroll={true}
                                    className="bg-gray-50 dark:bg-gray-900"
                                >
                                    <Background />
                                    <Controls />
                                    <MiniMap />
                                </ReactFlow>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-gray-400">Chọn một lần thực thi từ danh sách bên trái để xem chi tiết.</p>
                    </div>
                )}
            </div>
            </div>
        </>
    );
};

export default WorkflowHistory;

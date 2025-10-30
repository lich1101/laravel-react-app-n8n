import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
    Handle,
    Position,
    SelectionMode,
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from '../config/axios';
import { useParams, useNavigate } from 'react-router-dom';
import WebhookConfigModal from './WebhookConfigModal';
import HttpRequestConfigModal from './HttpRequestConfigModal';
import PerplexityConfigModal from './PerplexityConfigModal';
import CodeConfigModal from './CodeConfigModal';
import EscapeConfigModal from './EscapeConfigModal';
import IfConfigModal from './IfConfigModal';
import WorkflowHistory from './WorkflowHistory';
import RenameNodeModal from './RenameNodeModal';

// Compact node component with quick-add button
const CompactNode = ({ data, nodeType, iconPath, color, handles, onQuickAdd, connectedHandles = [], selected }) => {
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [quickAddHandle, setQuickAddHandle] = useState(null);

    const handleQuickAddClick = (handleId) => {
        setQuickAddHandle(handleId);
        setShowQuickAdd(true);
    };

    const handleSelectNode = (type) => {
        onQuickAdd(data.nodeId, type, quickAddHandle);
        setShowQuickAdd(false);
    };

    return (
        <div 
            className={`bg-gray-800 dark:bg-gray-700 border-2 rounded-lg p-3 w-20 h-20 relative flex items-center justify-center group  transition-all ${
                selected 
                    ? 'border-green-500' 
                    : 'border-gray-600 dark:border-gray-500'
            }`}
            title={data.customName || data.label || nodeType}
        >
            {/* Input handle */}
            {handles.input && (
                <Handle 
                    type="target" 
                    position={Position.Left} 
                    className="!bg-gray-400 !w-2.5 !h-2.5 !border-2 !border-gray-600"
                />
            )}
            
            {/* Icon SVG */}
            <div className="w-10 h-10 flex items-center justify-center pointer-events-none">
                <img 
                    src={iconPath} 
                    alt={nodeType}
                    className="w-full h-full object-contain"
                    style={{ filter: 'brightness(0) invert(1)' }}
                />
            </div>
            
            {/* Node name label - Always visible */}
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-md whitespace-nowrap pointer-events-none ">
                {data.customName || data.label}
            </div>
            
            {/* Output handles - Dynamic based on connection status */}
            {handles.outputs && handles.outputs.map((output, index) => {
                const topPercent = handles.outputs.length === 1 ? 50 : 30 + (index * 40);
                const handleKey = output.id || 'default';
                const isConnected = connectedHandles.includes(handleKey);
                
                return (
                    <React.Fragment key={handleKey}>
                        {isConnected ? (
                            /* CONNECTED: Just a circle dot */
                            <>
                                <Handle 
                                    type="source" 
                                    position={Position.Right} 
                                    id={output.id}
                                    className={`!w-2.5 !h-2.5 !rounded-full !border-2 !border-gray-600 ${
                                        output.color === 'green' ? '!bg-green-400' :
                                        output.color === 'red' ? '!bg-red-400' :
                                        '!bg-gray-400'
                                    }`}
                                    style={{ 
                                        left: 'calc(100%)',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                {output.label && (
                                    <span 
                                        className={`absolute text-xs font-medium whitespace-nowrap pointer-events-none ${
                                            output.color === 'green' ? 'text-green-400' :
                                            output.color === 'red' ? 'text-red-400' :
                                            'text-gray-400'
                                        }`}
                                        style={{ 
                                            left: 'calc(100% + 8px)',
                                            top: `${topPercent}%`,
                                            transform: 'translateY(-50%)',
                                        }}
                                    >
                                        {output.label}
                                    </span>
                                )}
                            </>
                        ) : (
                            /* NOT CONNECTED: Extended line + circle + square [+] */
                            <>
                                {/* Line from node edge */}
                                <div 
                                    className="absolute w-4 h-0.5 bg-gray-500 pointer-events-none"
                                    style={{ 
                                        left: '100%',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                
                                {/* Handle HEAD - Circle (for dragging) */}
                                <Handle 
                                    type="source" 
                                    position={Position.Right} 
                                    id={output.id}
                                    className={`!w-2.5 !h-2.5 !rounded-full !border-2 !border-gray-600 ${
                                        output.color === 'green' ? '!bg-green-400' :
                                        output.color === 'red' ? '!bg-red-400' :
                                        '!bg-gray-400'
                                    }`}
                                    style={{ 
                                        left: 'calc(100% )',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                
                                {/* Line from head to tail */}
                                <div 
                                    className="absolute w-4 h-0.5 bg-gray-500 pointer-events-none"
                                    style={{ 
                                        left: 'calc(100% + 30px)',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                
                                {/* Handle TAIL - Square [+] (for quick-add) */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleQuickAddClick(output.id);
                                    }}
                                    className={`absolute w-5 h-5 border-2 rounded-sm flex items-center justify-center text-xs font-bold shadow-md z-10 transition-colors ${
                                        output.color === 'green' ? 'bg-green-500 hover:bg-green-600 border-green-600 text-white' :
                                        output.color === 'red' ? 'bg-red-500 hover:bg-red-600 border-red-600 text-white' :
                                        'bg-gray-700 hover:bg-gray-600 border-gray-600 text-white'
                                    }`}
                                    style={{ 
                                        left: 'calc(100% + 45px)',
                                        top: `${topPercent}%`,
                                        transform: 'translateY(-50%)',
                                    }}
                                    title="Click to add next node"
                                >
                                    +
                                </button>
                                
                                {output.label && (
                                    <span 
                                        className={`absolute text-xs font-medium whitespace-nowrap pointer-events-none ${
                                            output.color === 'green' ? 'text-green-400' :
                                            output.color === 'red' ? 'text-red-400' :
                                            'text-gray-400'
                                        }`}
                                        style={{ 
                                            left: 'calc(100% + 20px)',
                                            top: `${topPercent}%`,
                                            transform: 'translateY(-50%)',
                                        }}
                                    >
                                        {output.label}
                                    </span>
                                )}
                            </>
                        )}
                    </React.Fragment>
                );
            })}
            
            {/* Quick add dropdown */}
            {showQuickAdd && (
                <div 
                    className="absolute bg-white dark:bg-gray-800 shadow-2xl rounded-lg py-1 z-[100] min-w-[160px] border border-gray-300 dark:border-gray-600"
                    style={{ 
                        left: 'calc(100% + 42px)',
                        top: quickAddHandle === 'false' ? '60%' : '20%',
                    }}
                >
                    <button onClick={() => handleSelectNode('http')} className="w-full text-left px-4 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700">🌐 HTTP Request</button>
                    <button onClick={() => handleSelectNode('perplexity')} className="w-full text-left px-4 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700">🤖 Perplexity AI</button>
                    <button onClick={() => handleSelectNode('code')} className="w-full text-left px-4 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700">💻 Code</button>
                    <button onClick={() => handleSelectNode('escape')} className="w-full text-left px-4 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700">✂️ Escape & Set</button>
                    <button onClick={() => handleSelectNode('if')} className="w-full text-left px-4 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700">🔀 If</button>
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                    <button onClick={() => setShowQuickAdd(false)} className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700">Cancel</button>
                </div>
            )}
        </div>
    );
};

const nodeTypes = {
    webhook: (props) => (
        <CompactNode 
            {...props} 
            nodeType="webhook"
            iconPath="/icons/nodes/webhook.svg"
            color="purple"
            handles={{ input: false, outputs: [{ id: null }] }}
            onQuickAdd={props.data.onQuickAdd}
            connectedHandles={props.data.connectedHandles || []}
            selected={props.selected}
        />
    ),
    http: (props) => (
        <CompactNode 
            {...props} 
            nodeType="http"
            iconPath="/icons/nodes/http.svg"
            color="blue"
            handles={{ input: true, outputs: [{ id: null }] }}
            onQuickAdd={props.data.onQuickAdd}
            connectedHandles={props.data.connectedHandles || []}
            selected={props.selected}
        />
    ),
    perplexity: (props) => (
        <CompactNode 
            {...props} 
            nodeType="perplexity"
            iconPath="/icons/nodes/perplexity.svg"
            color="indigo"
            handles={{ input: true, outputs: [{ id: null }] }}
            onQuickAdd={props.data.onQuickAdd}
            connectedHandles={props.data.connectedHandles || []}
            selected={props.selected}
        />
    ),
    code: (props) => (
        <CompactNode 
            {...props} 
            nodeType="code"
            iconPath="/icons/nodes/code.svg"
            color="green"
            handles={{ input: true, outputs: [{ id: null }] }}
            onQuickAdd={props.data.onQuickAdd}
            connectedHandles={props.data.connectedHandles || []}
            selected={props.selected}
        />
    ),
    escape: (props) => (
        <CompactNode 
            {...props} 
            nodeType="escape"
            iconPath="/icons/nodes/escape.svg"
            color="yellow"
            handles={{ input: true, outputs: [{ id: null }] }}
            onQuickAdd={props.data.onQuickAdd}
            connectedHandles={props.data.connectedHandles || []}
            selected={props.selected}
        />
    ),
    if: (props) => (
        <CompactNode 
            {...props} 
            nodeType="if"
            iconPath="/icons/nodes/if.svg"
            color="teal"
            handles={{ 
                input: true, 
                outputs: [
                    { id: 'true', label: 'true', color: 'green' },
                    { id: 'false', label: 'false', color: 'red' }
                ] 
            }}
            onQuickAdd={props.data.onQuickAdd}
            connectedHandles={props.data.connectedHandles || []}
            selected={props.selected}
        />
    ),
};



function WorkflowEditor() {
    const { id } = useParams();
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    
    // Get back URL based on user role
    const getBackUrl = () => {
        if (currentUser.role === 'administrator') {
            return '/administrator';
        } else if (currentUser.role === 'admin') {
            return '/admin';
        }
        return '/workflows';
    };
    
    const [workflow, setWorkflow] = useState(null);
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [showNodeMenu, setShowNodeMenu] = useState(false);
    const [showEdgeNodeMenu, setShowEdgeNodeMenu] = useState(false);
    const [selectedNode, setSelectedNode] = useState(null);
    const [copiedNodes, setCopiedNodes] = useState([]);
    const [showNodeContextMenu, setShowNodeContextMenu] = useState(false);
    const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [nodeToRename, setNodeToRename] = useState(null);
    const [selectedEdge, setSelectedEdge] = useState(null);
    const [nodeInputData, setNodeInputData] = useState({});
    const [nodeOutputData, setNodeOutputData] = useState({});
    const [activeTab, setActiveTab] = useState('editor'); // 'editor' or 'history'
    const [hoveredEdge, setHoveredEdge] = useState(null);
    const [edgeMenuPosition, setEdgeMenuPosition] = useState({ x: 0, y: 0 });
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const reactFlowWrapper = useRef(null);
    const [reactFlowInstance, setReactFlowInstance] = useState(null);

    useEffect(() => {
        fetchWorkflow();
    }, [id]);

    // Custom wheel handler for Cmd/Ctrl + scroll = zoom
    useEffect(() => {
        const handleWheel = (e) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
            
            if (ctrlOrCmd && reactFlowInstance) {
                e.preventDefault();
                const zoomSpeed = 0.002;
                const newZoom = reactFlowInstance.getZoom() - e.deltaY * zoomSpeed;
                const clampedZoom = Math.max(0.1, Math.min(newZoom, 4));
                reactFlowInstance.setZoom(clampedZoom);
            }
        };

        const wrapper = reactFlowWrapper.current;
        if (wrapper) {
            wrapper.addEventListener('wheel', handleWheel, { passive: false });
        }

        return () => {
            if (wrapper) {
                wrapper.removeEventListener('wheel', handleWheel);
            }
        };
    }, [reactFlowInstance]);

    // Keyboard shortcuts for copy/paste/select all + space-pan
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Check if user is typing in input/textarea
            const isInputField = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
            if (isInputField) return;

            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

            // Copy: Cmd+C or Ctrl+C
            if (ctrlOrCmd && e.key === 'c') {
                e.preventDefault();
                handleCopyNodes();
            }

            // Paste: Cmd+V or Ctrl+V
            if (ctrlOrCmd && e.key === 'v') {
                e.preventDefault();
                handlePasteNodes();
            }

            // Select All: Cmd+A or Ctrl+A
            if (ctrlOrCmd && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault();
                handleSelectAllNodes();
            }

            // Delete: Delete or Backspace
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode) {
                e.preventDefault();
                handleDeleteNode();
            }

            // Space: enable pan with left mouse drag
            if (e.code === 'Space') {
                e.preventDefault();
                setIsSpacePressed(true);
            }
        };

        const handleKeyUp = (e) => {
            if (e.code === 'Space') {
                setIsSpacePressed(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [selectedNode, copiedNodes, nodes, edges]);

    const handleSelectAllNodes = () => {
        setNodes(nodes.map(n => ({ ...n, selected: true })));
    };

    const fetchWorkflow = async () => {
        // If creating new workflow
        if (id === 'new') {
            const newWorkflow = {
                id: null,
                name: 'Untitled Workflow',
                description: '',
                active: false,
                nodes: [],
                edges: []
            };
            setWorkflow(newWorkflow);
            setNodes([]);
            setEdges([]);
            return;
        }

        // Fetch existing workflow
        try {
            const response = await axios.get(`/workflows/${id}`);
            const data = response.data;
            setWorkflow(data);
            
            // Map pinned outputs from workflowNodes to nodes AND nodeOutputData
            let nodesWithPinnedOutput = data.nodes || [];
            const pinnedOutputs = {};
            
            if (data.workflow_nodes && Array.isArray(data.workflow_nodes)) {
                nodesWithPinnedOutput = nodesWithPinnedOutput.map(node => {
                    const workflowNode = data.workflow_nodes.find(wn => wn.node_id === node.id);
                    if (workflowNode && workflowNode.pinned_output) {
                        // Add pinned output to node data (for display in modal)
                        const updatedNode = {
                            ...node,
                            data: {
                                ...node.data,
                                pinnedOutput: workflowNode.pinned_output,
                            }
                        };
                        
                        // Also add to nodeOutputData so it's available to downstream nodes
                        pinnedOutputs[node.id] = workflowNode.pinned_output;
                        
                        return updatedNode;
                    }
                    return node;
                });
                
                // Set pinned outputs to nodeOutputData
                if (Object.keys(pinnedOutputs).length > 0) {
                    setNodeOutputData(pinnedOutputs);
                }
            }
            
            setNodes(nodesWithPinnedOutput);
            setEdges(data.edges || []);
        } catch (error) {
            console.error('Error fetching workflow:', error);
            // If workflow not found, redirect to list
            if (error.response?.status === 404) {
                alert('Workflow không tồn tại');
                navigate(getBackUrl());
            }
        }
    };

    const onNodesChange = useCallback(
        (changes) => {
            setNodes((nds) => applyNodeChanges(changes, nds));
            // Handle delete node
            changes.forEach((change) => {
                if (change.type === 'remove') {
                    setSelectedNode(null);
                    setShowNodeContextMenu(false);
                }
            });
            // Mark as changed (position, selection, etc)
            setHasChanges(true);
            setSaved(false);
        },
        []
    );

    const onEdgesChange = useCallback(
        (changes) => {
            setEdges((eds) => applyEdgeChanges(changes, eds));
            setHasChanges(true);
            setSaved(false);
        },
        []
    );

    const onConnect = useCallback(
        (params) => {
            setEdges((eds) => addEdge(params, eds));
            setHasChanges(true);
            setSaved(false);
        },
        []
    );

    const onEdgeMouseEnter = useCallback((event, edge) => {
        setHoveredEdge(edge);
        const rect = event.currentTarget.getBoundingClientRect();
        setEdgeMenuPosition({ 
            x: rect.left + rect.width / 2, 
            y: rect.top + rect.height / 2 
        });
    }, []);

    const onEdgeMouseLeave = useCallback(() => {
        setHoveredEdge(null);
    }, []);

    const onEdgeContextMenu = useCallback((event, edge) => {
        event.preventDefault();
        setSelectedEdge(edge);
        setContextMenuPosition({ x: event.clientX, y: event.clientY });
        setShowNodeContextMenu(true);
    }, []);

    const handleDeleteEdge = (edgeToDelete = null) => {
        const edge = edgeToDelete || selectedEdge;
        if (edge) {
            setEdges(edges.filter(e => e.id !== edge.id));
            setSelectedEdge(null);
            setHoveredEdge(null);
            setShowNodeContextMenu(false);
            setHasChanges(true);
            setSaved(false);
        }
    };

    const handleAddIntermediateNode = (edge, nodeType) => {
        if (!edge) return;

        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        
        if (!sourceNode || !targetNode) return;

        // Position intermediate node between source and target
        const position = {
            x: (sourceNode.position.x + targetNode.position.x) / 2,
            y: (sourceNode.position.y + targetNode.position.y) / 2,
        };

        const labels = {
            http: 'HTTP Request',
            perplexity: 'Perplexity AI',
            code: 'Code',
            escape: 'Escape & Set',
            if: 'If',
        };

        // Generate unique custom name
        const existingNames = nodes.map(n => n.data.customName).filter(Boolean);
        let customName = labels[nodeType];
        let counter = 1;
        while (existingNames.includes(customName)) {
            customName = `${labels[nodeType]} ${counter}`;
            counter++;
        }

        const newNode = {
            id: `${nodeType}-${Date.now()}`,
            type: nodeType,
            position: position,
            data: { 
                label: labels[nodeType],
                customName,
                nodeId: `${nodeType}-${Date.now()}`,
                onQuickAdd: handleQuickAddNode,
            },
        };

        // Remove old edge
        const newEdges = edges.filter(e => e.id !== edge.id);

        // Add new edges: source → intermediate → target
        const edge1 = {
            id: `edge-${Date.now()}-1`,
            source: edge.source,
            target: newNode.id,
            sourceHandle: edge.sourceHandle,
        };

        const edge2 = {
            id: `edge-${Date.now()}-2`,
            source: newNode.id,
            target: edge.target,
            targetHandle: edge.targetHandle,
        };

        setNodes([...nodes, newNode]);
        setEdges([...newEdges, edge1, edge2]);
        setHoveredEdge(null);
        setHasChanges(true);
        setSaved(false);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaved(false);
        try {
            if (id === 'new' || !workflow?.id) {
                // Create new workflow
                const response = await axios.post('/workflows', {
                    name: workflow?.name || 'Untitled Workflow',
                    description: workflow?.description || '',
                    nodes,
                    edges,
                    active: false
                });
                // Redirect to the newly created workflow
                navigate(`/workflows/${response.data.id}`, { replace: true });
            } else {
                // Update existing workflow
                await axios.put(`/workflows/${id}`, {
                    nodes,
                    edges,
                });
            }
            setSaved(true);
            setHasChanges(false); // ⭐ Reset changes after save
            setTimeout(() => setSaved(false), 2000);
        } catch (error) {
            console.error('Error saving workflow:', error);
            alert('Error saving workflow');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async () => {
        if (id === 'new' || !workflow?.id) {
            alert('Vui lòng lưu workflow trước khi activate');
            return;
        }
        
        try {
            const newActive = !workflow.active;
            await axios.put(`/workflows/${id}`, { active: newActive });
            setWorkflow({ ...workflow, active: newActive });
        } catch (error) {
            if (error.response?.status === 400) {
                alert('Cannot activate workflow without a webhook node');
            } else {
                console.error('Error toggling workflow:', error);
            }
        }
    };

    const addNode = (type, label, position = null, sourceNodeId = null, sourceHandle = null) => {
        // Generate unique custom name
        const existingNames = nodes.map(n => n.data.customName).filter(Boolean);
        let customName = label;
        let counter = 1;
        while (existingNames.includes(customName)) {
            customName = `${label} ${counter}`;
            counter++;
        }

        const newNode = {
            id: `${type}-${Date.now()}`,
            type,
            position: position || { x: Math.random() * 400, y: Math.random() * 400 },
            data: { 
                label,
                customName,
                nodeId: `${type}-${Date.now()}`,
                onQuickAdd: handleQuickAddNode,
            },
        };
        
        setNodes([...nodes, newNode]);
        
        // If adding from quick-add button, create edge automatically
        if (sourceNodeId && newNode.id) {
            const newEdge = {
                id: `edge-${Date.now()}`,
                source: sourceNodeId,
                target: newNode.id,
                sourceHandle: sourceHandle,
            };
            setEdges([...edges, newEdge]);
        }
        
        setShowNodeMenu(false);
        setHasChanges(true);
        setSaved(false);
    };

    // Handle quick-add node from output handle
    const handleQuickAddNode = (sourceNodeId, nodeType, sourceHandle) => {
        const sourceNode = nodes.find(n => n.id === sourceNodeId);
        if (!sourceNode) return;

        // Position new node to the right of source node
        const position = {
            x: sourceNode.position.x + 150,
            y: sourceNode.position.y + (sourceHandle === 'false' ? 80 : 0),
        };

        const labels = {
            webhook: 'Webhook',
            http: 'HTTP Request',
            perplexity: 'Perplexity AI',
            code: 'Code',
            escape: 'Escape & Set',
            if: 'If',
        };

        addNode(nodeType, labels[nodeType], position, sourceNodeId, sourceHandle);
    };

    const handleNodeContextMenu = (event, node) => {
        event.preventDefault();
        setSelectedNode(node);
        setContextMenuPosition({ x: event.clientX, y: event.clientY });
        setShowNodeContextMenu(true);
    };

    const handleDeleteNode = () => {
        if (selectedNode) {
            setNodes(nodes.filter(node => node.id !== selectedNode.id));
            setSelectedNode(null);
            setShowNodeContextMenu(false);
            setHasChanges(true);
            setSaved(false);
        }
    };

    // Copy selected nodes
    const handleCopyNodes = () => {
        // Get all selected nodes (ReactFlow supports multi-select)
        const selectedNodes = nodes.filter(n => n.selected);
        
        if (selectedNodes.length === 0 && selectedNode) {
            // If no multi-selection, copy the currently selected node
            setCopiedNodes([selectedNode]);
            console.log('✂️ Copied 1 node:', selectedNode.data.customName || selectedNode.data.label);
        } else if (selectedNodes.length > 0) {
            setCopiedNodes(selectedNodes);
            console.log('✂️ Copied', selectedNodes.length, 'nodes:', selectedNodes.map(n => n.data.customName || n.data.label));
        }
    };

    // Paste copied nodes
    const handlePasteNodes = () => {
        if (copiedNodes.length === 0) return;

        const timestamp = Date.now();
        const offset = { x: 50, y: 50 }; // Paste offset
        const idMap = {}; // Old ID → New ID mapping
        const newNodes = [];
        const newEdges = [];

        // Get existing names for auto-numbering
        const existingNames = nodes.map(n => n.data.customName || n.data.label).filter(Boolean);

        // Step 1: Create new nodes with unique names
        copiedNodes.forEach((copiedNode, index) => {
            const oldId = copiedNode.id;
            const newId = `${copiedNode.type}-${timestamp}-${index}`;
            idMap[oldId] = newId;

            // Generate unique name
            const baseName = copiedNode.data.customName || copiedNode.data.label;
            let uniqueName = baseName;
            let counter = 1;
            
            while (existingNames.includes(uniqueName) || newNodes.some(n => (n.data.customName || n.data.label) === uniqueName)) {
                uniqueName = `${baseName} ${counter}`;
                counter++;
            }

            const newNode = {
                ...copiedNode,
                id: newId,
                position: {
                    x: copiedNode.position.x + offset.x,
                    y: copiedNode.position.y + offset.y,
                },
                data: {
                    ...copiedNode.data,
                    customName: uniqueName,
                    nodeId: newId,
                },
                selected: false, // Deselect after paste
            };

            newNodes.push(newNode);
            existingNames.push(uniqueName);
        });

        // Step 2: Copy edges that connect ONLY between copied nodes
        const copiedNodeIds = copiedNodes.map(n => n.id);
        edges.forEach(edge => {
            if (copiedNodeIds.includes(edge.source) && copiedNodeIds.includes(edge.target)) {
                const newEdge = {
                    ...edge,
                    id: `edge-${timestamp}-${newEdges.length}`,
                    source: idMap[edge.source],
                    target: idMap[edge.target],
                };
                newEdges.push(newEdge);
            }
        });

        // Step 3: Add to canvas
        setNodes([...nodes, ...newNodes]);
        setEdges([...edges, ...newEdges]);
        setHasChanges(true);
        setSaved(false);

        console.log(`📋 Pasted ${newNodes.length} nodes and ${newEdges.length} connections`);
    };

    const handleConfigureNode = () => {
        if (selectedNode && (selectedNode.type === 'webhook' || selectedNode.type === 'http' || selectedNode.type === 'perplexity' || selectedNode.type === 'code' || selectedNode.type === 'escape' || selectedNode.type === 'if')) {
            setShowConfigModal(true);
            setShowNodeContextMenu(false);
        } else if (selectedNode) {
            const newLabel = prompt('Enter new label for this node:', selectedNode.data.label || '');
            if (newLabel !== null) {
                setNodes(nodes.map(node =>
                    node.id === selectedNode.id
                        ? { ...node, data: { ...node.data, label: newLabel } }
                        : node
                ));
            }
            setShowNodeContextMenu(false);
        }
    };

    // Handle rename node from context menu
    const handleRenameNode = () => {
        if (!selectedNode) return;
        
        openRenameModal(selectedNode.id);
        setShowNodeContextMenu(false);
    };

    // Open rename modal
    const openRenameModal = (nodeId) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            setNodeToRename(node);
            setShowRenameModal(true);
        }
    };

    // Handle rename from modal (with auto-numbering for duplicates and auto-update references)
    const handleRenameNodeFromModal = (nodeId, newName) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        const oldName = node.data.customName || node.data.label || node.type;
        
        // Check for duplicate names
        const existingNames = nodes
            .filter(n => n.id !== nodeId)
            .map(n => n.data.customName || n.data.label)
            .filter(Boolean);
        
        let finalName = newName;
        
        // Auto-numbering if duplicate (already handled in modal, but double-check)
        if (existingNames.includes(newName)) {
            let counter = 1;
            while (existingNames.includes(`${newName} ${counter}`)) {
                counter++;
            }
            finalName = `${newName} ${counter}`;
        }
        
        // Function to update references in a string
        const updateReferences = (str) => {
            if (!str || typeof str !== 'string') return str;
            
            // Escape special regex characters in oldName
            const escapedOldName = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Pattern 1: {{oldName.field}} or {{oldName[index]}}
            const pattern1 = new RegExp(`\\{\\{${escapedOldName}([.\\[].*?)\\}\\}`, 'g');
            let updated = str.replace(pattern1, `{{${finalName}$1}}`);
            
            // Pattern 2: $('oldName') - for n8n style references
            const pattern2 = new RegExp(`\\$\\('${escapedOldName}'\\)`, 'g');
            updated = updated.replace(pattern2, `$('${finalName}')`);
            
            return updated;
        };
        
        // Function to recursively update object properties
        const updateConfigReferences = (config) => {
            if (!config || typeof config !== 'object') return config;
            
            if (Array.isArray(config)) {
                return config.map(item => updateConfigReferences(item));
            }
            
            const updated = {};
            for (const [key, value] of Object.entries(config)) {
                if (typeof value === 'string') {
                    updated[key] = updateReferences(value);
                } else if (typeof value === 'object') {
                    updated[key] = updateConfigReferences(value);
                } else {
                    updated[key] = value;
                }
            }
            return updated;
        };
        
        // Update node name and all references in other nodes
        const updatedNodes = nodes.map(n => {
            if (n.id === nodeId) {
                // Update the renamed node itself
                return { 
                    ...n, 
                    data: { 
                        ...n.data, 
                        customName: finalName 
                    } 
                };
            } else {
                // Update references in other nodes
                const updatedConfig = updateConfigReferences(n.data.config);
                return {
                    ...n,
                    data: {
                        ...n.data,
                        config: updatedConfig
                    }
                };
            }
        });
        
        setNodes(updatedNodes);
        
        // ⭐ CRITICAL: Update selectedNode để modal re-render với tên mới
        if (selectedNode && selectedNode.id === nodeId) {
            const updatedNode = updatedNodes.find(n => n.id === nodeId);
            if (updatedNode) {
                setSelectedNode(updatedNode);
            }
        }
        
        setHasChanges(true);
        setSaved(false);
        
        console.log(`✅ Renamed node "${oldName}" to "${finalName}" and updated all references`);
    };

    // Export workflow to JSON
    const handleExportWorkflow = () => {
        const exportData = {
            name: workflow.name,
            description: workflow.description,
            nodes: nodes,
            edges: edges,
            metadata: {
                exportedAt: new Date().toISOString(),
                version: '1.0',
                workflowId: workflow.id
            }
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${workflow.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Import workflow from JSON
    const handleImportWorkflow = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                
                // Validate imported data
                if (!importedData.nodes || !importedData.edges) {
                    alert('Invalid workflow file format!');
                    return;
                }

                // Update nodes and edges
                setNodes(importedData.nodes);
                setEdges(importedData.edges);
                setHasChanges(true);
                setSaved(false);
                
                alert(`Workflow imported successfully!\nNodes: ${importedData.nodes.length}, Connections: ${importedData.edges.length}`);
            } catch (error) {
                console.error('Error importing workflow:', error);
                alert('Failed to import workflow. Please check the file format.');
            }
        };
        reader.readAsText(file);
        
        // Reset input
        event.target.value = '';
    };

    const handleNodeDoubleClick = (event, node) => {
        setSelectedNode(node);

        if (node.type === 'webhook' || node.type === 'http' || node.type === 'perplexity' || node.type === 'code' || node.type === 'escape' || node.type === 'if') {
            setShowConfigModal(true);
        }
    };

    // Get input data for a node (from all connected nodes upstream)
    const getNodeInputData = (nodeId) => {
        const inputDataArray = [];
        const namedInputs = {};
        const visitedNodes = new Set();
        const queue = [nodeId];

        console.log('Getting input data for node:', nodeId);
        console.log('Available output data:', nodeOutputData);

        while (queue.length > 0) {
            const currentId = queue.shift();

            // Find all edges that connect TO the current node
            const incomingEdges = edges.filter(edge => edge.target === currentId);

            incomingEdges.forEach(edge => {
                const sourceNodeId = edge.source;

                if (!visitedNodes.has(sourceNodeId)) {
                    visitedNodes.add(sourceNodeId);

                    // Add output data if available
                    if (nodeOutputData[sourceNodeId]) {
                        inputDataArray.push(nodeOutputData[sourceNodeId]);
                        console.log('Added output from node:', sourceNodeId);
                        
                        // Also add by customName for easy reference
                        const sourceNode = nodes.find(n => n.id === sourceNodeId);
                        if (sourceNode) {
                            const nodeName = sourceNode.data.customName || sourceNode.data.label || sourceNode.type;
                            namedInputs[nodeName] = nodeOutputData[sourceNodeId];
                            console.log('Mapped node name:', nodeName, '→', sourceNodeId);
                        }
                    }

                    // Add to queue to continue traversal
                    queue.push(sourceNodeId);
                }
            });
        }

        // Reverse to maintain order from first to last
        inputDataArray.reverse();

        console.log('Final input data array (from all upstream nodes):', inputDataArray);
        console.log('Named inputs:', Object.keys(namedInputs));
        
        // Merge named inputs into array (like backend does)
        // Result: [output1, output2, ..., NodeName1: output1, NodeName2: output2]
        return Object.assign([], inputDataArray, namedInputs);
    };

    // Resolve variables in a string (replace {{path}} with actual values)
    const resolveVariables = (str, inputData) => {
        if (!str || typeof str !== 'string') return str;

        // First, replace n8n syntax: {{ $('NodeName').item.json.field }}
        let resolved = str.replace(/\{\{\s*\$\('([^']+)'\)\.item\.json\.([^}]+)\s*\}\}/g, (fullMatch, nodeName, path) => {
            const value = getValueFromPath(`${nodeName}.${path}`, inputData);
            console.log('Resolving n8n variable:', { nodeName, path, value });
            return value !== undefined && value !== null ? String(value) : fullMatch;
        });

        // Then, replace custom syntax: {{NodeName.field}} or {{input-0.field}}
        resolved = resolved.replace(/\{\{([^}]+)\}\}/g, (fullMatch, path) => {
            const value = getValueFromPath(path.trim(), inputData);
            
            console.log('Resolving variable:', { 
                path: path.trim(), 
                value: value !== undefined ? value : 'NOT_FOUND',
                type: typeof value 
            });

            if (value !== undefined && value !== null) {
                return String(value);
            }
            
            // If not found, keep the template as-is
            console.warn('Variable not resolved:', fullMatch);
            return fullMatch;
        });

        return resolved;
    };

    // Get value from path like "input-0.headers.content-length" or "nodeName.field"
    const getValueFromPath = (path, inputData) => {
        if (!inputData) return undefined;

        const parts = path.split('.');
        const firstPart = parts[0];
        
        // PRIORITY 1: Try to resolve by node customName (check if it exists as a key in inputData)
        if (inputData[firstPart] !== undefined && isNaN(firstPart)) {
            let value = inputData[firstPart];
            
            console.log('Found node by customName:', firstPart);
            
            // Navigate through remaining path parts
            for (let i = 1; i < parts.length; i++) {
                const currentPart = parts[i];
                
                // Check if this part contains array index like "choices[0]"
                const arrayMatch = currentPart.match(/^([^\[]+)\[(\d+)\]$/);
                if (arrayMatch) {
                    const key = arrayMatch[1];
                    const arrayIndex = parseInt(arrayMatch[2]);
                    
                    if (value && typeof value === 'object' && key in value) {
                        value = value[key];
                        if (Array.isArray(value) && arrayIndex >= 0 && arrayIndex < value.length) {
                            value = value[arrayIndex];
                        } else {
                            return undefined;
                        }
                    } else {
                        return undefined;
                    }
                } else {
                    // Normal key access
                    if (value && typeof value === 'object') {
                        value = value[currentPart];
                    } else {
                        return undefined;
                    }
                }
            }
            return value;
        }

        // PRIORITY 2: Handle input-X format (backward compatibility)
        if (parts[0].startsWith('input-')) {
            // Check if first part has array index like "input-0[0]"
            const inputArrayMatch = parts[0].match(/^input-(\d+)\[(\d+)\]$/);
            if (inputArrayMatch) {
                const inputIndex = parseInt(inputArrayMatch[1]);
                const arrayIndex = parseInt(inputArrayMatch[2]);
                
                console.log('Path starts with input array index:', { inputIndex, arrayIndex });
                
                if (Array.isArray(inputData) && inputIndex >= 0 && inputIndex < inputData.length && 
                    Array.isArray(inputData[inputIndex]) && 
                    arrayIndex < inputData[inputIndex].length) {
                    var value = inputData[inputIndex][arrayIndex];
                } else {
                    return undefined;
                }
            } else {
                // Normal input-X without array index
                const index = parseInt(parts[0].replace('input-', ''));
                if (Array.isArray(inputData) && index >= 0 && index < inputData.length) {
                    var value = inputData[index];
                } else {
                    return undefined;
                }
            }
            
            if (value !== undefined) {
                for (let i = 1; i < parts.length; i++) {
                    const currentPart = parts[i];
                    
                    // Check if this part contains array index like "choices[0]"
                    const arrayMatch = currentPart.match(/^([^\[]+)\[(\d+)\]$/);
                    if (arrayMatch) {
                        const key = arrayMatch[1];
                        const arrayIndex = parseInt(arrayMatch[2]);
                        
                        console.log('Navigating with array index:', { key, arrayIndex, value });
                        
                        // First access the key, then the array index
                        if (value && typeof value === 'object' && key in value) {
                            value = value[key];
                            if (Array.isArray(value) && arrayIndex >= 0 && arrayIndex < value.length) {
                                value = value[arrayIndex];
                            } else {
                                return undefined;
                            }
                        } else {
                            return undefined;
                        }
                    } else {
                        // Normal key access
                        if (value && typeof value === 'object') {
                            value = value[currentPart];
                        } else {
                            return undefined;
                        }
                    }
                }
                return value;
            }
        }

        // PRIORITY 3: Try to find field directly in any numeric input (backward compat)
        if (Array.isArray(inputData)) {
            for (let i = 0; i < inputData.length; i++) {
                if (typeof inputData[i] !== 'object') continue;
                
                let value = inputData[i];
                let found = true;
                
                for (const part of parts) {
                    // Check if this part contains array index
                    const arrayMatch = part.match(/^([^\[]+)\[(\d+)\]$/);
                    if (arrayMatch) {
                        const key = arrayMatch[1];
                        const arrayIndex = parseInt(arrayMatch[2]);
                        
                        if (value && typeof value === 'object' && key in value && Array.isArray(value[key]) && arrayIndex < value[key].length) {
                            value = value[key][arrayIndex];
                        } else {
                            found = false;
                            break;
                        }
                    } else {
                        // Normal key access
                        if (value && typeof value === 'object' && part in value) {
                            value = value[part];
                        } else {
                            found = false;
                            break;
                        }
                    }
                }
                
                if (found && value !== undefined && value !== null) {
                    return value;
                }
            }
        }

        return undefined;
    };

    // Test HTTP Request node
    const handleTestHttpNode = async (config) => {
        try {
            console.log('Testing HTTP Request with config:', config);

            // Get input data for this node
            const inputData = getNodeInputData(selectedNode?.id || '');
            console.log('Input data for variable resolution:', inputData);

            // Build URL with query parameters
            let url = resolveVariables(config.url, inputData);
            if (config.queryParams && config.queryParams.length > 0) {
                const queryString = config.queryParams
                    .filter(p => p.name && p.value)
                    .map(p => {
                        const resolvedName = resolveVariables(p.name, inputData);
                        const resolvedValue = resolveVariables(p.value, inputData);
                        return `${encodeURIComponent(resolvedName)}=${encodeURIComponent(resolvedValue)}`;
                    })
                    .join('&');
                url += `?${queryString}`;
            }

            // Build headers
            const headers = {};
            if (config.headers && config.headers.length > 0) {
                config.headers.forEach(header => {
                    if (header.name && header.value) {
                        const resolvedName = resolveVariables(header.name, inputData);
                        const resolvedValue = resolveVariables(header.value, inputData);
                        headers[resolvedName] = resolvedValue;
                    }
                });
            }

            // Add authentication
            if (config.auth && config.auth !== 'none') {
                // Try to load credential from database if credentialId is provided
                if (config.credentialId) {
                    try {
                        const credResponse = await axios.get(`/credentials/${config.credentialId}`);
                        const credential = credResponse.data;
                        
                        console.log('Using credential from database:', credential);
                        
                        // Apply credential based on type
                        switch (credential.type) {
                            case 'bearer':
                                if (credential.data?.token) {
                                    const token = resolveVariables(credential.data.token, inputData);
                                    headers['Authorization'] = `Bearer ${token}`;
                                }
                                break;

                            case 'api_key':
                                if (credential.data?.key && credential.data?.headerName) {
                                    const keyValue = resolveVariables(credential.data.key, inputData);
                                    headers[credential.data.headerName] = keyValue;
                                }
                                break;

                            case 'basic':
                                if (credential.data?.username && credential.data?.password) {
                                    const username = resolveVariables(credential.data.username, inputData);
                                    const password = resolveVariables(credential.data.password, inputData);
                                    const encoded = btoa(`${username}:${password}`);
                                    headers['Authorization'] = `Basic ${encoded}`;
                                }
                                break;

                            case 'custom':
                                if (credential.data?.headerName && credential.data?.headerValue) {
                                    const headerValue = resolveVariables(credential.data.headerValue, inputData);
                                    headers[credential.data.headerName] = headerValue;
                                }
                                break;

                            case 'oauth2':
                                if (credential.data?.accessToken) {
                                    const token = resolveVariables(credential.data.accessToken, inputData);
                                    headers['Authorization'] = `Bearer ${token}`;
                                }
                                break;
                        }
                    } catch (error) {
                        console.error('Error loading credential:', error);
                    }
                } else {
                    // Fallback to old inline credential
                    if (config.auth === 'bearer' && config.credential) {
                        const resolvedCredential = resolveVariables(config.credential, inputData);
                        headers['Authorization'] = `Bearer ${resolvedCredential}`;
                    } else if (config.auth === 'basic' && config.credential) {
                        const resolvedCredential = resolveVariables(config.credential, inputData);
                        headers['Authorization'] = `Basic ${btoa(resolvedCredential)}`;
                    } else if (config.auth === 'custom' && config.credential) {
                        // Custom header format: "HeaderName: HeaderValue"
                        const resolvedCredential = resolveVariables(config.credential, inputData);
                        const parts = resolvedCredential.split(':');
                        if (parts.length === 2) {
                            headers[parts[0].trim()] = parts[1].trim();
                        }
                    }
                }
            }

            // Build request options
            const requestOptions = {
                method: config.method,
                headers: {
                    ...headers,
                },
            };

            // Add body for POST, PUT, PATCH
            if (['POST', 'PUT', 'PATCH'].includes(config.method) && config.bodyContent) {
                let bodyContent = resolveVariables(config.bodyContent, inputData);

                if (config.bodyType === 'json') {
                    try {
                        // Try to parse as JSON
                        requestOptions.body = JSON.stringify(JSON.parse(bodyContent));
                        requestOptions.headers['Content-Type'] = 'application/json';
                    } catch (e) {
                        requestOptions.body = bodyContent;
                        requestOptions.headers['Content-Type'] = 'application/json';
                    }
                } else if (config.bodyType === 'form') {
                    requestOptions.body = bodyContent;
                    // Note: multipart/form-data requires FormData object, this is simplified
                    delete requestOptions.headers['Content-Type'];
                } else if (config.bodyType === 'urlencoded') {
                    requestOptions.body = bodyContent;
                    requestOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                } else {
                    requestOptions.body = bodyContent;
                }
            }

            console.log('Making request to:', url);
            console.log('Request options:', requestOptions);

            // Make the HTTP request
            const response = await fetch(url, requestOptions);
            const data = await response.text();

            let bodyData = data;
            try {
                bodyData = JSON.parse(data);
            } catch (e) {
                // Keep as text if not JSON
            }

            const result = {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: bodyData,
            };

            console.log('Response:', result);
            return result;
        } catch (error) {
            console.error('Error testing HTTP request:', error);
            return {
                error: error.message || 'An error occurred',
                details: error.toString(),
            };
        }
    };

    // Test Perplexity node
    const handleTestPerplexityNode = async (config) => {
        try {
            console.log('Testing Perplexity with config:', config);

            // Get input data for this node
            const inputData = getNodeInputData(selectedNode?.id || '');
            console.log('Input data for variable resolution:', inputData);

            // Build messages array
            const messages = [];
            
            // Add system message if enabled
            if (config.systemMessageEnabled && config.systemMessage) {
                const systemMessage = resolveVariables(config.systemMessage, inputData);
                messages.push({
                    role: 'system',
                    content: systemMessage
                });
            }

            // Add all user/assistant messages
            if (config.messages && Array.isArray(config.messages)) {
                config.messages.forEach(msg => {
                    const content = resolveVariables(msg.content || '', inputData);
                    if (content) { // Only add non-empty messages
                        messages.push({
                            role: msg.role,
                            content: content
                        });
                    }
                });
            }

            // Get credential
            if (!config.credentialId) {
                throw new Error('Perplexity API credential is required');
            }

            // Fetch credential from backend
            const credResponse = await axios.get(`/credentials/${config.credentialId}`);
            const credential = credResponse.data;
            
            if (!credential || !credential.data || !credential.data.headerValue) {
                throw new Error('Invalid credential configuration');
            }

            // Build request body
            const requestBody = {
                model: config.model || 'sonar',
                messages: messages,
            };

            // Add advanced options if any
            if (config.advancedOptions && Object.keys(config.advancedOptions).length > 0) {
                Object.entries(config.advancedOptions).forEach(([key, value]) => {
                    requestBody[key] = value;
                });
            }

            console.log('Perplexity request body:', requestBody);

            // Make request to Perplexity API
            const response = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    [credential.data.headerName || 'Authorization']: credential.data.headerValue,
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Perplexity API error (${response.status}): ${errorText}`);
            }

            const result = await response.json();
            console.log('Perplexity response:', result);

            return result;
        } catch (error) {
            console.error('Error testing Perplexity:', error);
            return {
                error: error.message || 'An error occurred',
                details: error.toString(),
            };
        }
    };

    // Test If node
    const handleTestIfNode = async (config) => {
        try {
            console.log('Testing If node with config:', config);

            // Get input data for this node
            const inputData = getNodeInputData(selectedNode?.id || '');
            console.log('Input data for if evaluation:', inputData);

            // Evaluate each condition
            const conditionResults = [];
            
            for (const condition of config.conditions) {
                // Resolve value1
                let value1 = resolveVariables(condition.value1, inputData);
                
                // Resolve value2 if needed
                let value2 = condition.value2 ? resolveVariables(condition.value2, inputData) : null;
                
                // Convert types based on dataType
                if (condition.dataType === 'number') {
                    value1 = parseFloat(value1);
                    value2 = value2 !== null ? parseFloat(value2) : null;
                } else if (condition.dataType === 'boolean') {
                    value1 = value1 === 'true' || value1 === true;
                    value2 = value2 === 'true' || value2 === true;
                } else if (condition.dataType === 'dateTime') {
                    value1 = new Date(value1);
                    value2 = value2 !== null ? new Date(value2) : null;
                }
                
                // Evaluate operator
                let result = false;
                
                switch (condition.operator) {
                    case 'exists':
                        result = value1 !== null && value1 !== undefined;
                        break;
                    case 'notExists':
                        result = value1 === null || value1 === undefined;
                        break;
                    case 'isEmpty':
                        result = !value1 || (typeof value1 === 'string' && value1.trim() === '') || 
                                (Array.isArray(value1) && value1.length === 0) ||
                                (typeof value1 === 'object' && Object.keys(value1).length === 0);
                        break;
                    case 'isNotEmpty':
                        result = !!value1 && !((typeof value1 === 'string' && value1.trim() === '') || 
                                (Array.isArray(value1) && value1.length === 0) ||
                                (typeof value1 === 'object' && Object.keys(value1).length === 0));
                        break;
                    case 'equal':
                        result = value1 == value2;
                        break;
                    case 'notEqual':
                        result = value1 != value2;
                        break;
                    case 'contains':
                        result = String(value1).includes(String(value2));
                        break;
                    case 'notContains':
                        result = !String(value1).includes(String(value2));
                        break;
                    case 'startsWith':
                        result = String(value1).startsWith(String(value2));
                        break;
                    case 'notStartsWith':
                        result = !String(value1).startsWith(String(value2));
                        break;
                    case 'endsWith':
                        result = String(value1).endsWith(String(value2));
                        break;
                    case 'notEndsWith':
                        result = !String(value1).endsWith(String(value2));
                        break;
                    case 'regex':
                        result = new RegExp(value2).test(String(value1));
                        break;
                    case 'notRegex':
                        result = !new RegExp(value2).test(String(value1));
                        break;
                    case 'gt':
                        result = value1 > value2;
                        break;
                    case 'lt':
                        result = value1 < value2;
                        break;
                    case 'gte':
                        result = value1 >= value2;
                        break;
                    case 'lte':
                        result = value1 <= value2;
                        break;
                    case 'after':
                        result = value1 > value2;
                        break;
                    case 'before':
                        result = value1 < value2;
                        break;
                    case 'afterOrEqual':
                        result = value1 >= value2;
                        break;
                    case 'beforeOrEqual':
                        result = value1 <= value2;
                        break;
                    case 'true':
                        result = value1 === true;
                        break;
                    case 'false':
                        result = value1 === false;
                        break;
                    case 'lengthEqual':
                        result = (Array.isArray(value1) ? value1.length : 0) == value2;
                        break;
                    case 'lengthNotEqual':
                        result = (Array.isArray(value1) ? value1.length : 0) != value2;
                        break;
                    case 'lengthGt':
                        result = (Array.isArray(value1) ? value1.length : 0) > value2;
                        break;
                    case 'lengthLt':
                        result = (Array.isArray(value1) ? value1.length : 0) < value2;
                        break;
                    case 'lengthGte':
                        result = (Array.isArray(value1) ? value1.length : 0) >= value2;
                        break;
                    case 'lengthLte':
                        result = (Array.isArray(value1) ? value1.length : 0) <= value2;
                        break;
                }
                
                conditionResults.push(result);
                console.log('Condition evaluated:', { condition, value1, value2, result });
            }
            
            // Combine results based on operation
            const finalResult = config.combineOperation === 'OR' 
                ? conditionResults.some(r => r) 
                : conditionResults.every(r => r);
            
            console.log('Final if result:', finalResult);
            
            return {
                result: finalResult,
                conditionResults: conditionResults,
                output: inputData[0] || {}, // Pass through first input
            };
        } catch (error) {
            console.error('Error in If node:', error);
            return {
                result: false,
                error: error.message || 'An error occurred',
                details: error.toString(),
            };
        }
    };

    // Test Escape node
    const handleTestEscapeNode = async (config) => {
        try {
            console.log('Testing Escape node with config:', config);

            // Get input data for this node
            const inputData = getNodeInputData(selectedNode?.id || '');
            console.log('Input data for escape:', inputData);

            // Escape function
            const escapeText = (text) => {
                if (!text || typeof text !== 'string') return text;
                return text
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"')
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r')
                    .replace(/\t/g, '\\t')
                    .replace(/\s+/g, ' ')
                    .trim();
            };

            // Build output object
            const result = {};
            
            config.fields.forEach(field => {
                if (!field.name || !field.value) return;
                
                // Resolve variable
                const resolvedValue = resolveVariables(field.value, inputData);
                
                // Escape the resolved value
                const escapedValue = escapeText(resolvedValue);
                
                // Set nested field (support a.b.c format)
                const parts = field.name.split('.');
                let current = result;
                
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!current[parts[i]]) {
                        current[parts[i]] = {};
                    }
                    current = current[parts[i]];
                }
                
                current[parts[parts.length - 1]] = escapedValue;
            });

            console.log('Escape result:', result);
            return result;
        } catch (error) {
            console.error('Error in Escape node:', error);
            return {
                error: error.message || 'An error occurred',
                details: error.toString(),
            };
        }
    };

    // Test Code node
    const handleTestCodeNode = async (config) => {
        try {
            console.log('Testing Code node with config:', config);

            // Get input data for this node
            const inputData = getNodeInputData(selectedNode?.id || '');
            console.log('Input data for code execution:', inputData);

            // STEP 1: Pre-resolve {{variable}} syntax in code
            let code = config.code || '';
            
            // Replace {{variable}} with actual values
            const variablePattern = /\{\{([^}]+)\}\}/g;
            let resolvedCode = code;
            let match;
            
            while ((match = variablePattern.exec(code)) !== null) {
                const fullMatch = match[0]; // {{path}}
                const path = match[1]; // path
                const value = getValueFromPath(path, inputData);
                
                if (value !== undefined && value !== null) {
                    // Encode value properly for JavaScript
                    let replacement;
                    if (typeof value === 'string') {
                        replacement = JSON.stringify(value);
                    } else if (typeof value === 'number' || typeof value === 'boolean') {
                        replacement = JSON.stringify(value);
                    } else if (typeof value === 'object') {
                        replacement = JSON.stringify(value);
                    } else {
                        replacement = 'null';
                    }
                    resolvedCode = resolvedCode.replace(fullMatch, replacement);
                    
                    console.log('Resolved variable:', { path, value, replacement });
                }
            }
            
            console.log('Code after variable resolution:', resolvedCode);

            // STEP 2: Create sandbox environment for code execution
            const $input = {
                first: () => inputData && inputData.length > 0 ? inputData[0] : {},
                all: () => inputData || [],
                item: (index) => inputData && inputData[index] ? inputData[index] : {},
            };

            // STEP 3: Execute resolved JavaScript code
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const executeCode = new AsyncFunction('$input', resolvedCode);
            
            const result = await executeCode($input);
            
            console.log('Code execution result:', result);
            return result;
        } catch (error) {
            console.error('Error executing code:', error);
            return {
                error: error.message || 'An error occurred',
                details: error.toString(),
                stack: error.stack,
            };
        }
    };

    const handleSaveConfig = async (config) => {
        if (!selectedNode) return;

        // Update node data with config
        const updatedNode = {
            ...selectedNode,
            data: {
                ...selectedNode.data,
                config,
                label: config.path || config.url || config.model || config.code?.substring(0, 30) || selectedNode.data.label,
            }
        };

        setNodes(nodes.map(node =>
            node.id === selectedNode.id ? updatedNode : node
        ));
        
        setHasChanges(true);
        setSaved(false);

        // Save to backend (only if workflow is already created)
        if (id !== 'new' && workflow?.id) {
            try {
                await axios.post(`/workflows/${id}/nodes`, {
                    node_id: selectedNode.id,
                    type: selectedNode.type,
                    config: config,
                });
            } catch (error) {
                console.error('Error saving node config:', error);
            }
        }
    };

    // Handle test results and save to output data
    const handleTestResult = (nodeId, result) => {
        console.log('handleTestResult called for node:', nodeId);
        console.log('Result:', result);
        setNodeOutputData(prev => {
            const newData = {
                ...prev,
                [nodeId]: result,
            };
            console.log('Updated nodeOutputData:', newData);
            return newData;
        });
    };

    // Execute a node to get its output based on input
    const executeNode = async (node, inputData) => {
        if (node.type === 'webhook') {
            // Webhook nodes return the input data as output (they trigger the workflow)
            return inputData && inputData.length > 0 ? inputData[0] : { message: 'Webhook triggered' };
        } else if (node.type === 'http') {
            // For HTTP nodes, we would execute the HTTP request
            // This is a simplified version - in production, you'd want to handle this differently
            if (node.data?.config?.url) {
                try {
                    const result = await handleTestHttpNode(node.data.config);
                    return result;
                } catch (error) {
                    return { error: error.message };
                }
            }
            return inputData && inputData.length > 0 ? inputData[0] : {};
        }
        // For other node types, just pass through the input
        return inputData && inputData.length > 0 ? inputData[0] : {};
    };

    if (!workflow) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    }

    return (
        <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={() => navigate(getBackUrl())}
                            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        >
                            ← Back
                        </button>
                        <div>
                            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                                {workflow.name}
                            </h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {workflow.description || 'No description'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-6">
                        {/* Tab Navigation */}
                        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                            <button
                                onClick={() => setActiveTab('editor')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                    activeTab === 'editor'
                                        ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                }`}
                            >
                                Editor
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                    activeTab === 'history'
                                        ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                }`}
                            >
                                History
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        <div className="relative">
                            <button
                                onClick={() => setShowNodeMenu(!showNodeMenu)}
                                className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-md text-sm font-medium"
                            >
                                + Add Node
                            </button>
                            {showNodeMenu && (
                                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 shadow-lg rounded-md py-1 z-10">
                                    <button
                                        onClick={() => { addNode('webhook', 'Webhook'); setShowNodeMenu(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    >
                                        Webhook
                                    </button>
                                    <button
                                        onClick={() => { addNode('http', 'HTTP Request'); setShowNodeMenu(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    >
                                        HTTP Request
                                    </button>
                                    <button
                                        onClick={() => { addNode('perplexity', 'Perplexity AI'); setShowNodeMenu(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    >
                                        Perplexity AI
                                    </button>
                                    <button
                                        onClick={() => { addNode('code', 'Code'); setShowNodeMenu(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    >
                                        Code
                                    </button>
                                    <button
                                        onClick={() => { addNode('escape', 'Escape & Set'); setShowNodeMenu(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    >
                                        Escape & Set
                                    </button>
                                    <button
                                        onClick={() => { addNode('if', 'If'); setShowNodeMenu(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    >
                                        If
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        {/* Export Button */}
                        <button
                            onClick={handleExportWorkflow}
                            className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2"
                            title="Export workflow to JSON"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                            </svg>
                            <span>Export</span>
                        </button>
                        
                        {/* Import Button */}
                        <label className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2 cursor-pointer">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <span>Import</span>
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleImportWorkflow}
                                className="hidden"
                            />
                        </label>
                        
                        <button
                            onClick={handleSave}
                            disabled={isSaving || !hasChanges}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                isSaving
                                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 cursor-wait'
                                    : !hasChanges
                                        ? 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 cursor-not-allowed'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            }`}
                        >
                            {isSaving ? 'Saving...' : !hasChanges ? 'Saved' : 'Save'}
                        </button>
                        <button
                            onClick={handleToggleActive}
                            className={`px-4 py-2 rounded-md text-sm font-medium ${
                                workflow.active
                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                    : 'bg-green-600 hover:bg-green-700 text-white'
                            }`}
                        >
                            {workflow.active ? 'Deactivate' : 'Activate'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative" ref={reactFlowWrapper}>
                {activeTab === 'editor' ? (
                    <>
                        <ReactFlow
                    onInit={setReactFlowInstance}
                    nodes={nodes.map(node => {
                        // Find which handles are connected
                        const connectedHandles = edges
                            .filter(e => e.source === node.id)
                            .map(e => e.sourceHandle || 'default');
                        
                        return {
                            ...node,
                            sourcePosition: 'right',
                            targetPosition: 'left',
                            data: {
                                ...node.data,
                                nodeId: node.id,
                                onQuickAdd: handleQuickAddNode,
                                connectedHandles: connectedHandles,
                            },
                        };
                    })}
                    edges={edges.map(edge => {
                        // Check if this edge will be active (for If nodes, check sourceHandle)
                        const sourceNode = nodes.find(n => n.id === edge.source);
                        let isActive = false;
                        
                        // If source is an If node with test results
                        if (sourceNode?.type === 'if' && nodeOutputData[edge.source]) {
                            const ifOutput = nodeOutputData[edge.source];
                            if (ifOutput.result !== undefined) {
                                const expectedHandle = ifOutput.result ? 'true' : 'false';
                                isActive = edge.sourceHandle === expectedHandle;
                            }
                        } else if (nodeOutputData[edge.source]) {
                            // For non-If nodes, edge is active if source has output
                            isActive = true;
                        }
                        
                        return {
                            ...edge,
                            style: { 
                                stroke: isActive ? '#10b981' : '#6b7280', 
                                strokeWidth: 1.5, // Mỏng
                                opacity: isActive ? 1 : 0.5,
                            },
                            interactionWidth: 20, // Vùng hover rộng để dễ click
                            markerEnd: {
                                type: 'arrowclosed',
                                color: isActive ? '#10b981' : '#6b7280',
                            },
                            animated: false, // Tắt animated (dashed line)
                        };
                    })}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeContextMenu={handleNodeContextMenu}
                    onNodeDoubleClick={handleNodeDoubleClick}
                    onEdgeContextMenu={onEdgeContextMenu}
                    onEdgeMouseEnter={onEdgeMouseEnter}
                    onEdgeMouseLeave={onEdgeMouseLeave}
                    onPaneClick={() => {
                        setShowNodeContextMenu(false);
                        setSelectedEdge(null);
                        setHoveredEdge(null);
                    }}
                    nodeTypes={nodeTypes}
                    fitView
                    connectionLineStyle={{ stroke: '#6b7280', strokeWidth: 1.5 }}
                    selectionOnDrag={true}
                    selectNodesOnDrag={true}
                    selectionMode={SelectionMode.Partial}
                    panOnDrag={isSpacePressed ? [0, 1, 2] : false}
                    panOnScroll={true}
                    panOnScrollMode="free"
                    zoomOnScroll={false}
                    zoomOnPinch={true}
                    zoomOnDoubleClick={false}
                    preventScrolling={true}
                    defaultEdgeOptions={{
                        style: { stroke: '#6b7280', strokeWidth: 1.5, opacity: 0.5 },
                        interactionWidth: 20,
                        markerEnd: {
                            type: 'arrowclosed',
                            color: '#6b7280',
                        },
                    }}
                >
                    <Background />
                    <Controls />
                    <MiniMap />
                </ReactFlow>

                {/* Edge Hover Menu - Icons on edge */}
                {hoveredEdge && (
                    <div
                        className="fixed flex items-center gap-2 z-[60] pointer-events-auto"
                        style={{
                            left: `${edgeMenuPosition.x}px`,
                            top: `${edgeMenuPosition.y}px`,
                            transform: 'translate(-50%, -50%)',
                        }}
                        onMouseEnter={() => setHoveredEdge(hoveredEdge)}
                        onMouseLeave={() => setHoveredEdge(null)}
                    >
                        {/* Add intermediate node button */}
                        <div className="relative">
                            <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowEdgeNodeMenu(!showEdgeNodeMenu);
                                }}
                                className="w-8 h-8 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-md flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900 shadow-lg transition-colors"
                                title="Add node between"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                            {showEdgeNodeMenu && (
                                <div 
                                    className="absolute left-0 top-full mt-2 bg-white dark:bg-gray-800 shadow-xl rounded-lg py-1 z-[100] min-w-[160px] border border-gray-300 dark:border-gray-600"
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <button onClick={() => { handleAddIntermediateNode(hoveredEdge, 'http'); setShowEdgeNodeMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700">🌐 HTTP Request</button>
                                    <button onClick={() => { handleAddIntermediateNode(hoveredEdge, 'perplexity'); setShowEdgeNodeMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700">🤖 Perplexity AI</button>
                                    <button onClick={() => { handleAddIntermediateNode(hoveredEdge, 'code'); setShowEdgeNodeMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700">💻 Code</button>
                                    <button onClick={() => { handleAddIntermediateNode(hoveredEdge, 'escape'); setShowEdgeNodeMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700">✂️ Escape & Set</button>
                                    <button onClick={() => { handleAddIntermediateNode(hoveredEdge, 'if'); setShowEdgeNodeMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700">🔀 If</button>
                                    <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                                    <button onClick={() => setShowEdgeNodeMenu(false)} className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700">Cancel</button>
                                </div>
                            )}
                        </div>

                        {/* Delete edge button */}
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteEdge(hoveredEdge);
                            }}
                            className="w-8 h-8 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-md flex items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900 shadow-lg transition-colors"
                            title="Delete connection"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* Edge Context Menu */}
                {showNodeContextMenu && selectedEdge && (
                    <div
                        className="absolute bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
                        style={{
                            left: `${contextMenuPosition.x}px`,
                            top: `${contextMenuPosition.y}px`,
                        }}
                    >
                        <button
                            onClick={() => handleDeleteEdge()}
                            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center space-x-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span>Delete Connection</span>
                        </button>
                    </div>
                )}

                {/* Node Context Menu */}
                {showNodeContextMenu && !selectedEdge && selectedNode && (
                    <div
                        className="absolute bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
                        style={{
                            left: `${contextMenuPosition.x}px`,
                            top: `${contextMenuPosition.y}px`,
                        }}
                    >
                        {(selectedNode.type === 'webhook' || selectedNode.type === 'http' || selectedNode.type === 'perplexity' || selectedNode.type === 'code' || selectedNode.type === 'escape' || selectedNode.type === 'if') && (
                            <button
                                onClick={handleConfigureNode}
                                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>Configure Node</span>
                            </button>
                        )}
                        <button
                            onClick={handleRenameNode}
                            className="w-full text-left px-4 py-2 text-sm text-blue-400 hover:bg-gray-700 flex items-center space-x-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            <span>Rename Node</span>
                        </button>
                        <button
                            onClick={() => {
                                handleCopyNodes();
                                setShowNodeContextMenu(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-green-400 hover:bg-gray-700 flex items-center space-x-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>Copy Node</span>
                        </button>
                        <button
                            onClick={handleDeleteNode}
                            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center space-x-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span>Delete Node</span>
                        </button>
                    </div>
                )}

                {/* Config Modal */}
                {showConfigModal && selectedNode && selectedNode.type === 'webhook' && (
                    <WebhookConfigModal
                        node={selectedNode}
                        workflowId={id}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onRename={() => openRenameModal(selectedNode.id)}
                        onTestResult={handleTestResult}
                    />
                )}

                {showConfigModal && selectedNode && selectedNode.type === 'http' && (
                    <HttpRequestConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestHttpNode}
                        onRename={() => openRenameModal(selectedNode.id)}
                        inputData={getNodeInputData(selectedNode.id)}
                        outputData={nodeOutputData[selectedNode.id]}
                        onTestResult={handleTestResult}
                        allEdges={edges}
                        allNodes={nodes}
                    />
                )}

                {showConfigModal && selectedNode && selectedNode.type === 'perplexity' && (
                    <PerplexityConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestPerplexityNode}
                        onRename={() => openRenameModal(selectedNode.id)}
                        inputData={getNodeInputData(selectedNode.id)}
                        outputData={nodeOutputData[selectedNode.id]}
                        onTestResult={handleTestResult}
                        allEdges={edges}
                        allNodes={nodes}
                    />
                )}

                {showConfigModal && selectedNode && selectedNode.type === 'code' && (
                    <CodeConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestCodeNode}
                        onRename={() => openRenameModal(selectedNode.id)}
                        inputData={getNodeInputData(selectedNode.id)}
                        outputData={nodeOutputData[selectedNode.id]}
                        onTestResult={handleTestResult}
                        allEdges={edges}
                        allNodes={nodes}
                    />
                )}

                {showConfigModal && selectedNode && selectedNode.type === 'escape' && (
                    <EscapeConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestEscapeNode}
                        onRename={() => openRenameModal(selectedNode.id)}
                        inputData={getNodeInputData(selectedNode.id)}
                        outputData={nodeOutputData[selectedNode.id]}
                        onTestResult={handleTestResult}
                        allEdges={edges}
                        allNodes={nodes}
                    />
                )}

                {showConfigModal && selectedNode && selectedNode.type === 'if' && (
                    <IfConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestIfNode}
                        onRename={() => openRenameModal(selectedNode.id)}
                        inputData={getNodeInputData(selectedNode.id)}
                        outputData={nodeOutputData[selectedNode.id]}
                        onTestResult={handleTestResult}
                        allEdges={edges}
                        allNodes={nodes}
                    />
                )}

                {/* Rename Node Modal */}
                <RenameNodeModal
                    isOpen={showRenameModal}
                    currentName={nodeToRename?.data?.customName || nodeToRename?.data?.label || ''}
                    existingNames={nodes
                        .filter(n => n.id !== nodeToRename?.id)
                        .map(n => n.data.customName || n.data.label)
                        .filter(Boolean)
                    }
                    onRename={(newName) => {
                        if (nodeToRename) {
                            handleRenameNodeFromModal(nodeToRename.id, newName);
                        }
                        setShowRenameModal(false);
                        setNodeToRename(null);
                    }}
                    onClose={() => {
                        setShowRenameModal(false);
                        setNodeToRename(null);
                    }}
                />
                    </>
                ) : (
                    <WorkflowHistory />
                )}
            </div>
        </div>
    );
}

export default WorkflowEditor;

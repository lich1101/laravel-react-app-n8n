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
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import WebhookConfigModal from './WebhookConfigModal';
import ScheduleTriggerConfigModal from './ScheduleTriggerConfigModal';
import HttpRequestConfigModal from './HttpRequestConfigModal';
import PerplexityConfigModal from './PerplexityConfigModal';
import ClaudeConfigModal from './ClaudeConfigModal';
import CodeConfigModal from './CodeConfigModal';
import EscapeConfigModal from './EscapeConfigModal';
import IfConfigModal from './IfConfigModal';
import SwitchConfigModal from './SwitchConfigModal';
import GoogleDocsConfigModal from './GoogleDocsConfigModal';
import GoogleSheetsConfigModal from './GoogleSheetsConfigModal';
import GeminiConfigModal from './GeminiConfigModal';
import WorkflowHistory from './WorkflowHistory';
import RenameNodeModal from './RenameNodeModal';
import { splitVariablePath, traverseVariableSegments, resolveVariableValue } from '../utils/variablePath';

// Compact node component with quick-add button
const CompactNode = ({ data, nodeType, iconPath, color, handles, onQuickAdd, connectedHandles = [], selected }) => {
    const isRunning = data?.isRunning || false;
    const isCompleted = data?.isCompleted || false;

    // Determine border color: completed > selected > default
    const getBorderClass = () => {
        if (isCompleted) return 'border-emerald-500 ring-2 ring-emerald-200';
        if (selected) return 'border-blue-500 ring-2 ring-blue-200';
        return 'border-subtle';
    };

    return (
        <div 
            className={`bg-surface-elevated border-2 rounded-2xl p-3 w-20 h-20 shadow-card relative flex items-center justify-center group transition-all ${getBorderClass()}`}
            title={data.customName || data.label || nodeType}
        >
            {/* Input handle */}
            {handles.input && (
                <Handle 
                    type="target" 
                    position={Position.Left} 
                    className="!bg-slate-300 !w-2.5 !h-2.5 !border-2 !border-slate-300"
                />
            )}
            
            {/* Icon SVG */}
            <div className="w-10 h-10 flex items-center justify-center pointer-events-none relative">
                <img 
                    src={iconPath} 
                    alt={nodeType}
                    className={`w-full h-full object-contain ${isRunning ? 'opacity-30' : ''}`}
                />
                {/* Loading icon overlay when running */}
                {isRunning && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <img 
                            src="/icons/nodes/node_active.svg" 
                            alt="running"
                            className="w-8 h-8 animate-spin"
                        />
                    </div>
                )}
            </div>
            
            {/* Node name label - Always visible */}
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-surface-elevated text-secondary text-xs px-3 py-1.5 rounded-lg border border-subtle shadow-card whitespace-nowrap pointer-events-none ">
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
                                    className={`!w-2.5 !h-2.5 !rounded-full !border-2 !border-slate-300 ${
                                        output.color === 'green' ? '!bg-emerald-400' :
                                        output.color === 'red' ? '!bg-rose-400' :
                                        '!bg-slate-300'
                                    }`}
                                    style={{ 
                                        left: 'calc(100%)',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                {output.label && (
                                    <span 
                                        className={`absolute text-xs font-medium whitespace-nowrap pointer-events-none ${
                                            output.color === 'green' ? 'text-emerald-500' :
                                            output.color === 'red' ? 'text-rose-500' :
                                            'text-muted'
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
                                    className="absolute w-4 h-0.5 bg-slate-300 pointer-events-none"
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
                                    className={`!w-2.5 !h-2.5 !rounded-full !border-2 !border-slate-300 ${
                                        output.color === 'green' ? '!bg-emerald-400' :
                                        output.color === 'red' ? '!bg-rose-400' :
                                        '!bg-slate-300'
                                    }`}
                                    style={{ 
                                        left: 'calc(100% )',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                
                                {/* Line from head to tail */}
                                <div 
                                    className="absolute w-4 h-0.5 bg-slate-300 pointer-events-none"
                                    style={{ 
                                        left: 'calc(100% + 30px)',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                
                                {/* Handle TAIL - Square [+] (for quick-add) */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onQuickAdd?.(data.nodeId, output.id);
                                    }}
                                    className={`absolute w-5 h-5 border-2 rounded-lg flex items-center justify-center text-xs font-bold shadow-card z-10 transition-colors ${
                                        output.color === 'green' ? 'bg-emerald-500 hover:bg-emerald-600 border-emerald-600 text-white' :
                                        output.color === 'red' ? 'bg-rose-500 hover:bg-rose-600 border-rose-600 text-white' :
                                        'bg-surface-strong hover:bg-surface-muted border-strong text-primary'
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
                                            output.color === 'green' ? 'text-emerald-500' :
                                            output.color === 'red' ? 'text-rose-500' :
                                            'text-muted'
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
    schedule: (props) => (
        <CompactNode 
            {...props} 
            nodeType="schedule"
            iconPath="/icons/nodes/schedule.svg"
            color="cyan"
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
    claude: (props) => (
        <CompactNode 
            {...props} 
            nodeType="claude"
            iconPath="/icons/nodes/claude.svg"
            color="orange"
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
    switch: (props) => {
        // Dynamic outputs based on rules
        const rules = props.data?.config?.rules || [];
        const outputs = rules.map((rule, index) => ({
            id: `output${index}`,
            label: rule.outputName || `Output ${index + 1}`,
            color: 'blue'
        }));
        // Add fallback output
        outputs.push({
            id: 'fallback',
            label: props.data?.config?.fallbackOutput || 'No Match',
            color: 'gray'
        });

        return (
            <CompactNode 
                {...props} 
                nodeType="switch"
                iconPath="/icons/nodes/switch.svg"
                color="cyan"
                handles={{ 
                    input: true, 
                    outputs: outputs
                }}
                onQuickAdd={props.data.onQuickAdd}
                connectedHandles={props.data.connectedHandles || []}
                selected={props.selected}
            />
        );
    },
    googledocs: (props) => (
        <CompactNode 
            {...props} 
            nodeType="googledocs"
            iconPath="/icons/nodes/googledocs.svg"
            color="blue"
            handles={{ input: true, outputs: [{ id: null }] }}
            onQuickAdd={props.data.onQuickAdd}
            connectedHandles={props.data.connectedHandles || []}
            selected={props.selected}
        />
    ),
    googlesheets: (props) => (
        <CompactNode 
            {...props} 
            nodeType="googlesheets"
            iconPath="/icons/nodes/googlesheets.svg"
            color="green"
            handles={{ input: true, outputs: [{ id: null }] }}
            onQuickAdd={props.data.onQuickAdd}
            connectedHandles={props.data.connectedHandles || []}
            selected={props.selected}
        />
    ),
    gemini: (props) => (
        <CompactNode 
            {...props} 
            nodeType="gemini"
            iconPath="/icons/nodes/gemini.svg"
            color="purple"
            handles={{ input: true, outputs: [{ id: null }] }}
            onQuickAdd={props.data.onQuickAdd}
            connectedHandles={props.data.connectedHandles || []}
            selected={props.selected}
        />
    ),
};

const ADD_NODE_OPTIONS = [
    { type: 'webhook', label: 'Webhook', icon: '🌐' },
    { type: 'schedule', label: 'Schedule Trigger', icon: '⏰' },
    { type: 'http', label: 'HTTP Request', icon: '🔗' },
    { type: 'perplexity', label: 'Perplexity AI', icon: '🤖' },
    { type: 'claude', label: 'Claude AI', icon: '🤖' },
    { type: 'gemini', label: 'Gemini AI', icon: '🤖' },
    { type: 'code', label: 'Code', icon: '💻' },
    { type: 'escape', label: 'Escape & Set', icon: '✂️' },
    { type: 'if', label: 'If', icon: '🔀' },
    { type: 'switch', label: 'Switch', icon: '🔁' },
    { type: 'googledocs', label: 'Google Docs', icon: '📄' },
    { type: 'googlesheets', label: 'Google Sheets', icon: '📊' },
];


function WorkflowEditor() {
    const { id: legacyId, workflowId } = useParams();
    const id = workflowId || legacyId;
    const navigate = useNavigate();
    const location = useLocation();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const workflowBasePath = location.pathname.startsWith('/dashboard/workflows') ? '/dashboard/workflows' : '/workflows';
    
    // Get back URL based on user role
    const getBackUrl = () => {
        if (currentUser.role === 'administrator') {
            return '/administrator';
        } else if (currentUser.role === 'admin') {
            return '/admin';
        }
        return '/dashboard/workflows/manage';
    };
    
    const [workflow, setWorkflow] = useState(null);
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [showNodeMenu, setShowNodeMenu] = useState(false);
    const [showEdgeNodeMenu, setShowEdgeNodeMenu] = useState(false);
    const [quickAddContext, setQuickAddContext] = useState(null);
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
    const [isTestingWorkflow, setIsTestingWorkflow] = useState(false);
    const [runningNodes, setRunningNodes] = useState(new Set());
    const [completedNodes, setCompletedNodes] = useState(new Set());
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState('');
    const [testExecutionId, setTestExecutionId] = useState(null);
    const reactFlowWrapper = useRef(null);
    const [reactFlowInstance, setReactFlowInstance] = useState(null);
    const testPollingRef = useRef(null);

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

            // Open add-node sidebar with Tab
            if (e.key === 'Tab') {
                e.preventDefault();
                setQuickAddContext(null);
                setShowNodeMenu(true);
                return;
            }

            // Copy: Cmd+C or Ctrl+C
            if (ctrlOrCmd && e.key === 'c') {
                // Check if user has selected text (e.g., in input fields, labels, etc.)
                const selection = window.getSelection();
                const hasTextSelection = selection && selection.toString().length > 0;
                
                // Only copy nodes if no text is selected
                if (!hasTextSelection) {
                    e.preventDefault();
                    handleCopyNodes();
                }
                // If text is selected, let browser handle the copy naturally (don't preventDefault)
            }

            // Paste: Cmd+V or Ctrl+V
            if (ctrlOrCmd && e.key === 'v') {
                // Check if user is in a field that can accept paste
                const selection = window.getSelection();
                const hasTextSelection = selection && selection.toString().length > 0;
                const isEditableField = e.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
                
                // Only paste nodes if not in an editable field
                if (!isEditableField) {
                    e.preventDefault();
                    handlePasteNodes();
                }
            }

            // Select All: Cmd+A or Ctrl+A
            if (ctrlOrCmd && (e.key === 'a' || e.key === 'A')) {
                // Check if user is in an editable field
                const isEditableField = e.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
                
                // Only select all nodes if not in an editable field
                if (!isEditableField) {
                    e.preventDefault();
                    handleSelectAllNodes();
                }
                // If in editable field, let browser handle select all naturally
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
        // If creating new workflow - auto-create in database immediately
        if (id === 'new') {
            try {
                console.log('Auto-creating new workflow in database...');
                const response = await axios.post('/workflows', {
                    name: 'Untitled Workflow',
                    description: '',
                    nodes: [],
                    edges: [],
                    active: false
                });
                
                const newWorkflowId = response.data.id;
                console.log('New workflow created with ID:', newWorkflowId);
                
                // Redirect to the newly created workflow (replace history to avoid back button issues)
                navigate(`${workflowBasePath}/${newWorkflowId}`, { replace: true });
                return;
            } catch (error) {
                console.error('Error auto-creating workflow:', error);
                alert('Lỗi khi tạo workflow mới');
                navigate(getBackUrl());
                return;
            }
        }

        // Fetch existing workflow
        try {
            const response = await axios.get(`/workflows/${id}`);
            const data = response.data;
            setWorkflow(data);
            
            setNodes(data.nodes || []);
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
            claude: 'Claude AI',
            code: 'Code',
            escape: 'Escape & Set',
            if: 'If',
            switch: 'Switch',
            googledocs: 'Google Docs',
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

    const handleSaveWorkflowName = async (newName) => {
        if (!workflow || !workflow.id || !newName.trim()) return;
        
        try {
            await axios.put(`/workflows/${workflow.id}`, {
                name: newName.trim(),
                nodes: workflow.nodes,
                edges: workflow.edges,
            });
            setWorkflow({ ...workflow, name: newName.trim() });
            setIsEditingName(false);
        } catch (error) {
            console.error('Error updating workflow name:', error);
            alert('Error updating workflow name');
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaved(false);
        try {
            // Always update (no more create case, workflow is auto-created on page load)
            await axios.put(`/workflows/${id}`, {
                nodes,
                edges,
            });
            
            setSaved(true);
            setHasChanges(false); // Reset changes after save
            setTimeout(() => setSaved(false), 2000);
        } catch (error) {
            console.error('Error saving workflow:', error);
            alert('Error saving workflow');
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestWorkflow = async () => {
        // Auto-save first
        await handleSave();
        
        if (!workflow?.id) {
            alert('Please save workflow first');
            return;
        }

        // Find webhook node
        const webhookNode = nodes.find(n => n.type === 'webhook');
        if (!webhookNode) {
            alert('Workflow must have a webhook node to test');
            return;
        }

        const webhookPath = webhookNode.data?.config?.path;
        if (!webhookPath) {
            alert('Webhook node must have a path configured');
            return;
        }

        // Reset states
        setIsTestingWorkflow(true);
        setRunningNodes(new Set());
        setCompletedNodes(new Set());
        setNodeOutputData({});
        setTestExecutionId(null);

        // Clear previous polling
        if (testPollingRef.current) {
            clearInterval(testPollingRef.current);
        }

        try {
            // Start listening for webhook
            const response = await axios.post(`/workflows/${workflow.id}/webhook-test-listen`, {
                node_id: webhookNode.id,
                path: webhookPath,
                method: webhookNode.data?.config?.method || 'POST',
            });

            const testRunId = response.data.test_run_id;
            setTestExecutionId(testRunId);

            console.log('✅ Test workflow started, waiting for webhook:', testRunId);
            alert(`Test started! Send a ${webhookNode.data?.config?.method || 'POST'} request to:\n\n${window.location.origin}/api/webhook-test/${webhookPath}`);

            // Poll for execution status
            testPollingRef.current = setInterval(async () => {
                try {
                    const statusResponse = await axios.get(`/workflows/${workflow.id}/webhook-test-status/${testRunId}`);
                    
                    if (statusResponse.data.status === 'received') {
                        // Webhook received, now execute workflow
                        clearInterval(testPollingRef.current);
                        executeTestWorkflow(testRunId, statusResponse.data.data);
                    } else if (statusResponse.data.status === 'timeout' || statusResponse.data.status === 'stopped') {
                        clearInterval(testPollingRef.current);
                        setIsTestingWorkflow(false);
                        alert('Test timeout or stopped');
                    }
                } catch (error) {
                    console.error('Error polling test status:', error);
                    clearInterval(testPollingRef.current);
                    setIsTestingWorkflow(false);
                }
            }, 1000); // Poll every second

        } catch (error) {
            console.error('Error starting test:', error);
            alert('Error starting test: ' + (error.response?.data?.message || error.message));
            setIsTestingWorkflow(false);
        }
    };

    const executeTestWorkflow = async (testRunId, webhookData) => {
        try {
            console.log('🚀 Executing test workflow with webhook data:', webhookData);
            
            // Simulate execution by calling backend
            const response = await axios.post(`/webhook-test/${nodes.find(n => n.type === 'webhook')?.data?.config?.path}`, webhookData);
            
            // Note: Backend will execute and we need to fetch execution results
            // For now, we'll simulate node-by-node execution
            simulateNodeExecution();
            
        } catch (error) {
            console.error('Error executing test workflow:', error);
            setIsTestingWorkflow(false);
        }
    };

    const simulateNodeExecution = async () => {
        // For now, just mark all nodes as completed
        // In real implementation, we'd get execution data from backend
        const allNodeIds = nodes.map(n => n.id);
        
        for (const nodeId of allNodeIds) {
            setRunningNodes(prev => new Set([...prev, nodeId]));
            
            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            setRunningNodes(prev => {
                const newSet = new Set(prev);
                newSet.delete(nodeId);
                return newSet;
            });
            
            setCompletedNodes(prev => new Set([...prev, nodeId]));
        }
        
        setIsTestingWorkflow(false);
        alert('Test workflow completed!');
    };

    const handleToggleActive = async () => {
        if (!workflow?.id) {
            alert('Workflow chưa tồn tại');
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

    const getNodeLabel = (type) => {
        const option = ADD_NODE_OPTIONS.find((item) => item.type === type);
        if (option) return option.label;
        const fallbackLabels = {
            schedule: 'Schedule Trigger',
            schedule_trigger: 'Schedule Trigger',
        };
        return fallbackLabels[type] || type;
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
        setQuickAddContext(null);
        setHasChanges(true);
        setSaved(false);
    };

    const handleAddNodeFromSidebar = (type) => {
        const label = getNodeLabel(type);
        if (quickAddContext) {
            addNode(
                type,
                label,
                quickAddContext.position,
                quickAddContext.sourceNodeId,
                quickAddContext.sourceHandle
            );
        } else {
            addNode(type, label);
        }
    };

    // Handle quick-add node from output handle
    const handleQuickAddNode = (sourceNodeId, sourceHandle) => {
        const sourceNode = nodes.find(n => n.id === sourceNodeId);
        if (!sourceNode) return;

        // Position new node to the right of source node
        const position = {
            x: sourceNode.position.x + 150,
            y: sourceNode.position.y + (sourceHandle === 'false' ? 80 : 0),
        };

        setQuickAddContext({
            sourceNodeId,
            sourceHandle,
            position,
        });
        setShowNodeMenu(true);
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
        if (selectedNode && (selectedNode.type === 'webhook' || selectedNode.type === 'schedule' || selectedNode.type === 'http' || selectedNode.type === 'perplexity' || selectedNode.type === 'code' || selectedNode.type === 'escape' || selectedNode.type === 'if')) {
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

        if (node.type === 'webhook' || node.type === 'schedule' || node.type === 'http' || node.type === 'perplexity' || node.type === 'claude' || node.type === 'gemini' || node.type === 'code' || node.type === 'escape' || node.type === 'if' || node.type === 'switch' || node.type === 'googledocs' || node.type === 'googlesheets') {
            setShowConfigModal(true);
        }
    };

    // Get input data for a node (from ALL upstream nodes)
    // This is used for EXECUTION and VARIABLE RESOLUTION
    const getNodeInputData = (nodeId) => {
        const inputDataArray = [];
        const namedInputs = {};
        const visitedNodes = new Set();
        const queue = [nodeId];

        console.log('Getting input data for node:', nodeId);
        console.log('Available output data:', nodeOutputData);

        // BFS to find ALL upstream nodes
        while (queue.length > 0) {
            const currentNodeId = queue.shift();

            // Get all edges that connect TO this node
            edges.forEach(edge => {
                if (edge.target === currentNodeId) {
                    const sourceNodeId = edge.source;

                    // Skip if already processed
                    if (visitedNodes.has(sourceNodeId)) return;
                    visitedNodes.add(sourceNodeId);

                    const sourceNode = nodes.find(n => n.id === sourceNodeId);
                    const nodeName = sourceNode ? (sourceNode.data.customName || sourceNode.data.label || sourceNode.type) : sourceNodeId;
                    
                    // Add output data if available
                    if (nodeOutputData[sourceNodeId]) {
                        // Only add to array if it's a DIRECT parent
                        if (edge.target === nodeId) {
                            inputDataArray.push(nodeOutputData[sourceNodeId]);
                            console.log('✅ Added output from DIRECT parent node:', nodeName, '→', sourceNodeId);
                        }
                        
                        // Add by customName for ALL upstream nodes
                        namedInputs[nodeName] = nodeOutputData[sourceNodeId];
                        console.log('✅ Mapped upstream node name:', nodeName, '→', sourceNodeId);
                    } else {
                        console.warn('⚠️ Found upstream node but NO OUTPUT DATA:', nodeName, '→', sourceNodeId);
                        console.warn('💡 Please test this node first to make its data available for variable resolution');
                    }

                    // Add to queue to continue traversal
                    queue.push(sourceNodeId);
                }
            });
        }

        console.log('Final input data array (from DIRECT parents):', inputDataArray);
        console.log('Named inputs (from ALL upstream):', Object.keys(namedInputs));
        
        // Merge named inputs into array (like backend does)
        // Result: [output1, output2, ..., NodeName1: output1, NodeName2: output2, ...]
        return Object.assign([], inputDataArray, namedInputs);
    };

    // Get ALL upstream nodes data for UI display in INPUT panel
    // This shows all available node outputs, not just direct parents
    const getAllUpstreamNodesData = (nodeId) => {
        const namedInputs = {};
        const visitedNodes = new Set();
        const queue = [nodeId];

        console.log('Getting ALL upstream nodes data for UI display:', nodeId);
        console.log('Current nodeOutputData state:', nodeOutputData);
        console.log('All edges:', edges);

        // BFS to find all upstream nodes
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
                        const sourceNode = nodes.find(n => n.id === sourceNodeId);
                        if (sourceNode) {
                            const nodeName = sourceNode.data.customName || sourceNode.data.label || sourceNode.type;
                            namedInputs[nodeName] = nodeOutputData[sourceNodeId];
                            console.log('Added upstream node for UI:', nodeName, '→', sourceNodeId);
                        }
                    }

                    // Add to queue to continue traversal
                    queue.push(sourceNodeId);
                }
            });
        }

        console.log('All upstream nodes for UI display:', Object.keys(namedInputs));
        
        // Return only named inputs (no numeric indices needed for UI)
        return namedInputs;
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
            const trimmedPath = path.trim();
            const value = getValueFromPath(trimmedPath, inputData);
            
            console.log('🔍 Resolving variable:', {
                original: fullMatch,
                path: trimmedPath,
                pathParts: splitVariablePath(trimmedPath),
                availableKeys: Object.keys(inputData || {}).filter(k => typeof k === 'string'),
                value: value !== undefined ? (typeof value === 'string' ? value.substring(0, 100) : value) : 'NOT_FOUND',
                type: typeof value,
                willResolve: value !== undefined && value !== null
            });

            if (value !== undefined && value !== null) {
                return String(value);
            }
            
            // If not found, keep the template as-is
            console.error('❌ Variable NOT resolved - keeping template:', {
                fullMatch,
                path: trimmedPath,
                availableNodeNames: Object.keys(inputData).filter(k => typeof k === 'string' && !k.startsWith('input-'))
            });
            return fullMatch;
        });

        return resolved;
    };

    // Helper function to tokenize and traverse a path with complex array indices
    // Supports: "field", "field[0]", "field[0][1]", "field[0].nested[1].deep"
    const traversePath = (pathSegment, startValue) => {
        if (!pathSegment) return startValue;

        const segments = splitVariablePath(pathSegment);
        const result = traverseVariableSegments(segments, startValue);
        return result.exists ? result.value : undefined;
    };

    // Get value from path like "input-0.headers.content-length" or "nodeName.field"
    // Also handles built-in variables like "now"
    const getValueFromPath = (path, inputData) => {
        // Handle built-in variables
        if (path === 'now') {
            // Return current date/time in Vietnamese format
            const now = new Date();
            const vietnamTime = now.toLocaleString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            return vietnamTime;
        }
        
        if (!inputData) return undefined;

        const { exists, value } = resolveVariableValue(path, inputData);
        if (exists) {
            return value;
        }

        // Final fallback: attempt to traverse each array entry (legacy support)
        if (Array.isArray(inputData)) {
            const segments = splitVariablePath(path);
            if (segments.length === 0) {
                return undefined;
            }

            for (let i = 0; i < inputData.length; i++) {
                const entry = inputData[i];
                if (!entry || typeof entry !== 'object') {
                    continue;
                }

                const result = traverseVariableSegments(segments, entry);
                if (result.exists) {
                    return result.value;
                }
            }
        }

        return undefined;
    };

    // Test HTTP Request node (via backend API)
    const handleTestHttpNode = async (config) => {
        console.log('Testing HTTP Request with config:', config);
        return await callTestNodeAPI('http', config);
    };

    // Helper function to call backend test node API
    const callTestNodeAPI = async (nodeType, config) => {
        try {
            const response = await axios.post('/workflows/test-node', {
                nodeType: nodeType,
                config: config,
                inputData: [], // Backend will build this from nodes/edges/nodeOutputs
                nodes: nodes,
                edges: edges,
                nodeOutputs: nodeOutputData,
                nodeId: selectedNode?.id
            });

            console.log(`${nodeType} test result:`, response.data);
            return response.data;
        } catch (error) {
            console.error(`Error testing ${nodeType} node:`, error);
            return {
                error: error.response?.data?.message || error.message || 'An error occurred',
                details: error.response?.data?.error || error.toString(),
            };
        }
    };

    // Test Perplexity node (via backend API)
    const handleTestPerplexityNode = async (config) => {
        console.log('Testing Perplexity with config:', config);
        return await callTestNodeAPI('perplexity', config);
    };

    // OLD - Keeping for reference, but not used
    const handleTestPerplexityNode_OLD = async (config) => {
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

    // Test Claude node (via backend API)
    const handleTestClaudeNode = async (config) => {
        console.log('Testing Claude with config:', config);
        return await callTestNodeAPI('claude', config);
    };

    // Test Gemini node (via backend API)
    const handleTestGeminiNode = async (config) => {
        console.log('Testing Gemini with config:', config);
        return await callTestNodeAPI('gemini', config);
    };

    // Test If node (via backend API)
    const handleTestIfNode = async (config) => {
        console.log('Testing If node with config:', config);
        return await callTestNodeAPI('if', config);
    };

    // OLD - Keeping for reference, but not used
    const handleTestIfNode_OLD = async (config) => {
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

    // Test Google Docs node (call via backend)
    const handleTestGoogleDocsNode = async (config) => {
        try {
            console.log('Testing Google Docs with config:', config);

            const inputData = getNodeInputData(selectedNode?.id || '');
            console.log('Input data for Google Docs:', inputData);

            if (!config.credentialId) {
                throw new Error('Google Docs credential is required');
            }

            // Call backend API using helper
            return await callTestNodeAPI('googledocs', config);
        } catch (error) {
            console.error('Error testing Google Docs:', error);
            return {
                error: error.response?.data?.message || error.message || 'An error occurred',
                details: error.toString(),
            };
        }
    };

    // Test Google Sheets node (via backend API)
    const handleTestGoogleSheetsNode = async (config) => {
        console.log('Testing Google Sheets with config:', config);
        return await callTestNodeAPI('googlesheets', config);
    };

    // Test Switch node (via backend API)
    const handleTestSwitchNode = async (config) => {
        console.log('Testing Switch node with config:', config);
        return await callTestNodeAPI('switch', config);
    };

    // OLD - Keeping for reference, but not used
    const handleTestSwitchNode_OLD = async (config) => {
        try {
            console.log('Testing Switch node with config:', config);

            const inputData = getNodeInputData(selectedNode?.id || '');
            console.log('Input data for switch evaluation:', inputData);

            const rules = config.rules || [];
            
            // Evaluate each rule in order
            for (let index = 0; index < rules.length; index++) {
                const rule = rules[index];
                const value = resolveVariables(rule.value || '', inputData);
                const operator = rule.operator || 'equal';
                const value2 = !['exists', 'notExists', 'isEmpty', 'isNotEmpty'].includes(operator)
                    ? resolveVariables(rule.value2 || '', inputData)
                    : null;

                // Evaluate condition (reuse If logic)
                let result = false;
                switch (operator) {
                    case 'equal':
                        result = value == value2;
                        break;
                    case 'notEqual':
                        result = value != value2;
                        break;
                    case 'contains':
                        result = String(value).includes(String(value2));
                        break;
                    case 'notContains':
                        result = !String(value).includes(String(value2));
                        break;
                    case 'startsWith':
                        result = String(value).startsWith(String(value2));
                        break;
                    case 'endsWith':
                        result = String(value).endsWith(String(value2));
                        break;
                    case 'regex':
                        result = new RegExp(value2).test(String(value));
                        break;
                    case 'exists':
                        result = value !== null && value !== undefined;
                        break;
                    case 'notExists':
                        result = value === null || value === undefined;
                        break;
                    case 'isEmpty':
                        result = !value || value === '';
                        break;
                    case 'isNotEmpty':
                        result = !!value && value !== '';
                        break;
                }

                console.log('Switch rule evaluated:', { index, value, operator, value2, result });

                // If rule matches, return this output
                if (result) {
                    return {
                        matchedOutput: index,
                        outputName: rule.outputName || `Output ${index + 1}`,
                        output: inputData[0] || {},
                    };
                }
            }

            // No rule matched - use fallback
            return {
                matchedOutput: -1,
                outputName: config.fallbackOutput || 'No Match',
                output: inputData[0] || {},
            };
        } catch (error) {
            console.error('Error in Switch node:', error);
            return {
                error: error.message || 'An error occurred',
                details: error.toString(),
            };
        }
    };

    // Test Escape node (via backend API)
    const handleTestEscapeNode = async (config) => {
        console.log('Testing Escape node with config:', config);
        return await callTestNodeAPI('escape', config);
    };

    // Test Code node (via backend API)
    const handleTestCodeNode = async (config) => {
        console.log('Testing Code node with config:', config);
        return await callTestNodeAPI('code', config);
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

        // Save to backend (workflow always exists now)
        if (workflow?.id) {
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
        <div className="h-screen flex flex-col bg-surface">
            {/* Header */}
            <div className="toolbar px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        
                        <div>
                            {isEditingName ? (
                                <input
                                    type="text"
                                    value={editedName}
                                    onChange={(e) => setEditedName(e.target.value)}
                                    onBlur={() => {
                                        if (editedName.trim()) {
                                            handleSaveWorkflowName(editedName);
                                        } else {
                                            setIsEditingName(false);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            if (editedName.trim()) {
                                                handleSaveWorkflowName(editedName);
                                            }
                                        } else if (e.key === 'Escape') {
                                            setIsEditingName(false);
                                        }
                                    }}
                                    autoFocus
                                    className="text-xl font-semibold text-primary bg-surface-elevated border border-subtle rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            ) : (
                                <h1
                                    onClick={() => {
                                        if (workflow && workflow.id) {
                                            setEditedName(workflow.name);
                                            setIsEditingName(true);
                                        }
                                    }}
                                    className="text-xl font-semibold text-primary cursor-pointer hover:text-blue-600"
                                    title="Click to edit workflow name"
                                >
                                    {workflow.name}
                                </h1>
                            )}
                            <p className="text-sm text-muted">
                                {workflow.description || 'No description'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-6">
                        {/* Tab Navigation */}
                        <div className="flex space-x-1 bg-surface-muted p-1 rounded-2xl border border-subtle">
                            <button
                                onClick={() => setActiveTab('editor')}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                                    activeTab === 'editor'
                                        ? 'bg-surface-elevated text-primary shadow-card'
                                        : 'text-muted hover:text-primary'
                                }`}
                            >
                                Editor
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                                    activeTab === 'history'
                                        ? 'bg-surface-elevated text-primary shadow-card'
                                        : 'text-muted hover:text-primary'
                                }`}
                            >
                                History
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={() => {
                                setQuickAddContext(null);
                                setShowNodeMenu((prev) => !prev);
                            }}
                            className="btn btn-primary text-sm"
                        >
                            + Add Node
                        </button>
                        
                        {/* Export Button */}
                        <button
                            onClick={handleExportWorkflow}
                            className="btn btn-ghost text-sm"
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
                            className={`btn text-sm font-medium ${
                                isSaving
                                    ? 'btn-muted cursor-wait opacity-80'
                                    : !hasChanges
                                        ? 'btn-muted cursor-not-allowed opacity-80'
                                        : 'btn-primary'
                            }`}
                        >
                            {isSaving ? 'Saving...' : !hasChanges ? 'Saved' : 'Save'}
                        </button>
                        <button
                            onClick={handleToggleActive}
                            className={`btn text-sm font-medium ${
                                workflow.active ? 'btn-danger' : 'btn-success'
                            }`}
                        >
                            {workflow.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                            onClick={handleTestWorkflow}
                            disabled={isTestingWorkflow || !nodes.length}
                            className={`btn text-sm font-medium flex items-center gap-2 ${
                                isTestingWorkflow || !nodes.length
                                    ? 'btn-muted cursor-not-allowed opacity-80'
                                    : 'bg-purple-600 hover:bg-purple-700 text-white shadow-card'
                            }`}
                        >
                            <span>🚀</span>
                            {isTestingWorkflow ? 'Testing...' : 'Test workflow'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative" ref={reactFlowWrapper}>
                {/* Overlay for node sidebar */}
                <div
                    onClick={() => {
                        setShowNodeMenu(false);
                        setQuickAddContext(null);
                    }}
                    className={`fixed inset-0 z-[1500] transition-opacity duration-200 ${
                        showNodeMenu ? 'opacity-100 pointer-events-auto bg-black/15 backdrop-blur-sm' : 'opacity-0 pointer-events-none'
                    }`}
                />

                {/* Node library sidebar */}
                <aside
                    className={`fixed top-0 right-0 h-screen w-72 max-w-full bg-surface-elevated border-l border-subtle shadow-card z-[2001] transform transition-transform duration-300 ${
                        showNodeMenu ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'
                    }`}
                >
                    <div className="h-full flex flex-col pt-[72px]">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-subtle">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-muted">Thư viện node</p>
                                <h3 className="text-base font-semibold text-primary mt-1">Thêm node mới</h3>
                            </div>
                            <button
                                onClick={() => {
                                    setShowNodeMenu(false);
                                    setQuickAddContext(null);
                                }}
                                className="p-2 rounded-full hover:bg-surface-muted text-muted hover:text-primary transition-colors"
                                title="Đóng"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="px-5 py-3 border-b border-subtle">
                            <p className="text-sm text-muted">
                                Chọn loại node để chèn vào workflow. Sidebar sẽ tự đóng sau khi bạn chọn.
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                            {ADD_NODE_OPTIONS.map((option) => (
                                <button
                                    key={option.type}
                                    onClick={() => handleAddNodeFromSidebar(option.type)}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-medium text-secondary hover:text-primary hover:bg-surface-muted transition-colors"
                                >
                                    <span className="text-lg leading-none">{option.icon}</span>
                                    <span>{option.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

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
                                isRunning: runningNodes.has(node.id),
                                isCompleted: completedNodes.has(node.id),
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
                        } else if (sourceNode?.type === 'switch' && nodeOutputData[edge.source]) {
                            const switchOutput = nodeOutputData[edge.source];
                            if (switchOutput.matchedOutput !== undefined) {
                                const expectedHandle = switchOutput.matchedOutput >= 0
                                    ? `output${switchOutput.matchedOutput}`
                                    : 'fallback';
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
                                className="w-8 h-8 bg-surface-elevated border border-subtle rounded-xl flex items-center justify-center text-primary hover:bg-surface-muted shadow-card transition-colors"
                                title="Add node between"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                            {showEdgeNodeMenu && (
                                <div 
                                    className="absolute left-0 top-full mt-2 menu-panel py-1 z-[100] min-w-[180px]"
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <button onClick={() => { handleAddIntermediateNode(hoveredEdge, 'http'); setShowEdgeNodeMenu(false); }} className="menu-item text-sm">🌐 HTTP Request</button>
                                    <button onClick={() => { handleAddIntermediateNode(hoveredEdge, 'perplexity'); setShowEdgeNodeMenu(false); }} className="menu-item text-sm">🤖 Perplexity AI</button>
                                    <button onClick={() => { handleAddIntermediateNode(hoveredEdge, 'claude'); setShowEdgeNodeMenu(false); }} className="menu-item text-sm">🤖 Claude AI</button>
                                    <button onClick={() => { handleAddIntermediateNode(hoveredEdge, 'code'); setShowEdgeNodeMenu(false); }} className="menu-item text-sm">💻 Code</button>
                                    <button onClick={() => { handleAddIntermediateNode(hoveredEdge, 'escape'); setShowEdgeNodeMenu(false); }} className="menu-item text-sm">✂️ Escape & Set</button>
                                    <button onClick={() => { handleAddIntermediateNode(hoveredEdge, 'if'); setShowEdgeNodeMenu(false); }} className="menu-item text-sm">🔀 If</button>
                                    <button onClick={() => { handleAddIntermediateNode(hoveredEdge, 'switch'); setShowEdgeNodeMenu(false); }} className="menu-item text-sm">🔀 Switch</button>
                                    <button onClick={() => { handleAddIntermediateNode(hoveredEdge, 'googledocs'); setShowEdgeNodeMenu(false); }} className="menu-item text-sm">📄 Google Docs</button>
                                    <div className="border-t border-subtle my-1"></div>
                                    <button onClick={() => setShowEdgeNodeMenu(false)} className="menu-item menu-item--danger text-sm">Cancel</button>
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
                            className="w-8 h-8 bg-surface-elevated border border-subtle rounded-xl flex items-center justify-center text-rose-500 hover:bg-rose-50 shadow-card transition-colors"
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
                        className="absolute menu-panel py-1 z-50 min-w-[200px]"
                        style={{
                            left: `${contextMenuPosition.x}px`,
                            top: `${contextMenuPosition.y}px`,
                        }}
                    >
                        <button
                            onClick={() => handleDeleteEdge()}
                            className="menu-item menu-item--danger text-sm flex items-center justify-between"
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
                        className="absolute menu-panel py-1 z-50 min-w-[200px]"
                        style={{
                            left: `${contextMenuPosition.x}px`,
                            top: `${contextMenuPosition.y}px`,
                        }}
                    >
                        {(selectedNode.type === 'webhook' || selectedNode.type === 'schedule' || selectedNode.type === 'http' || selectedNode.type === 'perplexity' || selectedNode.type === 'code' || selectedNode.type === 'escape' || selectedNode.type === 'if') && (
                            <button
                                onClick={handleConfigureNode}
                                className="menu-item text-sm flex items-center justify-between"
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
                            className="menu-item text-sm flex items-center justify-between"
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
                            className="menu-item text-sm flex items-center justify-between text-emerald-500 hover:text-emerald-600"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>Copy Node</span>
                        </button>
                        <button
                            onClick={handleDeleteNode}
                            className="menu-item menu-item--danger text-sm flex items-center justify-between"
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
                        outputData={nodeOutputData[selectedNode.id]}
                    />
                )}

                {showConfigModal && selectedNode && selectedNode.type === 'schedule' && (
                    <ScheduleTriggerConfigModal
                        node={selectedNode}
                        workflowId={id}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onRename={() => openRenameModal(selectedNode.id)}
                        onTestResult={handleTestResult}
                        outputData={nodeOutputData[selectedNode.id]}
                    />
                )}

                {showConfigModal && selectedNode && selectedNode.type === 'http' && (
                    <HttpRequestConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestHttpNode}
                        onRename={() => openRenameModal(selectedNode.id)}
                        inputData={getAllUpstreamNodesData(selectedNode.id)}
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
                        inputData={getAllUpstreamNodesData(selectedNode.id)}
                        outputData={nodeOutputData[selectedNode.id]}
                        onTestResult={handleTestResult}
                        allEdges={edges}
                        allNodes={nodes}
                    />
                )}

                {showConfigModal && selectedNode && selectedNode.type === 'claude' && (
                    <ClaudeConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestClaudeNode}
                        onRename={() => openRenameModal(selectedNode.id)}
                        inputData={getAllUpstreamNodesData(selectedNode.id)}
                        outputData={nodeOutputData[selectedNode.id]}
                        onTestResult={handleTestResult}
                        allEdges={edges}
                        allNodes={nodes}
                    />
                )}

                {showConfigModal && selectedNode && selectedNode.type === 'gemini' && (
                    <GeminiConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestGeminiNode}
                        onRename={() => openRenameModal(selectedNode.id)}
                        inputData={getAllUpstreamNodesData(selectedNode.id)}
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
                        inputData={getAllUpstreamNodesData(selectedNode.id)}
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
                        inputData={getAllUpstreamNodesData(selectedNode.id)}
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
                        inputData={getAllUpstreamNodesData(selectedNode.id)}
                        outputData={nodeOutputData[selectedNode.id]}
                        onTestResult={handleTestResult}
                        allEdges={edges}
                        allNodes={nodes}
                    />
                )}

                {showConfigModal && selectedNode && selectedNode.type === 'switch' && (
                    <SwitchConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestSwitchNode}
                        onRename={() => openRenameModal(selectedNode.id)}
                        inputData={getAllUpstreamNodesData(selectedNode.id)}
                        outputData={nodeOutputData[selectedNode.id]}
                        onTestResult={handleTestResult}
                        allEdges={edges}
                        allNodes={nodes}
                    />
                )}

                {showConfigModal && selectedNode && selectedNode.type === 'googledocs' && (
                    <GoogleDocsConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestGoogleDocsNode}
                        onRename={() => openRenameModal(selectedNode.id)}
                        inputData={getAllUpstreamNodesData(selectedNode.id)}
                        outputData={nodeOutputData[selectedNode.id]}
                        onTestResult={handleTestResult}
                        allEdges={edges}
                        allNodes={nodes}
                    />
                )}

                {showConfigModal && selectedNode && selectedNode.type === 'googlesheets' && (
                    <GoogleSheetsConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestGoogleSheetsNode}
                        onRename={() => openRenameModal(selectedNode.id)}
                        inputData={getAllUpstreamNodesData(selectedNode.id)}
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

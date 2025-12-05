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
    useReactFlow,
    EdgeLabelRenderer,
    getBezierPath,
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from '../config/axios';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import usePageTitle from '../hooks/usePageTitle';
import WebhookConfigModal from './WebhookConfigModal';
import ScheduleTriggerConfigModal from './ScheduleTriggerConfigModal';
import HttpRequestConfigModal from './HttpRequestConfigModal';
import PerplexityConfigModal from './PerplexityConfigModal';
import ClaudeConfigModal from './ClaudeConfigModal';
import OpenAIConfigModal from './OpenAIConfigModal';
import CodeConfigModal from './CodeConfigModal';
import EscapeConfigModal from './EscapeConfigModal';
import IfConfigModal from './IfConfigModal';
import SwitchConfigModal from './SwitchConfigModal';
import GoogleDocsConfigModal from './GoogleDocsConfigModal';
import GoogleSheetsConfigModal from './GoogleSheetsConfigModal';
import GeminiConfigModal from './GeminiConfigModal';
import KlingConfigModal from './KlingConfigModal';
import ConvertConfigModal from './ConvertConfigModal';
import WorkflowHistory from './WorkflowHistory';
import RenameNodeModal from './RenameNodeModal';
import { splitVariablePath, traverseVariableSegments, resolveVariableValue } from '../utils/variablePath';

// Helper function to resolve icon path correctly
const getIconPath = (relativePath) => {
    // If already a full URL, return as-is
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
        return relativePath;
    }
    
    // Ensure path starts with /
    const cleanPath = relativePath.startsWith('/') ? relativePath : '/' + relativePath;
    
    // Use window.location.origin to create full URL
    // This ensures icons load correctly even if app is in subdirectory
    // and handles cases where web server doesn't serve static files directly
    const baseUrl = window.location.origin;
    return baseUrl + cleanPath;
};

// Compact node component with quick-add button
const CompactNode = ({ data, nodeType, iconPath, color, handles, onQuickAdd, connectedHandles = [], selected, nodeOutputData = null, isTestingWorkflow = false }) => {
    const isRunning = data?.isRunning || false;
    const isCompleted = data?.isCompleted || false;
    const isError = data?.isError || false;
    const [iconError, setIconError] = useState(false);
    const nodeLabel = data?.customName || data?.label || nodeType;
    const fallbackInitial = nodeLabel?.trim()?.[0]?.toUpperCase() || nodeType?.[0]?.toUpperCase() || '?';
    
    // Resolve icon path
    const resolvedIconPath = getIconPath(iconPath);

    useEffect(() => {
        // Reset error state if icon source/type changes
        setIconError(false);
    }, [iconPath, nodeType]);
    
    // Check if an output handle was actually executed during test
    const isOutputExecuted = (outputId) => {
        if (!isTestingWorkflow || !nodeOutputData) {
            return false;
        }
        
        // For If nodes, check if result matches the output handle
        if (nodeType === 'if') {
            if (nodeOutputData.result !== undefined) {
                const expectedHandle = nodeOutputData.result ? 'true' : 'false';
                return outputId === expectedHandle;
            }
        }
        
        // For single output nodes (no outputId or null), check if there's output data
        if (!outputId || outputId === 'null' || outputId === 'default') {
            if (nodeOutputData && typeof nodeOutputData === 'object' && !nodeOutputData.error) {
                // Single output node - consider it executed if there's output data
                return true;
            }
        }
        
        return false;
    };

    // Determine border color: error > completed > selected > default
    const getBorderClass = () => {
        if (isError) return 'border-rose-500 ring-2 ring-rose-200';
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
                {!iconError ? (
                    <img 
                        src={resolvedIconPath} 
                        alt={nodeType}
                        className={`w-full h-full object-contain ${isRunning ? 'opacity-30' : ''}`}
                        onError={(e) => {
                            console.error('Failed to load icon:', resolvedIconPath, 'Error:', e);
                            setIconError(true);
                        }}
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-base font-semibold text-slate-500">
                        {fallbackInitial}
                    </div>
                )}
                {/* Loading icon overlay when running */}
                {isRunning && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <img 
                            src={getIconPath('/icons/nodes/node_active.svg')} 
                            alt="running"
                            className="w-8 h-8 animate-spin"
                            onError={(e) => console.error('Failed to load node_active icon:', e)}
                        />
                    </div>
                )}
            </div>
            
            {/* Node name label - Always visible */}
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-surface-elevated text-secondary text-xs px-3 py-1.5 rounded-lg border border-subtle shadow-card whitespace-nowrap pointer-events-none ">
                {nodeLabel}
            </div>
            
            {/* Output handles - Dynamic based on connection status */}
            {handles.outputs && handles.outputs.map((output, index) => {
                const topPercent = handles.outputs.length === 1 ? 50 : 30 + (index * 40);
                const handleKey = output.id || 'default';
                const isConnected = connectedHandles.includes(handleKey);
                
                // Check if this output was executed during test
                const wasExecuted = isOutputExecuted(output.id);
                
                // Determine handle color: green if executed during test, otherwise use default colors
                const getHandleColor = () => {
                    // If executed during test, use green (override default color)
                    if (wasExecuted) {
                        return 'green';
                    }
                    // Use default color from output config, or gray if not specified
                    return output.color || 'gray';
                };
                
                const handleColor = getHandleColor();
                const isGreen = handleColor === 'green' || (wasExecuted && output.color !== 'red');
                const isRed = handleColor === 'red' || (!wasExecuted && output.color === 'red');
                const isGray = handleColor === 'gray' || (!wasExecuted && !output.color);
                
                return (
                    <React.Fragment key={handleKey}>
                        {isConnected ? (
                            /* CONNECTED: Just a circle dot */
                            <>
                                <Handle 
                                    type="source" 
                                    position={Position.Right} 
                                    id={output.id}
                                    className={`!w-2.5 !h-2.5 !rounded-full !border-2 ${
                                        isGreen ? '!bg-emerald-400 !border-emerald-500' :
                                        isRed ? '!bg-rose-400 !border-rose-500' :
                                        '!bg-slate-300 !border-slate-400'
                                    }`}
                                    style={{ 
                                        left: 'calc(100%)',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                {output.label && (
                                    <span 
                                        className={`absolute text-xs font-medium whitespace-nowrap pointer-events-none ${
                                            isGreen ? 'text-emerald-500' :
                                            isRed ? 'text-rose-500' :
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
                                    className={`absolute w-4 h-0.5 pointer-events-none ${
                                        isGreen ? 'bg-emerald-400' : 'bg-slate-300'
                                    }`}
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
                                    className={`!w-2.5 !h-2.5 !rounded-full !border-2 ${
                                        isGreen ? '!bg-emerald-400 !border-emerald-500' :
                                        isRed ? '!bg-rose-400 !border-rose-500' :
                                        '!bg-slate-300 !border-slate-400'
                                    }`}
                                    style={{ 
                                        left: 'calc(100% )',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                
                                {/* Line from head to tail */}
                                <div 
                                    className={`absolute w-4 h-0.5 pointer-events-none ${
                                        isGreen ? 'bg-emerald-400' : 'bg-slate-300'
                                    }`}
                                    style={{ 
                                        left: 'calc(100% + 30px)',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                
                                {/* Handle TAIL - Square [+] (for quick-add and drag) */}
                                {/* Invisible Handle for ReactFlow connection - larger to catch drag events */}
                                <Handle 
                                    type="source" 
                                    position={Position.Right} 
                                    id={output.id}
                                    className="!w-5 !h-5 !bg-transparent !border-0 !opacity-0 !pointer-events-auto !cursor-crosshair !z-20"
                                    style={{ 
                                        left: 'calc(100% + 45px)',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                {/* Visible [+] button - positioned on top, clickable but allows drag through */}
                                <div
                                    onClick={(e) => {
                                        // Only trigger quick-add if it's a click (not a drag)
                                        // Check if mouse moved during mousedown/mouseup
                                        const wasClick = e.currentTarget.dataset.wasClick === 'true';
                                        if (wasClick) {
                                            e.stopPropagation();
                                            onQuickAdd?.(data.nodeId, output.id);
                                        }
                                        delete e.currentTarget.dataset.wasClick;
                                    }}
                                    onMouseDown={(e) => {
                                        // Mark as potential click
                                        e.currentTarget.dataset.wasClick = 'true';
                                        const startX = e.clientX;
                                        const startY = e.clientY;
                                        
                                        const handleMouseMove = (moveEvent) => {
                                            const distance = Math.sqrt(
                                                Math.pow(moveEvent.clientX - startX, 2) + 
                                                Math.pow(moveEvent.clientY - startY, 2)
                                            );
                                            // If mouse moved more than 5px, it's a drag, not a click
                                            if (distance > 5) {
                                                e.currentTarget.dataset.wasClick = 'false';
                                                // Disable pointer events to allow Handle to receive drag
                                                e.currentTarget.style.pointerEvents = 'none';
                                            }
                                            document.removeEventListener('mousemove', handleMouseMove);
                                        };
                                        
                                        const handleMouseUp = () => {
                                            document.removeEventListener('mousemove', handleMouseMove);
                                            document.removeEventListener('mouseup', handleMouseUp);
                                            // Re-enable pointer events after mouse up
                                            setTimeout(() => {
                                                if (e.currentTarget) {
                                                    e.currentTarget.style.pointerEvents = 'auto';
                                                }
                                            }, 100);
                                        };
                                        
                                        document.addEventListener('mousemove', handleMouseMove);
                                        document.addEventListener('mouseup', handleMouseUp);
                                    }}
                                    className={`absolute w-5 h-5 border-2 rounded-lg flex items-center justify-center text-xs font-bold shadow-card transition-colors cursor-crosshair ${
                                        isGreen ? 'bg-emerald-500 hover:bg-emerald-600 border-emerald-600 text-white' :
                                        isRed ? 'bg-rose-500 hover:bg-rose-600 border-rose-600 text-white' :
                                        'bg-slate-400 hover:bg-slate-500 border-slate-500 text-white'
                                    }`}
                                    style={{ 
                                        left: 'calc(100% + 45px)',
                                        top: `${topPercent}%`,
                                        transform: 'translateY(-50%)',
                                        pointerEvents: 'auto',
                                        zIndex: 10,
                                    }}
                                    title="Click to add next node or drag to connect"
                                >
                                    +
                                </div>
                                
                                {output.label && (
                                    <span 
                                        className={`absolute text-xs font-medium whitespace-nowrap pointer-events-none ${
                                            isGreen ? 'text-emerald-500' :
                                            isRed ? 'text-rose-500' :
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

// Switch Node Component - Vertical rectangle that grows with number of outputs
const SwitchNode = ({ data, nodeType, iconPath, color, handles, onQuickAdd, connectedHandles = [], selected, nodeHeight = 80, nodeOutputData = null, isTestingWorkflow = false }) => {
    const isRunning = data?.isRunning || false;
    const isCompleted = data?.isCompleted || false;
    const isError = data?.isError || false;
    const [iconError, setIconError] = useState(false);
    const nodeLabel = data?.customName || data?.label || nodeType;
    const fallbackInitial = nodeLabel?.trim()?.[0]?.toUpperCase() || nodeType?.[0]?.toUpperCase() || '?';
    
    // Resolve icon path
    const resolvedIconPath = getIconPath(iconPath);

    useEffect(() => {
        setIconError(false);
    }, [iconPath, nodeType]);
    
    // Check if an output handle was actually executed during test
    const isOutputExecuted = (outputId, outputIndex) => {
        if (!isTestingWorkflow || !nodeOutputData || !data?.nodeId) {
            return false;
        }
        
        const output = nodeOutputData;
        if (!output || output.matchedOutput === undefined) {
            return false;
        }
        
        // Check if this output was the one that matched
        if (outputId === 'fallback') {
            return output.matchedOutput === -1;
        } else {
            // Extract index from outputId (e.g., "output0" -> 0)
            const index = parseInt(outputId.replace('output', ''));
            return output.matchedOutput === index;
        }
    };

    const getBorderClass = () => {
        if (isError) return 'border-rose-500 ring-2 ring-rose-200';
        if (isCompleted) return 'border-emerald-500 ring-2 ring-emerald-200';
        if (selected) return 'border-blue-500 ring-2 ring-blue-200';
        return 'border-subtle';
    };

    // Calculate output positions evenly distributed vertically
    const outputCount = handles.outputs?.length || 0;
    const getOutputTopPercent = (index) => {
        if (outputCount === 0) return 50;
        if (outputCount === 1) return 50;
        // Distribute evenly from top to bottom (leaving some padding)
        const padding = 15; // Top and bottom padding percentage
        const availableSpace = 100 - (padding * 2);
        return padding + (index * (availableSpace / (outputCount - 1)));
    };

    return (
        <div 
            className={`bg-surface-elevated border-2 rounded-2xl p-3 w-20 shadow-card relative flex flex-col items-center justify-center group transition-all ${getBorderClass()}`}
            style={{ height: `${nodeHeight}px`, minHeight: '80px' }}
            title={data.customName || data.label || nodeType}
        >
            {/* Input handle */}
            {handles.input && (
                <Handle 
                    type="target" 
                    position={Position.Left} 
                    className="!bg-slate-300 !w-2.5 !h-2.5 !border-2 !border-slate-300"
                    style={{ top: '50%' }}
                />
            )}
            
            {/* Icon SVG */}
            <div className="w-10 h-10 flex items-center justify-center pointer-events-none relative mt-2">
                {!iconError ? (
                    <img 
                        src={resolvedIconPath} 
                        alt={nodeType}
                        className={`w-full h-full object-contain ${isRunning ? 'opacity-30' : ''}`}
                        onError={(e) => {
                            console.error('Failed to load icon:', resolvedIconPath, 'Error:', e);
                            setIconError(true);
                        }}
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-base font-semibold text-slate-500">
                        {fallbackInitial}
                    </div>
                )}
                {/* Loading icon overlay when running */}
                {isRunning && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <img 
                            src={getIconPath('/icons/nodes/node_active.svg')} 
                            alt="running"
                            className="w-8 h-8 animate-spin"
                            onError={(e) => console.error('Failed to load node_active icon:', e)}
                        />
                    </div>
                )}
            </div>
            
            {/* Node name label - Always visible */}
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-surface-elevated text-secondary text-xs px-3 py-1.5 rounded-lg border border-subtle shadow-card whitespace-nowrap pointer-events-none">
                {nodeLabel}
            </div>
            
            {/* Output handles - Evenly distributed vertically */}
            {handles.outputs && handles.outputs.map((output, index) => {
                const topPercent = getOutputTopPercent(index);
                const handleKey = output.id || 'default';
                const isConnected = connectedHandles.includes(handleKey);
                
                // Check if this output was executed during test
                const wasExecuted = isOutputExecuted(output.id, index);
                
                // Determine handle color: green if executed during test, otherwise gray/default
                const getHandleColor = () => {
                    // If executed during test, use green
                    if (wasExecuted) {
                        return 'green';
                    }
                    // Default: gray for inactive handles
                    return 'gray';
                };
                
                const handleColor = getHandleColor();
                const isGreen = handleColor === 'green';
                const isRed = output.color === 'red';
                
                return (
                    <React.Fragment key={handleKey}>
                        {isConnected ? (
                            <>
                                <Handle 
                                    type="source" 
                                    position={Position.Right} 
                                    id={output.id}
                                    className={`!w-2.5 !h-2.5 !rounded-full !border-2 ${
                                        isGreen ? '!bg-emerald-400 !border-emerald-500' :
                                        isRed ? '!bg-rose-400 !border-rose-500' :
                                        '!bg-slate-300 !border-slate-400'
                                    }`}
                                    style={{ 
                                        left: 'calc(100%)',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                {output.label && (
                                    <span 
                                        className={`absolute text-xs font-medium whitespace-nowrap pointer-events-none ${
                                            isGreen ? 'text-emerald-500' :
                                            isRed ? 'text-rose-500' :
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
                            <>
                                <div 
                                    className={`absolute w-4 h-0.5 pointer-events-none ${
                                        isGreen ? 'bg-emerald-400' : 'bg-slate-300'
                                    }`}
                                    style={{ 
                                        left: '100%',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                
                                <Handle 
                                    type="source" 
                                    position={Position.Right} 
                                    id={output.id}
                                    className={`!w-2.5 !h-2.5 !rounded-full !border-2 ${
                                        isGreen ? '!bg-emerald-400 !border-emerald-500' :
                                        isRed ? '!bg-rose-400 !border-rose-500' :
                                        '!bg-slate-300 !border-slate-400'
                                    }`}
                                    style={{ 
                                        left: 'calc(100% )',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                
                                <div 
                                    className={`absolute w-4 h-0.5 pointer-events-none ${
                                        isGreen ? 'bg-emerald-400' : 'bg-slate-300'
                                    }`}
                                    style={{ 
                                        left: 'calc(100% + 30px)',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                
                                <Handle 
                                    type="source" 
                                    position={Position.Right} 
                                    id={output.id}
                                    className="!w-5 !h-5 !bg-transparent !border-0 !opacity-0 !pointer-events-auto !cursor-crosshair !z-20"
                                    style={{ 
                                        left: 'calc(100% + 45px)',
                                        top: `${topPercent}%`,
                                    }}
                                />
                                <div
                                    onClick={(e) => {
                                        const wasClick = e.currentTarget.dataset.wasClick === 'true';
                                        if (wasClick) {
                                            e.stopPropagation();
                                            onQuickAdd?.(data.nodeId, output.id);
                                        }
                                        delete e.currentTarget.dataset.wasClick;
                                    }}
                                    onMouseDown={(e) => {
                                        e.currentTarget.dataset.wasClick = 'true';
                                        const startX = e.clientX;
                                        const startY = e.clientY;
                                        
                                        const handleMouseMove = (moveEvent) => {
                                            const distance = Math.sqrt(
                                                Math.pow(moveEvent.clientX - startX, 2) + 
                                                Math.pow(moveEvent.clientY - startY, 2)
                                            );
                                            if (distance > 5) {
                                                e.currentTarget.dataset.wasClick = 'false';
                                                e.currentTarget.style.pointerEvents = 'none';
                                            }
                                            document.removeEventListener('mousemove', handleMouseMove);
                                        };
                                        
                                        const handleMouseUp = () => {
                                            document.removeEventListener('mousemove', handleMouseMove);
                                            document.removeEventListener('mouseup', handleMouseUp);
                                            setTimeout(() => {
                                                if (e.currentTarget) {
                                                    e.currentTarget.style.pointerEvents = 'auto';
                                                }
                                            }, 100);
                                        };
                                        
                                        document.addEventListener('mousemove', handleMouseMove);
                                        document.addEventListener('mouseup', handleMouseUp);
                                    }}
                                    className={`absolute w-5 h-5 border-2 rounded-lg flex items-center justify-center text-xs font-bold shadow-card transition-colors cursor-crosshair ${
                                        isGreen ? 'bg-emerald-500 hover:bg-emerald-600 border-emerald-600 text-white' :
                                        isRed ? 'bg-rose-500 hover:bg-rose-600 border-rose-600 text-white' :
                                        'bg-slate-400 hover:bg-slate-500 border-slate-500 text-white'
                                    }`}
                                    style={{ 
                                        left: 'calc(100% + 45px)',
                                        top: `${topPercent}%`,
                                        transform: 'translateY(-50%)',
                                        pointerEvents: 'auto',
                                        zIndex: 10,
                                    }}
                                    title="Click to add next node or drag to connect"
                                >
                                    +
                                </div>
                                
                                {output.label && (
                                    <span 
                                        className={`absolute text-xs font-medium whitespace-nowrap pointer-events-none ${
                                            isGreen ? 'text-emerald-500' :
                                            isRed ? 'text-rose-500' :
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
            nodeOutputData={props.data.nodeOutputData}
            isTestingWorkflow={props.data.isTestingWorkflow}
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
            nodeOutputData={props.data.nodeOutputData}
            isTestingWorkflow={props.data.isTestingWorkflow}
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
            nodeOutputData={props.data.nodeOutputData}
            isTestingWorkflow={props.data.isTestingWorkflow}
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
            nodeOutputData={props.data.nodeOutputData}
            isTestingWorkflow={props.data.isTestingWorkflow}
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
            nodeOutputData={props.data.nodeOutputData}
            isTestingWorkflow={props.data.isTestingWorkflow}
        />
    ),
    openai: (props) => (
        <CompactNode 
            {...props} 
            nodeType="openai"
            iconPath="/icons/nodes/open_ai.svg"
            color="green"
            handles={{ input: true, outputs: [{ id: null }] }}
            onQuickAdd={props.data.onQuickAdd}
            connectedHandles={props.data.connectedHandles || []}
            selected={props.selected}
            nodeOutputData={props.data.nodeOutputData}
            isTestingWorkflow={props.data.isTestingWorkflow}
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
            nodeOutputData={props.data.nodeOutputData}
            isTestingWorkflow={props.data.isTestingWorkflow}
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
            nodeOutputData={props.data.nodeOutputData}
            isTestingWorkflow={props.data.isTestingWorkflow}
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
            nodeOutputData={props.data.nodeOutputData}
            isTestingWorkflow={props.data.isTestingWorkflow}
        />
    ),
    switch: (props) => {
        // Dynamic outputs based on rules
        const rules = props.data?.config?.rules || [];
        const outputs = rules.map((rule, index) => {
            const outputName = rule.outputName || `Output ${index + 1}`;
            return {
                id: `output${index}`,
                label: outputName,
                color: 'blue' // Default color - will be overridden by execution state
            };
        });
        // Add fallback output
        outputs.push({
            id: 'fallback',
            label: props.data?.config?.fallbackOutput || 'No Match',
            color: 'gray'
        });

        // Calculate height based on number of outputs
        // Base height: 80px, + 32px per output (min 2 outputs)
        const minHeight = 80;
        const outputCount = Math.max(outputs.length, 2);
        const calculatedHeight = minHeight + (outputCount - 2) * 32;
        const nodeHeight = Math.min(calculatedHeight, 400); // Max 400px

        return (
            <SwitchNode 
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
                nodeHeight={nodeHeight}
                nodeOutputData={props.data.nodeOutputData}
                isTestingWorkflow={props.data.isTestingWorkflow}
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
            nodeOutputData={props.data.nodeOutputData}
            isTestingWorkflow={props.data.isTestingWorkflow}
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
            nodeOutputData={props.data.nodeOutputData}
            isTestingWorkflow={props.data.isTestingWorkflow}
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
            nodeOutputData={props.data.nodeOutputData}
            isTestingWorkflow={props.data.isTestingWorkflow}
        />
    ),
    kling: (props) => (
        <CompactNode 
            {...props} 
            nodeType="kling"
            iconPath="/icons/nodes/kling-color.svg"
            color="cyan"
            handles={{ input: true, outputs: [{ id: null }] }}
            onQuickAdd={props.data.onQuickAdd}
            connectedHandles={props.data.connectedHandles || []}
            selected={props.selected}
            nodeOutputData={props.data.nodeOutputData}
            isTestingWorkflow={props.data.isTestingWorkflow}
        />
    ),
    convert: (props) => (
        <CompactNode 
            {...props} 
            nodeType="convert"
            iconPath="/icons/nodes/convert.svg"
            color="blue"
            handles={{ input: true, outputs: [{ id: null }] }}
            onQuickAdd={props.data.onQuickAdd}
            connectedHandles={props.data.connectedHandles || []}
            selected={props.selected}
            nodeOutputData={props.data.nodeOutputData}
            isTestingWorkflow={props.data.isTestingWorkflow}
        />
    ),
};

const ADD_NODE_OPTIONS = [
    { type: 'webhook', label: 'Webhook', iconPath: '/icons/nodes/webhook.svg' },
    { type: 'schedule', label: 'Schedule Trigger', iconPath: '/icons/nodes/schedule.svg' },
    { type: 'http', label: 'HTTP Request', iconPath: '/icons/nodes/http.svg' },
    { type: 'perplexity', label: 'Perplexity AI', iconPath: '/icons/nodes/perplexity.svg' },
    { type: 'claude', label: 'Claude AI', iconPath: '/icons/nodes/claude.svg' },
    { type: 'openai', label: 'OpenAI', iconPath: '/icons/nodes/open_ai.svg' },
    { type: 'gemini', label: 'Gemini AI', iconPath: '/icons/nodes/gemini.svg' },
    { type: 'convert', label: 'Convert', iconPath: '/icons/nodes/convert.svg' },
    { type: 'kling', label: 'Kling AI', iconPath: '/icons/nodes/kling-color.svg' },
    { type: 'code', label: 'Code', iconPath: '/icons/nodes/code.svg' },
    { type: 'escape', label: 'Escape & Set', iconPath: '/icons/nodes/escape.svg' },
    { type: 'if', label: 'If', iconPath: '/icons/nodes/if.svg' },
    { type: 'switch', label: 'Switch', iconPath: '/icons/nodes/switch.svg' },
    { type: 'googledocs', label: 'Google Docs', iconPath: '/icons/nodes/googledocs.svg' },
    { type: 'googlesheets', label: 'Google Sheets', iconPath: '/icons/nodes/googlesheets.svg' },
];


function WorkflowEditor() {
    const { id: legacyId, workflowId } = useParams();
    const id = workflowId || legacyId;
    const navigate = useNavigate();
    const location = useLocation();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    
    // Determine correct workflow base path based on current location
    const getWorkflowBasePath = () => {
        if (location.pathname.startsWith('/administrator/workflows')) {
            return '/administrator/workflows';
        } else if (location.pathname.startsWith('/admin/workflows')) {
            return '/admin/workflows';
        } else if (location.pathname.startsWith('/dashboard/workflows')) {
            return '/dashboard/workflows';
        }
        return '/workflows';
    };
    const workflowBasePath = getWorkflowBasePath();
    
    // Get back URL based on user role
    const getBackUrl = () => {
        if (currentUser.role === 'administrator') {
            return '/administrator/workflows';
        } else if (currentUser.role === 'admin') {
            return '/admin/workflows';
        }
        return '/dashboard/workflows/manage';
    };
    
    const [workflow, setWorkflow] = useState(null);
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    
    // Dynamic page title based on workflow name
    usePageTitle(workflow?.name || 'Workflow Editor');
    const [showNodeMenu, setShowNodeMenu] = useState(false);
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
    const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 }); // Track viewport để force re-render khi pan/zoom
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [isTestingWorkflow, setIsTestingWorkflow] = useState(false);
    const [runningNodes, setRunningNodes] = useState(new Set());
    const [completedNodes, setCompletedNodes] = useState(new Set());
    const [errorNodes, setErrorNodes] = useState(new Set());
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState('');
    const [testExecutionId, setTestExecutionId] = useState(null);
    const reactFlowWrapper = useRef(null);
    const [reactFlowInstance, setReactFlowInstance] = useState(null);
    const testPollingRef = useRef(null);
    const testExecutionIdRef = useRef(null); // Store in ref so cleanup can access it
    const workflowIdRef = useRef(null); // Store workflow ID in ref for cleanup
    const [connectionStartInfo, setConnectionStartInfo] = useState(null); // Lưu thông tin khi bắt đầu kéo handle
    const connectionMadeRef = useRef(false); // Track xem có kết nối thành công không

    useEffect(() => {
        fetchWorkflow();
    }, [id]);

    // Load copied execution data when switching to editor tab or when workflow is loaded
    useEffect(() => {
        if (activeTab === 'editor' && workflow?.id) {
            try {
                const copiedData = localStorage.getItem('copiedExecutionData');
                if (copiedData) {
                    const executionData = JSON.parse(copiedData);
                    
                    // Only load if it's for the current workflow
                    if (executionData.workflow_id && executionData.workflow_id.toString() === workflow.id.toString()) {
                        console.log('📋 Found copied execution data, loading into Editor:', executionData);
                        
                        // Convert node_results to nodeOutputData format
                        const outputData = {};
                        if (executionData.node_results) {
                            Object.entries(executionData.node_results).forEach(([nodeId, result]) => {
                                // Extract output from result
                                outputData[nodeId] = result.output || result;
                            });
                        }
                        
                        // Set node output data
                        setNodeOutputData(outputData);
                        
                        // Mark nodes as completed/error based on execution order
                        if (executionData.execution_order) {
                            const completedSet = new Set(executionData.execution_order);
                            setCompletedNodes(completedSet);
                            
                            // Mark error node if exists
                            if (executionData.error_node) {
                                setErrorNodes(new Set([executionData.error_node]));
                                completedSet.delete(executionData.error_node);
                            }
                        }
                        
                        // Show notification
                        console.log('✅ Loaded execution data into Editor. You can now test individual nodes.');
                        
                        // Clear the copied data after loading to avoid reloading on every tab switch
                        localStorage.removeItem('copiedExecutionData');
                    }
                }
            } catch (error) {
                console.error('Error loading copied execution data:', error);
            }
        }
    }, [activeTab, workflow?.id]);

    // Store testExecutionId and workflow.id in refs so cleanup can access them
    useEffect(() => {
        testExecutionIdRef.current = testExecutionId;
    }, [testExecutionId]);

    useEffect(() => {
        workflowIdRef.current = workflow?.id || id;
    }, [workflow?.id, id]);

    // Cleanup when component unmounts (e.g., page reload or navigation)
    useEffect(() => {
        return () => {
            // Clear polling interval
            if (testPollingRef.current) {
                console.log('🧹 Cleaning up test polling on unmount');
                clearInterval(testPollingRef.current);
                testPollingRef.current = null;
            }
            
            // Stop test listening on backend if active
            const currentTestId = testExecutionIdRef.current;
            const currentWorkflowId = workflowIdRef.current;
            
            if (currentTestId && currentWorkflowId) {
                console.log('🧹 Stopping test listener on backend:', {
                    testExecutionId: currentTestId,
                    workflowId: currentWorkflowId
                });
                
                // Use navigator.sendBeacon for reliable cleanup on page unload
                // This ensures the request is sent even if page is unloading
                if (navigator.sendBeacon) {
                    const url = `${window.location.origin}/api/workflows/${currentWorkflowId}/webhook-test-stop/${currentTestId}`;
                    const formData = new FormData();
                    navigator.sendBeacon(url, formData);
                } else {
                    // Fallback: use fetch with keepalive
                    fetch(`/api/workflows/${currentWorkflowId}/webhook-test-stop/${currentTestId}`, {
                        method: 'POST',
                        keepalive: true,
                    }).catch(error => {
                        console.error('Error stopping test listener on cleanup:', error);
                    });
                }
            }
        };
    }, []); // Empty deps - only run on mount/unmount

    // Custom wheel handler for Cmd/Ctrl + scroll = zoom
    useEffect(() => {
        const handleWheel = (e) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
            
            if (!ctrlOrCmd || !reactFlowInstance) {
                return;
            }
            
            e.preventDefault();
            const zoomSpeed = 0.002;
            
            try {
                // ReactFlow v11 API - use zoomTo or setViewport
                let currentZoom = 1;
                
                // Get current zoom
                if (reactFlowInstance.getViewport) {
                    const viewport = reactFlowInstance.getViewport();
                    currentZoom = viewport?.zoom || 1;
                } else if (reactFlowInstance.getZoom) {
                    currentZoom = reactFlowInstance.getZoom();
                }
                
                const newZoom = currentZoom - e.deltaY * zoomSpeed;
                const clampedZoom = Math.max(0.1, Math.min(newZoom, 4));
                
                // Set new zoom - ReactFlow v11 uses zoomTo or setViewport
                if (reactFlowInstance.zoomTo) {
                    reactFlowInstance.zoomTo(clampedZoom);
                } else if (reactFlowInstance.setViewport) {
                    const viewport = reactFlowInstance.getViewport ? reactFlowInstance.getViewport() : { x: 0, y: 0, zoom: currentZoom };
                    reactFlowInstance.setViewport({ ...viewport, zoom: clampedZoom }, { duration: 0 });
                } else if (reactFlowInstance.setZoom) {
                    // Fallback for older versions
                    reactFlowInstance.setZoom(clampedZoom);
                }
            } catch (error) {
                console.error('Error handling zoom:', error);
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
                
                // Dispatch event to refresh header stats
                window.dispatchEvent(new CustomEvent('workflow-created'));
                
                // Redirect to the newly created workflow (replace history to avoid back button issues)
                navigate(`${workflowBasePath}/${newWorkflowId}`, { replace: true });
                return;
            } catch (error) {
                console.error('Error auto-creating workflow:', error);
                
                // Check if it's a workflow limit error
                if (error.response?.status === 403 && error.response?.data?.error === 'workflow_limit_reached') {
                    const errorData = error.response.data;
                    const message = errorData.detail_message || errorData.message || 
                        `Số lượng workflows có thể tạo đã đến giới hạn của ${errorData.subscription_package_name || 'gói cước hiện tại'} - vui lòng liên hệ đội ngũ hỗ trợ để đổi gói cước`;
                    alert(message);
                } else {
                    alert('Lỗi khi tạo workflow mới');
                }
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
            // Xử lý xóa node trước khi apply changes
            changes.forEach((change) => {
                if (change.type === 'remove') {
                    const nodeId = change.id;
                    
                    // Tìm tất cả edges liên quan đến node này
                    const incomingEdges = edges.filter(edge => edge.target === nodeId);
                    const outgoingEdges = edges.filter(edge => edge.source === nodeId);
                    
                    // Kiểm tra xem node này có phải là intermediate node không
                    const isIntermediateNode = incomingEdges.length === 1 && outgoingEdges.length === 1;
                    
                    if (isIntermediateNode) {
                        const inputEdge = incomingEdges[0];
                        const outputEdge = outgoingEdges[0];
                        
                        // Tạo edge mới nối source của input edge với target của output edge
                        const reconnectedEdge = {
                            id: `edge-${Date.now()}`,
                            source: inputEdge.source,
                            target: outputEdge.target,
                            sourceHandle: inputEdge.sourceHandle,
                            targetHandle: outputEdge.targetHandle,
                        };
                        
                        // Xóa edges cũ và thêm edge mới
                        setEdges(prevEdges => {
                            const filtered = prevEdges.filter(edge => 
                                edge.source !== nodeId && edge.target !== nodeId
                            );
                            return [...filtered, reconnectedEdge];
                        });
                        
                        console.log('✅ Tự động nối lại 2 node bên cạnh sau khi xóa intermediate node');
                    } else {
                        // Nếu không phải intermediate node, chỉ xóa edges liên quan
                        setEdges(prevEdges => prevEdges.filter(edge => 
                            edge.source !== nodeId && edge.target !== nodeId
                        ));
                    }
                    
                    setSelectedNode(null);
                    setShowNodeContextMenu(false);
                }
            });
            
            setNodes((nds) => applyNodeChanges(changes, nds));
            // Mark as changed (position, selection, etc)
            setHasChanges(true);
            setSaved(false);
        },
        [edges]
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
            // Đánh dấu đã kết nối thành công
            connectionMadeRef.current = true;
        },
        []
    );

    // Callback khi bắt đầu kéo handle
    const onConnectStart = useCallback((event, { nodeId, handleId, handleType }) => {
        // Chỉ xử lý khi kéo từ output handle (source)
        if (handleType === 'source') {
            setConnectionStartInfo({
                sourceNodeId: nodeId,
                sourceHandle: handleId || null,
            });
            connectionMadeRef.current = false; // Reset flag
        }
    }, []);

    // Callback khi kết thúc kéo handle
    const onConnectEnd = useCallback((event) => {
        // Nếu không có kết nối thành công (thả ra ở vùng trống)
        if (!connectionMadeRef.current && connectionStartInfo) {
            const sourceNode = nodes.find(n => n.id === connectionStartInfo.sourceNodeId);
            if (sourceNode) {
                // Tính toán vị trí cho node mới (bên phải source node)
                const position = {
                    x: sourceNode.position.x + 150,
                    y: sourceNode.position.y,
                };

                // Mở sidebar với context
                setQuickAddContext({
                    sourceNodeId: connectionStartInfo.sourceNodeId,
                    sourceHandle: connectionStartInfo.sourceHandle,
                    position,
                });
                setShowNodeMenu(true);
            }
        }
        
        // Reset
        setConnectionStartInfo(null);
        connectionMadeRef.current = false;
    }, [connectionStartInfo, nodes]);

    const onEdgeMouseEnter = useCallback((event, edge) => {
        setHoveredEdge(edge);
        // Không cần lưu position nữa vì sẽ tính toán trong EdgeLabelRenderer
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
            console.error('Workflow not saved yet');
            return;
        }

        // Find trigger node (webhook or schedule)
        const webhookNode = nodes.find(n => n.type === 'webhook');
        const scheduleNode = nodes.find(n => n.type === 'schedule');
        const triggerNode = scheduleNode || webhookNode;

        // Reset states
        setIsTestingWorkflow(true);
        setRunningNodes(new Set());
        setCompletedNodes(new Set());
        setErrorNodes(new Set());
        setNodeOutputData({});
        
        // Stop previous test if any before starting new one
        if (testPollingRef.current) {
            clearInterval(testPollingRef.current);
            testPollingRef.current = null;
        }
        if (testExecutionIdRef.current && workflowIdRef.current) {
            // Stop previous test listener
            axios.post(`/workflows/${workflowIdRef.current}/webhook-test-stop/${testExecutionIdRef.current}`)
                .catch(error => console.error('Error stopping previous test:', error));
        }
        
        setTestExecutionId(null);
        testExecutionIdRef.current = null;

        // Clear previous polling
        if (testPollingRef.current) {
            clearInterval(testPollingRef.current);
        }

        // If has webhook node, wait for webhook
        if (webhookNode) {
            let webhookPath = webhookNode.data?.config?.path;
            if (!webhookPath) {
                console.error('Webhook node must have a path configured');
                setIsTestingWorkflow(false);
                return;
            }
            
            // Normalize path (remove leading/trailing slashes)
            webhookPath = webhookPath.trim().replace(/^\/+|\/+$/g, '');

            try {
                // Start listening for webhook
                const response = await axios.post(`/workflows/${workflow.id}/webhook-test-listen`, {
                    node_id: webhookNode.id,
                    path: webhookPath,
                    method: webhookNode.data?.config?.method || 'POST',
                });

                const testRunId = response.data.test_run_id;
                setTestExecutionId(testRunId);
                testExecutionIdRef.current = testRunId; // Store in ref for cleanup access

                console.log('✅ Test workflow started, waiting for webhook:', testRunId);
                console.log(`📝 Send a ${webhookNode.data?.config?.method || 'POST'} request to: ${window.location.origin}/api/webhook-test/${webhookPath}`);
                console.log(`📋 Test Run ID: ${testRunId}`);
                console.log(`📋 Listening for path: "${webhookPath}"`);

                // Poll for execution status
                testPollingRef.current = setInterval(async () => {
                    try {
                        const statusResponse = await axios.get(`/workflows/${workflow.id}/webhook-test-status/${testRunId}`);
                        
                        console.log('🔄 Polling status:', {
                            status: statusResponse.data.status,
                            message: statusResponse.data.message,
                            hasData: !!statusResponse.data.data
                        });
                        
                        if (statusResponse.data.status === 'received') {
                            // Webhook received, now execute workflow
                            clearInterval(testPollingRef.current);
                            const receivedData = statusResponse.data.data;
                            console.log('📥 Webhook received, data:', receivedData);
                            executeTestWorkflow(testRunId, receivedData);
                        } else if (statusResponse.data.status === 'timeout' || statusResponse.data.status === 'stopped') {
                            clearInterval(testPollingRef.current);
                            setIsTestingWorkflow(false);
                            // Stop webhook test on timeout/stopped
                            if (testRunId && workflow?.id) {
                                try {
                                    await axios.post(`/workflows/${workflow.id}/webhook-test-stop/${testRunId}`);
                                    console.log('🛑 Stopped webhook test listener after timeout/stopped');
                                } catch (error) {
                                    console.error('Error stopping webhook test:', error);
                                }
                            }
                            console.log('⏱️ Test timeout or stopped');
                        } else if (statusResponse.data.status === 'listening') {
                            // Still waiting - just log occasionally to avoid spam
                            if (Math.random() < 0.1) { // Log ~10% of polls
                                console.log('👂 Still listening for webhook...');
                            }
                        }
                    } catch (error) {
                        console.error('❌ Error polling test status:', error);
                        console.error('Error details:', {
                            message: error.message,
                            response: error.response?.data,
                            status: error.response?.status
                        });
                        clearInterval(testPollingRef.current);
                        setIsTestingWorkflow(false);
                        // Stop webhook test on polling error
                        if (testRunId && workflow?.id) {
                            try {
                                await axios.post(`/workflows/${workflow.id}/webhook-test-stop/${testRunId}`);
                                console.log('🛑 Stopped webhook test listener after polling error');
                            } catch (stopError) {
                                console.error('Error stopping webhook test:', stopError);
                            }
                        }
                    }
                }, 1000); // Poll every second

            } catch (error) {
                console.error('Error starting test:', error);
                setIsTestingWorkflow(false);
                // If testRunId was set before error, stop it
                if (testExecutionIdRef.current && workflow?.id) {
                    try {
                        await axios.post(`/workflows/${workflow.id}/webhook-test-stop/${testExecutionIdRef.current}`);
                        console.log('🛑 Stopped webhook test listener after start error');
                    } catch (stopError) {
                        console.error('Error stopping webhook test:', stopError);
                    }
                }
            }
        } else {
            // No webhook node - execute directly with empty webhook data
            // Backend will find starting node automatically
            try {
                console.log('🚀 Executing workflow without webhook trigger (will start from first node)');
                await executeTestWorkflow(null, {
                    method: 'POST',
                    headers: {},
                    body: {},
                    query: {},
                });
            } catch (error) {
                console.error('Error executing workflow:', error);
                setIsTestingWorkflow(false);
            }
        }
    };

    const executeTestWorkflow = async (testRunId, webhookData) => {
        // Helper function to stop webhook test
        const stopWebhookTest = async () => {
            if (testRunId && workflow?.id) {
                try {
                    await axios.post(`/workflows/${workflow.id}/webhook-test-stop/${testRunId}`);
                    console.log('🛑 Stopped webhook test listener after workflow completion');
                } catch (error) {
                    console.error('Error stopping webhook test:', error);
                }
            }
        };

        try {
            console.log('🚀 Executing test workflow with webhook data:', webhookData);
            
            // Reset states
            setRunningNodes(new Set());
            setCompletedNodes(new Set());
            setErrorNodes(new Set());
            setNodeOutputData({});
            
            // Ensure webhook data has required fields
            // If webhookData is null/undefined, use empty data (for workflows without webhook)
            // Include 'all' field if present (from handleTest), otherwise backend will create it
            const formattedWebhookData = webhookData ? {
                method: webhookData.method || 'POST',
                headers: webhookData.headers || {},
                body: webhookData.body || {},
                query: webhookData.query || {},
                ...(webhookData.all && { all: webhookData.all }), // Include 'all' if present
                ...(webhookData.url && { url: webhookData.url }), // Include 'url' if present
            } : {
                method: 'POST',
                headers: {},
                body: {},
                query: {},
            };
            
            console.log('📤 Sending to backend:', formattedWebhookData);
            
            // Call backend to execute workflow
            const response = await axios.post(`/workflows/${workflow.id}/test-execute`, {
                webhook_data: formattedWebhookData
            });
            
            console.log('📥 Backend response:', response.data);
            
            if (!response.data.success) {
                throw new Error(response.data.error || 'Failed to execute workflow');
            }
            
            const { node_results, execution_order, error_node, has_error } = response.data;
            
            console.log('✅ Workflow execution result:', {
                execution_order_count: execution_order?.length || 0,
                node_results_count: Object.keys(node_results || {}).length,
                error_node,
                has_error,
                execution_order: execution_order,
                node_results_keys: Object.keys(node_results || {})
            });
            
            // Check if execution_order is empty
            if (!execution_order || execution_order.length === 0) {
                console.warn('⚠️ Execution order is empty - no nodes to execute');
                setIsTestingWorkflow(false);
                // Stop webhook test if it was started
                await stopWebhookTest();
                console.log('ℹ️ Workflow has no executable nodes');
                return;
            }
            
            // Execute nodes one by one in order with visualization
            await executeNodesWithVisualization(execution_order, node_results, error_node, has_error, stopWebhookTest);
            
        } catch (error) {
            console.error('❌ Error executing test workflow:', error);
            console.error('❌ Error details:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
                stack: error.stack
            });
            setIsTestingWorkflow(false);
            
            // Stop webhook test on error
            await stopWebhookTest();
            
            // Show error in UI (optional - can be removed if you don't want alerts)
            // alert('Error executing workflow: ' + (error.response?.data?.error || error.message));
        }
    };

    const executeNodesWithVisualization = async (executionOrder, nodeResults, errorNode, hasError, stopWebhookTest) => {
        // Execute nodes one by one in the order they were executed
        for (let i = 0; i < executionOrder.length; i++) {
            const nodeId = executionOrder[i];
            const nodeResult = nodeResults[nodeId];
            
            if (!nodeResult) {
                console.warn('No result found for node:', nodeId);
                continue;
            }
            
            // Mark node as running
            setRunningNodes(prev => new Set([...prev, nodeId]));
            
            // Wait a bit to show running state (small delay for visualization)
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Check if this is the error node
            const isErrorNode = nodeId === errorNode;
            
            if (isErrorNode || nodeResult.status === 'error') {
                // Mark as error - stop execution
                setRunningNodes(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(nodeId);
                    return newSet;
                });
                
                setErrorNodes(prev => new Set([...prev, nodeId]));
                
                // Store error output
                setNodeOutputData(prev => ({
                    ...prev,
                    [nodeId]: nodeResult.output || { error: nodeResult.error_message || 'Unknown error' }
                }));
                
                setIsTestingWorkflow(false);
                const nodeName = nodes.find(n => n.id === nodeId)?.data?.customName || nodes.find(n => n.id === nodeId)?.data?.label || nodeId;
                console.error(`❌ Workflow stopped at node "${nodeName}" with error: ${nodeResult.error_message || 'Unknown error'}`);
                
                // Stop webhook test on error
                if (stopWebhookTest) {
                    await stopWebhookTest();
                }
                
                return; // Stop execution
            }
            
            // Node succeeded - mark as completed
            setRunningNodes(prev => {
                const newSet = new Set(prev);
                newSet.delete(nodeId);
                return newSet;
            });
            
            setCompletedNodes(prev => new Set([...prev, nodeId]));
            
            // Store output data for downstream nodes and UI display
            setNodeOutputData(prev => ({
                ...prev,
                [nodeId]: nodeResult.output || nodeResult
            }));
        }
        
        // All nodes completed successfully
        setIsTestingWorkflow(false);
        
        // Stop webhook test when workflow completes
        if (stopWebhookTest) {
            await stopWebhookTest();
        }
        
        if (!hasError) {
            console.log('✅ Test workflow completed successfully!');
        }
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
        
        // Nếu có edge context (click vào nút + ở giữa edge) - chèn node vào giữa edge
        if (quickAddContext && quickAddContext.edge) {
            handleAddIntermediateNode(quickAddContext.edge, type);
            setShowNodeMenu(false);
            setQuickAddContext(null);
            setHoveredEdge(null);
            return;
        }
        
        // Nếu có context từ kéo handle - tạo node và tự động nối edge
        if (quickAddContext && quickAddContext.sourceNodeId) {
            addNode(
                type,
                label,
                quickAddContext.position,
                quickAddContext.sourceNodeId,
                quickAddContext.sourceHandle
            );
        } else {
            // Không có context - chỉ tạo node mới
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
        if (!selectedNode) return;

        const nodeId = selectedNode.id;
        
        // Tìm tất cả edges liên quan đến node này
        const incomingEdges = edges.filter(edge => edge.target === nodeId);
        const outgoingEdges = edges.filter(edge => edge.source === nodeId);
        
        // Kiểm tra xem node này có phải là intermediate node không
        // (có đúng 1 input và 1 output edge)
        const isIntermediateNode = incomingEdges.length === 1 && outgoingEdges.length === 1;
        
        let newEdges = edges.filter(edge => 
            edge.source !== nodeId && edge.target !== nodeId
        );
        
        // Nếu là intermediate node, tự động nối lại 2 node bên cạnh
        if (isIntermediateNode) {
            const inputEdge = incomingEdges[0];
            const outputEdge = outgoingEdges[0];
            
            // Tạo edge mới nối source của input edge với target của output edge
            const reconnectedEdge = {
                id: `edge-${Date.now()}`,
                source: inputEdge.source,
                target: outputEdge.target,
                sourceHandle: inputEdge.sourceHandle, // Giữ nguyên sourceHandle từ input edge
                targetHandle: outputEdge.targetHandle, // Giữ nguyên targetHandle từ output edge
            };
            
            newEdges.push(reconnectedEdge);
            console.log('✅ Tự động nối lại 2 node bên cạnh sau khi xóa intermediate node');
        }
        
        // Xóa node và cập nhật edges
        setNodes(nodes.filter(node => node.id !== nodeId));
        setEdges(newEdges);
        setSelectedNode(null);
        setShowNodeContextMenu(false);
        setHasChanges(true);
        setSaved(false);
    };

    // Copy selected nodes
    const handleCopyNodes = () => {
        // Get all selected nodes (ReactFlow supports multi-select)
        const selectedNodes = nodes.filter(n => n.selected);
        
        let nodesToCopy = [];
        if (selectedNodes.length === 0 && selectedNode) {
            // If no multi-selection, copy the currently selected node
            nodesToCopy = [selectedNode];
            console.log('✂️ Copied 1 node:', selectedNode.data.customName || selectedNode.data.label);
        } else if (selectedNodes.length > 0) {
            nodesToCopy = selectedNodes;
            console.log('✂️ Copied', selectedNodes.length, 'nodes:', selectedNodes.map(n => n.data.customName || n.data.label));
        }
        
        if (nodesToCopy.length > 0) {
            // Save to state
            setCopiedNodes(nodesToCopy);
            
            // Also copy edges that connect between copied nodes
            const copiedNodeIds = nodesToCopy.map(n => n.id);
            const copiedEdges = edges.filter(edge => 
                copiedNodeIds.includes(edge.source) && copiedNodeIds.includes(edge.target)
            );
            
            // Also save to localStorage for cross-workflow paste
            try {
                localStorage.setItem('copiedWorkflowNodes', JSON.stringify(nodesToCopy));
                localStorage.setItem('copiedWorkflowEdges', JSON.stringify(copiedEdges));
                console.log('💾 Saved to localStorage for cross-workflow paste:', nodesToCopy.length, 'nodes,', copiedEdges.length, 'edges');
            } catch (error) {
                console.warn('Failed to save to localStorage:', error);
            }
        }
    };

    // Paste copied nodes
    const handlePasteNodes = () => {
        // Try to get from state first, then from localStorage
        let nodesToPaste = copiedNodes;
        
        if (nodesToPaste.length === 0) {
            try {
                const stored = localStorage.getItem('copiedWorkflowNodes');
                if (stored) {
                    nodesToPaste = JSON.parse(stored);
                    setCopiedNodes(nodesToPaste); // Update state
                    console.log('📋 Loaded from localStorage:', nodesToPaste.length, 'nodes');
                }
            } catch (error) {
                console.warn('Failed to load from localStorage:', error);
            }
        }
        
        if (nodesToPaste.length === 0) {
            console.log('⚠️ No nodes to paste');
            return;
        }

        const timestamp = Date.now();
        const offset = { x: 50, y: 50 }; // Paste offset
        const idMap = {}; // Old ID → New ID mapping
        const newNodes = [];
        const newEdges = [];

        // Get existing names for auto-numbering
        const existingNames = nodes.map(n => n.data.customName || n.data.label).filter(Boolean);

        // Step 1: Create new nodes with unique names
        nodesToPaste.forEach((copiedNode, index) => {
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
        const copiedNodeIds = nodesToPaste.map(n => n.id);
        
        // Try to get edges from localStorage first (for cross-workflow paste)
        let edgesToCopy = [];
        try {
            const storedEdges = localStorage.getItem('copiedWorkflowEdges');
            if (storedEdges) {
                edgesToCopy = JSON.parse(storedEdges);
            }
        } catch (error) {
            console.warn('Failed to load edges from localStorage:', error);
        }
        
        // If no stored edges, get from current workflow edges
        if (edgesToCopy.length === 0) {
            edgesToCopy = edges.filter(edge => 
                copiedNodeIds.includes(edge.source) && copiedNodeIds.includes(edge.target)
            );
        }
        
        // Map edges to new node IDs
        edgesToCopy.forEach(edge => {
            // Only copy if both source and target are in the copied nodes
            if (idMap[edge.source] && idMap[edge.target]) {
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

        if (node.type === 'webhook' || node.type === 'schedule' || node.type === 'http' || node.type === 'perplexity' || node.type === 'claude' || node.type === 'openai' || node.type === 'gemini' || node.type === 'kling' || node.type === 'convert' || node.type === 'code' || node.type === 'escape' || node.type === 'if' || node.type === 'switch' || node.type === 'googledocs' || node.type === 'googlesheets') {
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
    const handleTestConvertNode = async (config) => {
        console.log('Testing Convert with config:', config);
        return await callTestNodeAPI('convert', config);
    };


    // Test OpenAI node (via backend API)
    const handleTestOpenAINode = async (config) => {
        console.log('Testing OpenAI with config:', config);
        return await callTestNodeAPI('openai', config);
    };

    // Test Gemini node (via backend API)
    const handleTestGeminiNode = async (config) => {
        console.log('Testing Gemini with config:', config);
        return await callTestNodeAPI('gemini', config);
    };
    const handleTestKlingNode = async (config) => {
        console.log('Testing Kling with config:', config);
        return await callTestNodeAPI('kling', config);
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
                            <span></span>
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
                        setHoveredEdge(null);
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
                                <h3 className="text-base font-semibold text-primary mt-1">
                                    {quickAddContext?.edge ? 'Chèn node vào giữa' : 'Thêm node mới'}
                                </h3>
                            </div>
                            <button
                                onClick={() => {
                                    setShowNodeMenu(false);
                                    setQuickAddContext(null);
                                    setHoveredEdge(null);
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
                                {quickAddContext?.edge 
                                    ? 'Chọn loại node để chèn vào giữa 2 node. Sidebar sẽ tự đóng sau khi bạn chọn.'
                                    : 'Chọn loại node để chèn vào workflow. Sidebar sẽ tự đóng sau khi bạn chọn.'}
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto px-3 py-4 pr-2 space-y-1">
                            {ADD_NODE_OPTIONS.map((option) => (
                                <button
                                    key={option.type}
                                    onClick={() => handleAddNodeFromSidebar(option.type)}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-medium text-secondary hover:text-primary hover:bg-surface-muted transition-colors"
                                >
                                    {option.iconPath ? (
                                        <img 
                                            src={option.iconPath} 
                                            alt={option.label}
                                            className="w-5 h-5 flex-shrink-0"
                                        />
                                    ) : (
                                        <span className="text-lg leading-none">{option.icon}</span>
                                    )}
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
                    onMove={(event, viewport) => {
                        // Update viewport để force re-render EdgeLabelRenderer khi pan/zoom
                        setViewport(viewport);
                    }}
                    nodes={nodes.map(node => ({
                        ...node,
                        data: {
                            ...node.data,
                            nodeOutputData: nodeOutputData[node.id] || null,
                            isTestingWorkflow: isTestingWorkflow,
                        }
                    })).map(node => {
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
                                isError: errorNodes.has(node.id),
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
                    onConnectStart={onConnectStart}
                    onConnectEnd={onConnectEnd}
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
                    
                    {/* Edge Controls - Rendered as part of canvas */}
                    <EdgeLabelRenderer>
                        {edges.map((edge) => {
                            const sourceNode = nodes.find(n => n.id === edge.source);
                            const targetNode = nodes.find(n => n.id === edge.target);
                            
                            if (!sourceNode || !targetNode || !reactFlowInstance) return null;
                            
                            // Tính toán vị trí source và target handles từ node position
                            // Source handle ở bên phải node, target handle ở bên trái node
                            const sourceHandleX = sourceNode.position.x + (sourceNode.width || 150);
                            const sourceHandleY = sourceNode.position.y + (sourceNode.height || 40) / 2;
                            const targetHandleX = targetNode.position.x;
                            const targetHandleY = targetNode.position.y + (targetNode.height || 40) / 2;
                            
                            // Sử dụng getBezierPath để tính toán điểm giữa trên bezier curve
                            try {
                                const bezierPathResult = getBezierPath({
                                    sourceX: sourceHandleX,
                                    sourceY: sourceHandleY,
                                    targetX: targetHandleX,
                                    targetY: targetHandleY,
                                    sourcePosition: Position.Right,
                                    targetPosition: Position.Left,
                                });
                                
                                // getBezierPath trả về [path, labelX, labelY]
                                let labelX, labelY;
                                if (Array.isArray(bezierPathResult) && bezierPathResult.length >= 3) {
                                    [, labelX, labelY] = bezierPathResult;
                                } else {
                                    // Fallback: tính điểm giữa đơn giản
                                    labelX = (sourceHandleX + targetHandleX) / 2;
                                    labelY = (sourceHandleY + targetHandleY) / 2;
                                }
                                
                                // EdgeLabelRenderer đã tự transform theo viewport, sử dụng flow coordinates trực tiếp
                                // ReactFlow transform: screenX = (flowX - viewport.x) * viewport.zoom
                                // EdgeLabelRenderer đã apply transform này, nên chỉ cần dùng flow coordinates
                                const screenX = labelX;
                                const screenY = labelY;
                                
                                const isHovered = hoveredEdge && hoveredEdge.id === edge.id;
                                
                                return (
                                    <div
                                        key={edge.id}
                                        className="flex items-center gap-2 transition-opacity duration-200"
                                        style={{
                                            position: 'absolute',
                                            left: screenX,
                                            top: screenY,
                                            transform: 'translate(-50%, -50%)',
                                            pointerEvents: isHovered ? 'all' : 'none',
                                            opacity: isHovered ? 1 : 0,
                                            zIndex: 1000,
                                        }}
                                        onMouseEnter={() => setHoveredEdge(edge)}
                                        onMouseLeave={(e) => {
                                            // Chỉ ẩn nếu không di chuyển vào các buttons
                                            if (!e.currentTarget.contains(e.relatedTarget)) {
                                                setHoveredEdge(null);
                                            }
                                        }}
                                    >
                                        {/* Add intermediate node button */}
                                        <button
                                            onMouseDown={(e) => {
                                                // Chỉ stopPropagation khi click, không block pan
                                                if (!isSpacePressed) {
                                                    e.stopPropagation();
                                                }
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // Lưu edge vào context và mở sidebar
                                                setQuickAddContext({
                                                    edge: edge,
                                                });
                                                setShowNodeMenu(true);
                                                setHoveredEdge(null);
                                            }}
                                            className="w-8 h-8 bg-surface-elevated border border-subtle rounded-xl flex items-center justify-center text-primary hover:bg-surface-muted shadow-card transition-colors"
                                            title="Chèn node vào giữa"
                                            onMouseEnter={() => setHoveredEdge(edge)}
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                        </button>

                                        {/* Delete edge button */}
                                        <button
                                            onMouseDown={(e) => {
                                                // Chỉ stopPropagation khi click, không block pan
                                                if (!isSpacePressed) {
                                                    e.stopPropagation();
                                                }
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteEdge(edge);
                                            }}
                                            className="w-8 h-8 bg-surface-elevated border border-subtle rounded-xl flex items-center justify-center text-rose-500 hover:bg-rose-50 shadow-card transition-colors"
                                            title="Delete connection"
                                            onMouseEnter={() => setHoveredEdge(edge)}
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                );
                            } catch (error) {
                                console.error('Error calculating bezier path:', error);
                                return null;
                            }
                        })}
                    </EdgeLabelRenderer>
                </ReactFlow>

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

                {showConfigModal && selectedNode && selectedNode.type === 'openai' && (
                    <OpenAIConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestOpenAINode}
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

                {showConfigModal && selectedNode && selectedNode.type === 'kling' && (
                    <KlingConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestKlingNode}
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
                {showConfigModal && selectedNode && selectedNode.type === 'convert' && (
                    <ConvertConfigModal
                        node={selectedNode}
                        onSave={handleSaveConfig}
                        onClose={() => setShowConfigModal(false)}
                        onTest={handleTestConvertNode}
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
                    <WorkflowHistory onCopyToEditor={() => setActiveTab('editor')} />
                )}
            </div>
        </div>
    );
}

export default WorkflowEditor;

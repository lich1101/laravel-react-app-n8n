import React, { useState, useEffect, useRef } from 'react';
import axios from '../config/axios';
import CredentialModal from './CredentialModal';
import ExpandableTextarea from './ExpandableTextarea';
import { useConfigModal } from '../utils/hooks/useConfigModal';
import ConfigModalLayout from './common/ConfigModalLayout';
import TestResultViewer from './common/TestResultViewer';

function KlingConfigModal({ node, onSave, onClose, onTest, inputData, outputData, onTestResult, allEdges, allNodes, onRename, readOnly = false }) {
    const [activeTab, setActiveTab] = useState('parameters'); // 'schema', 'json', 'parameters'
    const [config, setConfig] = useState({
        operation: 'textToVideo',
        // Text to Video
        prompt: '',
        negativePrompt: '',
        modelName: 'kling-v1',
        cfgScale: 0.5,
        mode: 'std',
        duration: '5',
        aspectRatio: '16:9',
        // Image to Video
        image: '',
        images: [],
        tailImage: '',
        // Video operations
        videoUrl: '',
        targetDuration: 10,
        // Audio operations
        audio: '',
        audioUrl: '',
        // TTS
        text: '',
        voice: 'default',
        language: 'en',
        // Image Generation
        n: 1,
        imageCount: 1,
        // Image Expand
        expandDirection: 'all',
        expandRatio: 1.5,
        // Video Effects
        effectType: 'enhance',
        effectParams: '{}',
        // Functionality Try
        functionality: '',
        parameters: '{}',
        // Credential
        credentialId: null,
        timeout: 120,
    });

    const operations = [
        { value: 'textToVideo', label: 'Text to Video' },
        { value: 'imageToVideo', label: 'Image to Video' },
        { value: 'multiImageToVideo', label: 'Multi Image to Video' },
        { value: 'multimodalToVideo', label: 'Multimodal to Video' },
        { value: 'videoDuration', label: 'Video Duration' },
        { value: 'avatar', label: 'Avatar' },
        { value: 'videoToLip', label: 'Video to Lip Sync' },
        { value: 'videoEffects', label: 'Video Effects' },
        { value: 'textToAudio', label: 'Text to Audio' },
        { value: 'videoToAudio', label: 'Video to Audio' },
        { value: 'tts', label: 'Text to Speech (TTS)' },
        { value: 'imageGeneration', label: 'Image Generation' },
        { value: 'multiImageToImage', label: 'Multi Image to Image' },
        { value: 'imageExpand', label: 'Image Expand' },
        { value: 'imageRecognize', label: 'Image Recognize' },
        { value: 'skillsMap', label: 'Skills Map' },
        { value: 'functionalityTry', label: 'Functionality Try' },
    ];

    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const testAbortControllerRef = useRef(null);
    const [credentials, setCredentials] = useState([]);
    const [showCredentialModal, setShowCredentialModal] = useState(false);

    const {
        inputViewMode,
        outputViewMode,
        collapsedPaths,
        displayOutput,
        setInputViewMode,
        setOutputViewMode,
        togglePathCollapse,
        handleSave: handleSaveCommon,
        handleClose: handleCloseCommon,
    } = useConfigModal({
        onTest: null,
        onSave: () => onSave(config),
        onClose: () => {
            if (isTesting && testAbortControllerRef.current) {
                handleStopTest();
            }
            onSave(config);
            onClose();
        },
        onTestResult,
        node,
        config,
        inputData,
        outputData: testResults || outputData,
        readOnly
    });

    useEffect(() => {
        if (node?.data?.config) {
            setConfig(prev => ({
                ...prev,
                ...node.data.config,
            }));
        }
        fetchCredentials();
    }, [node]);

    // Auto-init images array for multiImageToVideo and multiImageToImage
    useEffect(() => {
        if ((config.operation === 'multiImageToVideo' || config.operation === 'multiImageToImage') && (!config.images || config.images.length === 0)) {
            setConfig(prev => ({ ...prev, images: ['', ''] })); // Init with 2 empty images
        }
    }, [config.operation]);

    const fetchCredentials = async () => {
        try {
            const response = await axios.get('/credentials', { params: { type: 'kling' } });
            setCredentials(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Error fetching credentials:', error);
        }
    };

    const handleCredentialSaved = (newCredential) => {
        setCredentials(prev => [...prev, newCredential]);
        setConfig(prev => ({ ...prev, credentialId: newCredential.id }));
        setShowCredentialModal(false);
    };

    const handleTest = async () => {
        setIsTesting(true);
        setTestResults(null);
        testAbortControllerRef.current = new AbortController();

        try {
            const result = await onTest(config);
            setTestResults(result);
            if (onTestResult && node?.id) {
                onTestResult(node.id, result);
            }
        } catch (error) {
            const errorResult = {
                error: true,
                message: error.response?.data?.message || error.message || 'Test failed'
            };
            setTestResults(errorResult);
            if (onTestResult && node?.id) {
                onTestResult(node.id, errorResult);
            }
        } finally {
            setIsTesting(false);
            testAbortControllerRef.current = null;
        }
    };

    const handleStopTest = () => {
        if (testAbortControllerRef.current) {
            testAbortControllerRef.current.abort();
            testAbortControllerRef.current = null;
            setIsTesting(false);
            setTestResults({
                error: true,
                message: 'Test was cancelled by user'
            });
        }
    };

    // Test buttons
    const testButtons = onTest && !readOnly ? (
        <>
            {isTesting ? (
                <button
                    onClick={handleStopTest}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm font-medium flex items-center space-x-2"
                >
                    <span>■</span>
                    <span>Stop step</span>
                </button>
            ) : (
                <button
                    onClick={handleTest}
                    disabled={!config.credentialId}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium flex items-center space-x-2"
                >
                    <span>▲</span>
                    <span>Test step</span>
                </button>
            )}
        </>
    ) : null;

    // Custom handleClose that stops test before closing
    const handleClose = () => {
        if (isTesting && testAbortControllerRef.current) {
            handleStopTest();
        }
        onSave(config);
        onClose();
    };

    // Update displayOutput when testResults change
    const currentDisplayOutput = testResults || outputData || displayOutput;

    const renderConfigForm = () => {
        return (
            <div className="space-y-4">
                {/* Operation Selection */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Operation *
                    </label>
                    <select
                        value={config.operation}
                        onChange={(e) => setConfig({ ...config, operation: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                        disabled={readOnly}
                    >
                        {operations.map(op => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                    </select>
                </div>

                {/* Credential Selection */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Kling API Credential *
                    </label>
                    <div className="flex space-x-2">
                        <select
                            value={config.credentialId || ''}
                            onChange={(e) => setConfig({ ...config, credentialId: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                            disabled={readOnly}
                        >
                            <option value="">Select a credential</option>
                            {credentials.map(cred => (
                                <option key={cred.id} value={cred.id}>{cred.name}</option>
                            ))}
                        </select>
                        {!readOnly && (
                            <button
                                type="button"
                                onClick={() => setShowCredentialModal(true)}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium whitespace-nowrap"
                            >
                                + New
                            </button>
                        )}
                    </div>
                </div>

                {/* Operation-specific fields */}
                {(config.operation === 'textToVideo' || config.operation === 'imageToVideo' || config.operation === 'multimodalToVideo') && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Prompt *
                            </label>
                            <ExpandableTextarea
                                value={config.prompt}
                                onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
                                placeholder="Enter your prompt..."
                                disabled={readOnly}
                                inputData={inputData}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Negative Prompt
                            </label>
                            <ExpandableTextarea
                                value={config.negativePrompt}
                                onChange={(e) => setConfig({ ...config, negativePrompt: e.target.value })}
                                placeholder="What to avoid..."
                                disabled={readOnly}
                                inputData={inputData}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Model *
                                </label>
                                <select
                                    value={config.modelName}
                                    onChange={(e) => setConfig({ ...config, modelName: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    disabled={readOnly}
                                >
                                    {config.operation === 'textToVideo' || config.operation === 'imageToVideo' || config.operation === 'multiImageToVideo' || config.operation === 'multimodalToVideo' ? (
                                        <>
                                            <option value="kling-v1">Kling v1</option>
                                            <option value="kling-v1-5">Kling v1.5 (Pro)</option>
                                        </>
                                    ) : config.operation === 'avatar' ? (
                                        <option value="kling-avatar-v1">Kling Avatar v1</option>
                                    ) : config.operation === 'imageGeneration' ? (
                                        <>
                                            <option value="kling-image-v1">Kling Image v1</option>
                                            <option value="kling-image-v1-5">Kling Image v1.5</option>
                                        </>
                                    ) : (
                                        <option value="kling-v1">Kling v1</option>
                                    )}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Duration
                                </label>
                                <select
                                    value={config.duration}
                                    onChange={(e) => setConfig({ ...config, duration: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    disabled={readOnly}
                                >
                                    <option value="5">5 seconds</option>
                                    <option value="10">10 seconds</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    CFG Scale
                                </label>
                                <input
                                    type="number"
                                    value={config.cfgScale}
                                    onChange={(e) => setConfig({ ...config, cfgScale: parseFloat(e.target.value) })}
                                    step="0.1"
                                    min="0"
                                    max="1"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    disabled={readOnly}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Mode
                                </label>
                                <select
                                    value={config.mode}
                                    onChange={(e) => setConfig({ ...config, mode: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    disabled={readOnly}
                                >
                                    <option value="std">Standard</option>
                                    <option value="pro">Pro</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Aspect Ratio
                            </label>
                            <select
                                value={config.aspectRatio}
                                onChange={(e) => setConfig({ ...config, aspectRatio: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                disabled={readOnly}
                            >
                                <option value="16:9">16:9 (Landscape)</option>
                                <option value="9:16">9:16 (Portrait)</option>
                                <option value="1:1">1:1 (Square)</option>
                                <option value="4:3">4:3</option>
                                <option value="3:4">3:4</option>
                                <option value="21:9">21:9 (Ultrawide)</option>
                                <option value="9:21">9:21</option>
                            </select>
                        </div>
                    </>
                )}

                {config.operation === 'multiImageToVideo' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Image URLs * (2-5 images)
                        </label>
                        {(config.images || []).map((img, index) => (
                            <div key={index} className="flex gap-2 mb-2">
                                <ExpandableTextarea
                                    value={img}
                                    onChange={(e) => {
                                        const newImages = [...(config.images || [])];
                                        newImages[index] = e.target.value;
                                        setConfig({ ...config, images: newImages });
                                    }}
                                    placeholder={`Image ${index + 1} URL or use {{NodeName.field}}`}
                                    disabled={readOnly}
                                    inputData={inputData}
                                />
                                {!readOnly && config.images.length > 2 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const newImages = config.images.filter((_, i) => i !== index);
                                            setConfig({ ...config, images: newImages });
                                        }}
                                        className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md text-sm"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        ))}
                        {!readOnly && (config.images || []).length < 5 && (
                            <button
                                type="button"
                                onClick={() => {
                                    const newImages = [...(config.images || []), ''];
                                    setConfig({ ...config, images: newImages });
                                }}
                                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
                            >
                                + Add Image
                            </button>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                            Minimum 2 images, maximum 5 images
                        </p>
                    </div>
                )}

                {(config.operation === 'imageToVideo' || config.operation === 'multimodalToVideo' || config.operation === 'avatar') && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Image URL *
                        </label>
                        <ExpandableTextarea
                            value={config.image}
                            onChange={(e) => setConfig({ ...config, image: e.target.value })}
                            placeholder="https://example.com/image.jpg or use {{NodeName.field}}"
                            disabled={readOnly}
                            inputData={inputData}
                        />
                    </div>
                )}

                {config.operation === 'multimodalToVideo' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Tail Image URL
                        </label>
                        <ExpandableTextarea
                            value={config.tailImage}
                            onChange={(e) => setConfig({ ...config, tailImage: e.target.value })}
                            placeholder="https://example.com/tail-image.jpg or use {{NodeName.field}}"
                            disabled={readOnly}
                            inputData={inputData}
                        />
                    </div>
                )}

                {(config.operation === 'videoDuration' || config.operation === 'videoToLip' || config.operation === 'videoToAudio' || config.operation === 'videoEffects') && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Video URL *
                        </label>
                        <ExpandableTextarea
                            value={config.videoUrl}
                            onChange={(e) => setConfig({ ...config, videoUrl: e.target.value })}
                            placeholder="https://example.com/video.mp4 or use {{NodeName.field}}"
                            disabled={readOnly}
                            inputData={inputData}
                        />
                    </div>
                )}

                {(config.operation === 'avatar' || config.operation === 'videoToLip') && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Audio URL *
                        </label>
                        <ExpandableTextarea
                            value={config.audioUrl}
                            onChange={(e) => setConfig({ ...config, audioUrl: e.target.value })}
                            placeholder="https://example.com/audio.mp3 or use {{NodeName.field}}"
                            disabled={readOnly}
                            inputData={inputData}
                        />
                    </div>
                )}

                {config.operation === 'tts' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Text *
                            </label>
                            <ExpandableTextarea
                                value={config.text}
                                onChange={(e) => setConfig({ ...config, text: e.target.value })}
                                placeholder="Enter text to convert to speech..."
                                disabled={readOnly}
                                inputData={inputData}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Voice
                                </label>
                                <input
                                    type="text"
                                    value={config.voice}
                                    onChange={(e) => setConfig({ ...config, voice: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    disabled={readOnly}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Language
                                </label>
                                <select
                                    value={config.language}
                                    onChange={(e) => setConfig({ ...config, language: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    disabled={readOnly}
                                >
                                    <option value="en">English</option>
                                    <option value="zh">Chinese</option>
                                    <option value="vi">Vietnamese</option>
                                </select>
                            </div>
                        </div>
                    </>
                )}

                {config.operation === 'imageGeneration' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Prompt *
                            </label>
                            <ExpandableTextarea
                                value={config.prompt}
                                onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
                                placeholder="Describe the image you want to generate..."
                                disabled={readOnly}
                                inputData={inputData}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Aspect Ratio
                                </label>
                                <select
                                    value={config.aspectRatio}
                                    onChange={(e) => setConfig({ ...config, aspectRatio: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    disabled={readOnly}
                                >
                                    <option value="1:1">1:1 (Square)</option>
                                    <option value="16:9">16:9 (Landscape)</option>
                                    <option value="9:16">9:16 (Portrait)</option>
                                    <option value="4:3">4:3</option>
                                    <option value="3:4">3:4</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Number of Images
                                </label>
                                <input
                                    type="number"
                                    value={config.imageCount}
                                    onChange={(e) => setConfig({ ...config, imageCount: parseInt(e.target.value) })}
                                    min="1"
                                    max="4"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    disabled={readOnly}
                                />
                            </div>
                        </div>
                    </>
                )}

                {config.operation === 'multiImageToImage' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Image URLs * (2-5 images)
                            </label>
                            {(config.images || []).map((img, index) => (
                                <div key={index} className="flex gap-2 mb-2">
                                    <ExpandableTextarea
                                        value={img}
                                        onChange={(e) => {
                                            const newImages = [...(config.images || [])];
                                            newImages[index] = e.target.value;
                                            setConfig({ ...config, images: newImages });
                                        }}
                                        placeholder={`Image ${index + 1} URL or use {{NodeName.field}}`}
                                        disabled={readOnly}
                                        inputData={inputData}
                                    />
                                    {!readOnly && config.images.length > 2 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const newImages = config.images.filter((_, i) => i !== index);
                                                setConfig({ ...config, images: newImages });
                                            }}
                                            className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md text-sm"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            ))}
                            {!readOnly && (config.images || []).length < 5 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const newImages = [...(config.images || []), ''];
                                        setConfig({ ...config, images: newImages });
                                    }}
                                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
                                >
                                    + Add Image
                                </button>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                                Minimum 2 images, maximum 5 images
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Prompt
                            </label>
                            <ExpandableTextarea
                                value={config.prompt}
                                onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
                                placeholder="Describe how to combine/transform the images..."
                                disabled={readOnly}
                                inputData={inputData}
                            />
                        </div>
                    </>
                )}

                {config.operation === 'imageExpand' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Image URL *
                            </label>
                            <ExpandableTextarea
                                value={config.image}
                                onChange={(e) => setConfig({ ...config, image: e.target.value })}
                                placeholder="https://example.com/image.jpg"
                                disabled={readOnly}
                                inputData={inputData}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Expand Direction
                                </label>
                                <select
                                    value={config.expandDirection}
                                    onChange={(e) => setConfig({ ...config, expandDirection: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    disabled={readOnly}
                                >
                                    <option value="all">All Directions</option>
                                    <option value="left">Left</option>
                                    <option value="right">Right</option>
                                    <option value="top">Top</option>
                                    <option value="bottom">Bottom</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Expand Ratio
                                </label>
                                <input
                                    type="number"
                                    value={config.expandRatio}
                                    onChange={(e) => setConfig({ ...config, expandRatio: parseFloat(e.target.value) })}
                                    step="0.1"
                                    min="1"
                                    max="3"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                    disabled={readOnly}
                                />
                            </div>
                        </div>
                    </>
                )}

                {config.operation === 'imageRecognize' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Image URL *
                        </label>
                        <ExpandableTextarea
                            value={config.image}
                            onChange={(e) => setConfig({ ...config, image: e.target.value })}
                            placeholder="https://example.com/image.jpg"
                            disabled={readOnly}
                            inputData={inputData}
                        />
                    </div>
                )}

                {config.operation === 'functionalityTry' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Functionality Name *
                            </label>
                            <input
                                type="text"
                                value={config.functionality}
                                onChange={(e) => setConfig({ ...config, functionality: e.target.value })}
                                placeholder="Enter functionality name..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                                disabled={readOnly}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Tên của functionality cần test
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Parameters (JSON)
                            </label>
                            <ExpandableTextarea
                                value={config.parameters}
                                onChange={(e) => setConfig({ ...config, parameters: e.target.value })}
                                placeholder='{"key": "value"} or use {{NodeName.field}}'
                                disabled={readOnly}
                                inputData={inputData}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Parameters dạng JSON object
                            </p>
                        </div>
                    </>
                )}
            </div>
        );
    };

    return (
        <>
            <ConfigModalLayout
                title="Kling AI"
                iconPath="/icons/nodes/kling-color.svg"
                node={node}
                onRename={onRename}
                onClose={handleClose}
                readOnly={readOnly}
                isTesting={false}
                testButtons={testButtons}
                size="large"
            >
                {/* Left Panel - INPUT */}
                <div className="w-1/3 border-r border-gray-200 flex flex-col">
                    <TestResultViewer
                        data={inputData}
                        viewMode={inputViewMode}
                        onViewModeChange={setInputViewMode}
                        collapsedPaths={collapsedPaths}
                        onToggleCollapse={togglePathCollapse}
                        title="INPUT"
                        emptyState={
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                </svg>
                                <p className="text-center text-sm">Connect this node to receive input data</p>
                                <p className="text-center text-xs mt-2">Kéo thả biến từ đây vào config</p>
                            </div>
                        }
                    />
                </div>

                {/* Center Panel - Configuration */}
                <div className="w-1/3 flex flex-col">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex space-x-2">
                        <button 
                            onClick={() => setActiveTab('schema')}
                            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                                activeTab === 'schema' 
                                    ? 'bg-blue-600 text-white' 
                                    : 'bg-white text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            Schema
                        </button>
                        <button 
                            onClick={() => setActiveTab('json')}
                            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                                activeTab === 'json' 
                                    ? 'bg-blue-600 text-white' 
                                    : 'bg-white text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            JSON
                        </button>
                        <button 
                            onClick={() => setActiveTab('parameters')}
                            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                                activeTab === 'parameters' 
                                    ? 'bg-blue-600 text-white' 
                                    : 'bg-white text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            Parameters
                        </button>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto">
                        {activeTab === 'parameters' && renderConfigForm()}
                        {activeTab === 'schema' && (
                            <div className="space-y-2">
                                <h3 className="font-medium text-gray-900">Configuration Schema</h3>
                                <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto">
                                    {JSON.stringify(config, null, 2)}
                                </pre>
                            </div>
                        )}
                        {activeTab === 'json' && (
                            <div className="space-y-2">
                                <h3 className="font-medium text-gray-900">Configuration JSON</h3>
                                <textarea
                                    value={JSON.stringify(config, null, 2)}
                                    onChange={(e) => {
                                        try {
                                            setConfig(JSON.parse(e.target.value));
                                        } catch (err) {
                                            // Invalid JSON, ignore
                                        }
                                    }}
                                    className="w-full h-96 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 font-mono text-xs"
                                    readOnly={readOnly}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel - OUTPUT */}
                <div className="w-1/3 border-l border-gray-200 flex flex-col">
                    <TestResultViewer
                        data={currentDisplayOutput}
                        viewMode={outputViewMode}
                        onViewModeChange={setOutputViewMode}
                        collapsedPaths={collapsedPaths}
                        onToggleCollapse={togglePathCollapse}
                        title="OUTPUT"
                        emptyState={
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <p className="text-center text-sm">Click 'Test step' to see output</p>
                            </div>
                        }
                    />
                </div>
            </ConfigModalLayout>

            {showCredentialModal && (
                <CredentialModal
                    onClose={() => setShowCredentialModal(false)}
                    onSave={handleCredentialSaved}
                    type="kling"
                />
            )}
        </>
    );
}

export default KlingConfigModal;


import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';

const UNASSIGNED_TOPIC_ID = 'unassigned';

const toArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [];
};

const DEFAULT_CONFIG = {
    webhook: {
        method: 'post',
        url: '',
        headers: {},
        authorization: {
            type: 'none',
            token: '',
            username: '',
            password: '',
            header_name: 'X-API-Key',
            query_name: 'api_key',
        },
        status_triggers: ['completed'],
        fields: {
            input: [],
            output: [],
            include_status: true,
        },
    },
    callback: {
        method: 'post',
        path: '',
        token: '',
    },
};

const normalizeConfig = (config) => {
    const webhook = config?.webhook || {};
    const fields = webhook.fields || {};

    return {
        webhook: {
            ...DEFAULT_CONFIG.webhook,
            ...webhook,
            authorization: {
                ...DEFAULT_CONFIG.webhook.authorization,
                ...(webhook.authorization || {}),
            },
            headers: {
                ...DEFAULT_CONFIG.webhook.headers,
                ...(webhook.headers || {}),
            },
            fields: {
                ...DEFAULT_CONFIG.webhook.fields,
                ...fields,
                input: toArray(fields.input),
                output: toArray(fields.output),
            },
            status_triggers: toArray(webhook.status_triggers || DEFAULT_CONFIG.webhook.status_triggers),
        },
        callback: {
            ...DEFAULT_CONFIG.callback,
            ...(config?.callback || {}),
        },
    };
};

const normalizeTable = (table) => {
    const normalized = table ? { ...table } : {};
    normalized.fields = toArray(table?.fields);
    normalized.statuses = toArray(table?.statuses);
    normalized.config = normalizeConfig(table?.config || {});
    return normalized;
};

const AutomationTablesTab = ({ canManage = true, onStructureChange, hideTopicPanel = false, initialTableId = null, selectedTopicId: controlledTopicId = null, selectedTableId: controlledTableId = null, onSelectTable }) => {
    const navigate = useNavigate();
    const [topics, setTopics] = useState([]);
    const [selectedTopicIdState, setSelectedTopicIdState] = useState(null);
    const [tables, setTables] = useState([]);
    const [selectedTableIdState, setSelectedTableIdState] = useState(initialTableId);
    const [selectedTable, setSelectedTable] = useState(null);
    const [loadingTopics, setLoadingTopics] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [rowsData, setRowsData] = useState({ data: [], meta: {} });
    const [rowsLoading, setRowsLoading] = useState(false);
    const [selectedRows, setSelectedRows] = useState([]);
    const [showAddTopicModal, setShowAddTopicModal] = useState(false);
    const [showTableModal, setShowTableModal] = useState(false);
    const [editingTable, setEditingTable] = useState(null);
    const [tableModalTopicId, setTableModalTopicId] = useState(null);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showFieldModal, setShowFieldModal] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [showRowModal, setShowRowModal] = useState(false);
    const [editingField, setEditingField] = useState(null);
    const [editingStatus, setEditingStatus] = useState(null);
    const [rowDraft, setRowDraft] = useState(null);
    const [editingTopic, setEditingTopic] = useState(null);
    const [topicForm, setTopicForm] = useState({ name: '', description: '' });
    const [savingTopic, setSavingTopic] = useState(false);
    const [now, setNow] = useState(Date.now());
    const [expandedTopics, setExpandedTopics] = useState({});
    const [draggingTableId, setDraggingTableId] = useState(null);
    const [dragOverTopicId, setDragOverTopicId] = useState(null);
    const topicKey = (id) => {
        if (id === null || id === undefined || id === '' || id === 'null') {
            return UNASSIGNED_TOPIC_ID;
        }
        return String(id);
    };
    const resolveTopicIdForRequest = (id) =>
        id === UNASSIGNED_TOPIC_ID || id === null || id === undefined || id === '' || id === 'null'
            ? null
            : Number(id);
    const resolveTopicName = (id) => {
        const key = topicKey(id);
        if (key === UNASSIGNED_TOPIC_ID) {
            return 'Không thuộc chủ đề';
        }
        const topic = topics.find((t) => t.id === key);
        return topic?.name || 'Không thuộc chủ đề';
    };

    const selectedTopicId = controlledTopicId ?? selectedTopicIdState;
    const selectedTableId = controlledTableId ?? selectedTableIdState;

    useEffect(() => {
        if (!hideTopicPanel) {
            fetchTopics({ preferredTopicId: selectedTopicId, preferredTableId: selectedTableId });
        }
    }, [hideTopicPanel]);

    useEffect(() => {
        if (hideTopicPanel) {
            setTopics([]);
            setSelectedTopicIdState(null);
            setTables([]);
            if (initialTableId) {
                setSelectedTableIdState(initialTableId);
            } else {
                setSelectedTableIdState(null);
            }
        }
    }, [hideTopicPanel, initialTableId]);

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!hideTopicPanel) {
            return;
        }

        if (selectedTableId) {
            setSelectedRows([]);
            fetchTableDetail(selectedTableId);
            fetchRows(selectedTableId);
            onSelectTable?.(selectedTableId);
        } else {
            setSelectedTable(null);
            setRowsData({ data: [], meta: {} });
            setSelectedRows([]);
        }
    }, [hideTopicPanel, selectedTableId]);

    const fetchTopics = async ({ preferredTopicId = null, preferredTableId = null } = {}) => {
        setLoadingTopics(true);
        try {
            const [topicsRes, tablesRes] = await Promise.all([
                axios.get('/automation/topics', { params: { with_tables: true } }),
                axios.get('/automation/tables'),
            ]);

            const allTables = toArray(tablesRes.data).map((table) => normalizeTable(table));

            const normalizedTopics = toArray(topicsRes.data).map((topic) => ({
                ...topic,
                id: String(topic.id),
                tables: toArray(topic.tables)
                    .map(normalizeTable)
                    .map((table) => ({ ...table, automation_topic_id: table.automation_topic_id ? String(table.automation_topic_id) : null })),
            }));

            const assignedTableIds = new Set();
            normalizedTopics.forEach((topic) => {
                topic.tables.forEach((table) => assignedTableIds.add(table.id));
            });

            const unassignedTables = allTables
                .filter((table) => !table.automation_topic_id)
                .map((table) => ({
                    ...table,
                    automation_topic_id: null,
                }));

            const mergedTopics = [...normalizedTopics];

            mergedTopics.push({
                id: UNASSIGNED_TOPIC_ID,
                name: 'Không thuộc chủ đề',
                description: 'Các bảng chưa gán vào chủ đề nào',
                tables: unassignedTables,
            });

            setTopics(mergedTopics);
            setExpandedTopics((prev) => {
                const next = {};
                mergedTopics.forEach((topic) => {
                    next[topic.id] = Object.prototype.hasOwnProperty.call(prev, topic.id) ? prev[topic.id] : true;
                });
                return next;
            });

            if (mergedTopics.length === 0) {
                setSelectedTopicIdState(null);
                setTables([]);
                setSelectedTableIdState(null);
                setSelectedTable(null);
                setRowsData({ data: [], meta: {} });
                return;
            }

            const topicIdToSelect = preferredTopicId
                ?? (mergedTopics.find((topic) => topic.id === selectedTopicIdState)?.id
                    ?? mergedTopics[0].id);

            const topic = mergedTopics.find((t) => t.id === topicIdToSelect) ?? mergedTopics[0];
            setSelectedTopicIdState(topic.id);
            const topicTables = topic.tables;
            setTables(topicTables);

            const tableIdToSelect = preferredTableId
                ?? (topicTables.find((table) => table.id === selectedTableIdState)?.id
                    ?? topicTables[0]?.id
                    ?? null);

            setSelectedTableIdState(tableIdToSelect);

            if (tableIdToSelect) {
                const table = topicTables.find((t) => t.id === tableIdToSelect);
                if (table) {
                    setSelectedTable(table);
                }
            } else {
                setSelectedTable(null);
                setRowsData({ data: [], meta: {} });
            }
        } catch (error) {
            console.error('Không thể tải danh sách chủ đề automation', error);
        } finally {
            setLoadingTopics(false);
        }
    };

    const fetchTableDetail = async (id) => {
        setLoadingDetail(true);
        try {
            const res = await axios.get(`/automation/tables/${id}`);
            const tableData = normalizeTable(res.data);
            tableData.rows = toArray(res.data.rows);
            setSelectedTable(tableData);
        } catch (error) {
            console.error('Không thể tải chi tiết bảng automation', error);
        } finally {
            setLoadingDetail(false);
        }
    };

    const fetchRows = async (id, page = 1) => {
        setRowsLoading(true);
        try {
            const res = await axios.get(`/automation/tables/${id}/rows`, { params: { page } });
            const rowsArray = toArray(res.data?.data || res.data);
            const meta = res.data && typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : {};
            setRowsData({ data: rowsArray, meta });
        } catch (error) {
            console.error('Không thể tải dữ liệu hàng automation', error);
        } finally {
            setRowsLoading(false);
        }
    };

    const handleAddTable = async (payload) => {
        const targetTopicId = tableModalTopicId ?? selectedTopicId ?? UNASSIGNED_TOPIC_ID;
        const topicKeyValue = topicKey(targetTopicId);
        try {
            const body = {
                ...payload,
                automation_topic_id: resolveTopicIdForRequest(topicKeyValue),
            };
            const res = await axios.post('/automation/tables', body);
            const normalized = normalizeTable(res.data);
            closeTableModal();
            const targetKey = topicKey(normalized.automation_topic_id);
            await fetchTopics({ preferredTopicId: targetKey, preferredTableId: normalized.id });
            onStructureChange?.();
        } catch (error) {
            console.error('Không thể tạo bảng automation mới', error);
            alert('Tạo bảng thất bại. Vui lòng kiểm tra và thử lại.');
        }
    };

    const handleUpdateTable = async (payload) => {
        if (!editingTable) return;
        const targetTopicId = tableModalTopicId ?? editingTable.automation_topic_id ?? UNASSIGNED_TOPIC_ID;
        const topicKeyValue = topicKey(targetTopicId);
        try {
            await axios.put(`/automation/tables/${editingTable.id}`, {
                ...payload,
                automation_topic_id: resolveTopicIdForRequest(topicKeyValue),
            });
            const preferredTableId = editingTable.id;
            closeTableModal();
            await fetchTopics({ preferredTopicId: topicKeyValue, preferredTableId: preferredTableId });
            onStructureChange?.();
        } catch (error) {
            console.error('Không thể cập nhật bảng automation', error);
            alert('Cập nhật bảng thất bại. Vui lòng thử lại.');
        }
    };

    const handleUpdateConfig = async (config) => {
        if (!selectedTable) return;
        try {
            await axios.put(`/automation/tables/${selectedTable.id}`, { config });
            await fetchTableDetail(selectedTable.id);
            setShowConfigModal(false);
        } catch (error) {
            console.error('Không thể cập nhật cấu hình', error);
            alert('Cập nhật cấu hình thất bại.');
        }
    };

    const handleSaveField = async (field) => {
        if (!selectedTable) return;
        const payload = {
            label: field.label,
            key: field.key,
            group: field.group || 'input',
            data_type: field.data_type || 'string',
            is_required: !!field.is_required,
            display_order: field.display_order ?? selectedTable.fields.length,
            is_active: field.is_active ?? true,
        };

        try {
            if (field.id) {
                await axios.put(`/automation/tables/${selectedTable.id}/fields/${field.id}`, payload);
            } else {
                await axios.post(`/automation/tables/${selectedTable.id}/fields`, payload);
            }
            setShowFieldModal(false);
            setEditingField(null);
            fetchTableDetail(selectedTable.id);
        } catch (error) {
            console.error('Không thể lưu trường', error);
            alert('Lưu trường thất bại.');
        }
    };

    const handleDeleteField = async (fieldId) => {
        if (!selectedTable) return false;
        if (!window.confirm('Bạn có chắc chắn muốn xoá trường này?')) return false;
        try {
            await axios.delete(`/automation/tables/${selectedTable.id}/fields/${fieldId}`);
            fetchTableDetail(selectedTable.id);
            if (editingField?.id === fieldId) {
                setEditingField(null);
            }
            return true;
        } catch (error) {
            console.error('Không thể xoá trường', error);
            alert('Xoá trường thất bại.');
            return false;
        }
    };

    const handleReorderFields = async (orderedFields) => {
        if (!selectedTable) return;
        try {
            await Promise.all(
                orderedFields.map((field, index) =>
                    axios.put(`/automation/tables/${selectedTable.id}/fields/${field.id}`, {
                        label: field.label,
                        key: field.key,
                        group: field.group,
                        data_type: field.data_type,
                        is_required: field.is_required,
                        display_order: index,
                        is_active: field.is_active ?? true,
                    })
                )
            );
            await fetchTableDetail(selectedTable.id);
        } catch (error) {
            console.error('Không thể sắp xếp field', error);
            alert('Sắp xếp field thất bại. Vui lòng thử lại.');
        }
    };

    const handleSaveStatus = async (status) => {
        if (!selectedTable) return;
        try {
            const payload = {
                label: status.label,
                value: status.value || null,
                color: status.color || null,
                is_default: !!status.is_default,
                is_terminal: !!status.is_terminal,
                sort_order: status.sort_order ?? selectedTable.statuses.length,
            };

            if (status.id) {
                await axios.put(`/automation/tables/${selectedTable.id}/statuses/${status.id}`, payload);
            } else {
                await axios.post(`/automation/tables/${selectedTable.id}/statuses`, payload);
            }
            setShowStatusModal(false);
            setEditingStatus(null);
            fetchTableDetail(selectedTable.id);
        } catch (error) {
            console.error('Không thể lưu trạng thái', error);
            alert('Lưu trạng thái thất bại.');
        }
    };

    const handleDeleteStatus = async (statusId) => {
        if (!selectedTable) return;
        if (!window.confirm('Bạn có chắc chắn muốn xoá trạng thái này?')) return;
        try {
            await axios.delete(`/automation/tables/${selectedTable.id}/statuses/${statusId}`);
            fetchTableDetail(selectedTable.id);
        } catch (error) {
            console.error('Không thể xoá trạng thái', error);
            alert('Xoá trạng thái thất bại.');
        }
    };

    const handleReorderStatuses = async (orderedStatuses) => {
        if (!selectedTable) return;
        try {
            await Promise.all(
                orderedStatuses.map((status, index) =>
                    axios.put(`/automation/tables/${selectedTable.id}/statuses/${status.id}`, {
                        label: status.label,
                        value: status.value,
                        color: status.color,
                        is_default: status.is_default,
                        is_terminal: status.is_terminal,
                        sort_order: index,
                    })
                )
            );
            await fetchTableDetail(selectedTable.id);
        } catch (error) {
            console.error('Không thể sắp xếp trạng thái', error);
            alert('Sắp xếp trạng thái thất bại. Vui lòng thử lại.');
        }
    };

    const handleSaveRow = async (rowPayload) => {
        if (!selectedTable) return;
        try {
            await axios.post(`/automation/tables/${selectedTable.id}/rows`, rowPayload);
            setShowRowModal(false);
            setRowDraft(null);
            fetchRows(selectedTable.id, 1);
            fetchTableDetail(selectedTable.id);
        } catch (error) {
            console.error('Không thể thêm dòng mới', error);
            alert('Thêm dòng thất bại.');
        }
    };

    const handleUpdateRow = async (rowId, payload) => {
        if (!selectedTable) return;
        try {
            await axios.put(`/automation/tables/${selectedTable.id}/rows/${rowId}`, payload);
            fetchRows(selectedTable.id, rowsData.meta.current_page || 1);
        } catch (error) {
            console.error('Không thể cập nhật dòng', error);
            alert('Cập nhật dòng thất bại.');
        }
    };

    const handleDeleteSelectedRows = async () => {
        if (!selectedTable || selectedRows.length === 0) return;
        if (!window.confirm(`Xoá ${selectedRows.length} dòng đã chọn?`)) return;
        try {
            await axios.post(`/automation/tables/${selectedTable.id}/rows/bulk-delete`, { ids: selectedRows });
            setSelectedRows([]);
            fetchRows(selectedTable.id, 1);
        } catch (error) {
            console.error('Không thể xoá các dòng đã chọn', error);
            alert('Xoá dòng thất bại.');
        }
    };

    const handleUpdateStatus = async (row, statusValue) => {
        if (!selectedTable) return null;
        try {
            const res = await axios.post(`/automation/tables/${selectedTable.id}/rows/${row.id}/status`, {
                status_value: statusValue,
            });

            setRowsData((prev) => {
                const updatedRows = prev.data.map((item) =>
                    item.id === row.id
                        ? {
                            ...item,
                            status: {
                                value: statusValue,
                                label: selectedTable.statuses.find((status) => status.value === statusValue)?.label || statusValue,
                                color: selectedTable.statuses.find((status) => status.value === statusValue)?.color || null,
                            },
                          }
                        : item
                );
                return {
                    ...prev,
                    data: updatedRows,
                };
            });

            return res.data;
        } catch (error) {
            console.error('Không thể cập nhật trạng thái', error);
            alert('Cập nhật trạng thái thất bại.');
            return null;
        }
    };

    const handleResendWebhook = async (rowId) => {
        if (!selectedTable) return;
        try {
            await axios.post(`/automation/tables/${selectedTable.id}/rows/${rowId}/resend`);
            fetchRows(selectedTable.id, rowsData.meta.current_page || 1);
        } catch (error) {
            console.error('Không thể gửi lại webhook', error);
            alert('Gửi lại webhook thất bại.');
        }
    };

    const handleSelectTopic = (topicId) => {
        const topic = topics.find((t) => t.id === topicId);
        if (!topic) return;
        if (!controlledTopicId) {
            setSelectedTopicIdState(topicId);
        }
        setTables(topic.tables);
        const firstTableId = topic.tables[0]?.id ?? null;
        if (!controlledTableId) {
            setSelectedTableIdState(firstTableId);
        }
        if (!firstTableId) {
            setSelectedTable(null);
            setRowsData({ data: [], meta: {} });
        } else {
            onSelectTable?.(firstTableId);
        }
    };

    const openTopicModal = (topic = null) => {
        if (topic) {
            setEditingTopic(topic);
            setTopicForm({
                name: topic.name,
                description: topic.description || '',
            });
        } else {
            setEditingTopic(null);
            setTopicForm({ name: '', description: '' });
        }
        setShowAddTopicModal(true);
    };

    const handleSaveTopic = async (e) => {
        e.preventDefault();
        if (!topicForm.name.trim()) {
            alert('Vui lòng nhập tên chủ đề.');
            return;
        }
        setSavingTopic(true);
        try {
            if (editingTopic) {
                await axios.put(`/automation/topics/${editingTopic.id}`, {
                    name: topicForm.name.trim(),
                    description: topicForm.description?.trim() || null,
                });
                setShowAddTopicModal(false);
                setEditingTopic(null);
                setTopicForm({ name: '', description: '' });
                await fetchTopics({ topicId: editingTopic.id });
                onStructureChange?.();
            } else {
                const res = await axios.post('/automation/topics', {
                    name: topicForm.name.trim(),
                    description: topicForm.description?.trim() || null,
                });
                setShowAddTopicModal(false);
                setTopicForm({ name: '', description: '' });
                await fetchTopics({ topicId: res.data.id });
                onStructureChange?.();
            }
        } catch (error) {
            console.error('Không thể lưu chủ đề', error);
            alert('Lưu chủ đề thất bại.');
        } finally {
            setSavingTopic(false);
        }
    };

    const handleDeleteTopic = async (topicId) => {
        if (!window.confirm('Bạn có chắc chắn muốn xoá chủ đề này?')) return;
        try {
            await axios.delete(`/automation/topics/${topicId}`);
            const remainingTopics = topics.filter((t) => t.id !== topicId);
            const nextTopicId = remainingTopics[0]?.id ?? null;
            await fetchTopics({ topicId: nextTopicId });
            onStructureChange?.();
        } catch (error) {
            console.error('Không thể xoá chủ đề', error);
            alert(error.response?.data?.message || 'Xoá chủ đề thất bại.');
        }
    };

    const moveTableToTopic = async (tableId, targetTopicId) => {
        const requestTopicId = resolveTopicIdForRequest(targetTopicId);
        try {
            await axios.put(`/automation/tables/${tableId}`, {
                automation_topic_id: requestTopicId,
            });

            const preferredTopicKey = topicKey(targetTopicId);
            await fetchTopics({ preferredTopicId: preferredTopicKey });
            setSelectedTopicIdState(preferredTopicKey);
            setExpandedTopics((prev) => ({
                ...prev,
                [preferredTopicKey]: true,
            }));
            onStructureChange?.();
        } catch (error) {
            console.error('Không thể di chuyển bảng automation', error);
            alert('Di chuyển bảng thất bại. Vui lòng thử lại.');
        }
    };

    const closeTableModal = () => {
        setShowTableModal(false);
        setEditingTable(null);
        setTableModalTopicId(null);
    };

    const handleOpenAddTableModal = () => {
        const targetTopicId = selectedTopicId ?? UNASSIGNED_TOPIC_ID;
        setEditingTable(null);
        setTableModalTopicId(targetTopicId);
        setShowTableModal(true);
    };

    const handleDragStartTable = (event, tableId, sourceTopicId) => {
        setDraggingTableId(tableId);
        event.dataTransfer.setData('automation-table-id', String(tableId));
        event.dataTransfer.setData('automation-source-topic-id', sourceTopicId ? String(sourceTopicId) : '');
        event.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEndTable = () => {
        setDraggingTableId(null);
        setDragOverTopicId(null);
    };

    const handleDragOverTopic = (event) => {
        if (event.dataTransfer.types.includes('automation-table-id')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
        }
    };

    const handleDragEnterTopic = (event, targetTopicId) => {
        if (!draggingTableId) return;
        event.preventDefault();
        setDragOverTopicId(targetTopicId);
    };

    const handleDragLeaveTopic = (event, targetTopicId) => {
        event.preventDefault();
        if (dragOverTopicId === targetTopicId) {
            setDragOverTopicId(null);
        }
    };

    const handleDropOnTopic = async (event, targetTopicId) => {
        if (!draggingTableId) return;
        event.preventDefault();
        const tableId = Number(event.dataTransfer.getData('automation-table-id'));
        const sourceTopicId = event.dataTransfer.getData('automation-source-topic-id') || null;
        const normalizedTargetKey = topicKey(targetTopicId);
        const normalizedSourceKey = topicKey(sourceTopicId);

        if (!tableId || normalizedTargetKey === normalizedSourceKey) {
            setDragOverTopicId(null);
            setDraggingTableId(null);
            return;
        }

        await moveTableToTopic(tableId, targetTopicId);
        setDragOverTopicId(null);
        setDraggingTableId(null);
    };

    const toggleTopicExpansion = (topicId) => {
        setExpandedTopics((prev) => ({
            ...prev,
            [topicId]: !prev[topicId],
        }));
    };

    const goToTableDetail = (tableId) => {
        const path = window.location.pathname;

        if (path.startsWith('/dashboard')) {
            navigate(`/dashboard/automations/table/${tableId}`);
        } else if (path.startsWith('/administrator')) {
            navigate(`/administrator/automations/table/${tableId}`);
        } else if (path.startsWith('/admin')) {
            navigate(`/admin/automations/table/${tableId}`);
        } else {
            navigate(`/automations/table/${tableId}`);
        }
    };

    const toggleRowSelection = (rowId) => {
        setSelectedRows((prev) =>
            prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
        );
    };

    const toggleSelectAllRows = () => {
        if (selectedRows.length === rowsData.data.length) {
            setSelectedRows([]);
        } else {
            setSelectedRows(rowsData.data.map((row) => row.id));
        }
    };

    const primaryInputFields = useMemo(() => {
        if (!selectedTable) return [];
        return selectedTable.fields
            .filter((field) => field.group === 'input' && field.is_active)
            .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
            .slice(0, 2);
    }, [selectedTable]);

    const primaryOutputFields = useMemo(() => {
        if (!selectedTable) return [];
        return selectedTable.fields
            .filter((field) => field.group === 'output' && field.is_active)
            .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
            .slice(0, 2);
    }, [selectedTable]);

    const extraInputFields = useMemo(() => {
        if (!selectedTable) return [];
        const primaryKeys = primaryInputFields.map((f) => f.key);
        return selectedTable.fields
            .filter((field) => field.group === 'input' && field.is_active && !primaryKeys.includes(field.key))
            .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    }, [selectedTable, primaryInputFields]);

    const extraOutputFields = useMemo(() => {
        if (!selectedTable) return [];
        const primaryKeys = primaryOutputFields.map((f) => f.key);
        return selectedTable.fields
            .filter((field) => field.group === 'output' && field.is_active && !primaryKeys.includes(field.key))
            .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    }, [selectedTable, primaryOutputFields]);

    const metaFields = useMemo(() => {
        if (!selectedTable) return [];
        return selectedTable.fields
            .filter((field) => field.group === 'meta' && field.is_active)
            .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    }, [selectedTable]);

    const renderTopicModals = () => (
        <>
            {showAddTopicModal && (
                <TopicModal
                    onClose={() => {
                        setShowAddTopicModal(false);
                        setEditingTopic(null);
                        setTopicForm({ name: '', description: '' });
                    }}
                    onSubmit={handleSaveTopic}
                    form={topicForm}
                    setForm={setTopicForm}
                    saving={savingTopic}
                    isEditing={!!editingTopic}
                />
            )}

            {showTableModal && (
                <TableModal
                    onClose={closeTableModal}
                    onSubmit={editingTable ? handleUpdateTable : handleAddTable}
                    topicName={resolveTopicName(tableModalTopicId)}
                    initialForm={{
                        name: editingTable?.name || '',
                        description: editingTable?.description || '',
                    }}
                    isEditing={!!editingTable}
                />
            )}
        </>
    );

    const renderManageView = () => (
        <>
            <div className="space-y-6">
                <div className="bg-surface-elevated border border-subtle rounded-2xl p-5 shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-semibold text-primary">Automation Topics</h2>
                            <p className="text-sm text-muted">
                                Kéo &amp; thả các bảng automation giữa các chủ đề để sắp xếp.
                            </p>
                        </div>
                        {canManage && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => openTopicModal()}
                                    className="btn btn-primary text-sm px-3 py-2"
                                >
                                    + Chủ đề
                                </button>
                                <button
                                    onClick={handleOpenAddTableModal}
                                    className={`btn text-sm px-3 py-2 ${
                                        selectedTopicId
                                            ? 'btn-success'
                                            : 'btn-muted cursor-not-allowed opacity-70'
                                    }`}
                                    disabled={!selectedTopicId}
                                >
                                    + Bảng
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-3">
                    {loadingTopics ? (
                        <div className="text-muted text-sm">Đang tải danh sách chủ đề...</div>
                    ) : topics.length === 0 ? (
                        <div className="text-muted text-sm space-y-1">
                            <p>Chưa có chủ đề automation nào.</p>
                            {canManage && <p>Hãy tạo chủ đề mới hoặc import bảng để bắt đầu.</p>}
                        </div>
                    ) : (
                        topics.map((topic) => {
                            const isExpanded = expandedTopics[topic.id] ?? true;
                            const isActiveTopic = selectedTopicId === topic.id;
                            const isDragHover = dragOverTopicId === topic.id;
                            const topicBorderClasses = isDragHover
                                ? 'border-blue-400 ring-2 ring-blue-200 bg-primary-soft/80'
                                : isActiveTopic
                                    ? 'border-blue-200 bg-primary-soft/60'
                                    : 'border-subtle bg-surface-elevated';

                            return (
                                <div
                                    key={topic.id}
                                    onDragOver={handleDragOverTopic}
                                    onDragEnter={(event) => handleDragEnterTopic(event, topic.id)}
                                    onDragLeave={(event) => handleDragLeaveTopic(event, topic.id)}
                                    onDrop={(event) => handleDropOnTopic(event, topic.id)}
                                    className={`border rounded-2xl shadow-card transition-all ${topicBorderClasses}`}
                                >
                                    <div
                                        className="flex items-start justify-between gap-3 p-4 cursor-pointer"
                                        onClick={() => {
                                            if (!controlledTopicId) {
                                                setSelectedTopicIdState(topic.id);
                                            }
                                            setExpandedTopics((prev) => ({
                                                ...prev,
                                                [topic.id]: true,
                                            }));
                                        }}
                                    >
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-primary font-semibold">{topic.name}</h3>
                                                <span className="px-2 py-0.5 text-xs text-muted bg-surface-muted border border-subtle rounded-full">
                                                    {topic.tables.length} bảng
                                                </span>
                                            </div>
                                            {topic.description && (
                                                <p className="text-xs text-muted">{topic.description}</p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {canManage && topic.id !== UNASSIGNED_TOPIC_ID && (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            openTopicModal(topic);
                                                        }}
                                                        className="text-xs px-2 py-1 rounded-lg bg-primary-soft text-primary hover:text-primary"
                                                    >
                                                        Sửa
                                                    </button>
                                                    <button
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            handleDeleteTopic(topic.id);
                                                        }}
                                                        className="text-xs px-2 py-1 rounded-lg bg-rose-50 text-danger hover:text-danger"
                                                    >
                                                        Xoá
                                                    </button>
                                                </div>
                                            )}
                                            <button
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    toggleTopicExpansion(topic.id);
                                                }}
                                                className="text-muted hover:text-primary"
                                                title={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                                            >
                                                <svg
                                                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <div className="border-t border-subtle">
                                            <div className="p-3 space-y-2 min-h-[3.5rem]">
                                                {topic.tables.length === 0 ? (
                                                    <div className="text-xs text-muted italic">
                                                        Kéo thả bảng automation vào đây để gán cho chủ đề này.
                                                    </div>
                                                ) : (
                                                    topic.tables.map((table) => (
                                                        <div
                                                            key={table.id}
                                                            draggable
                                                            onDragStart={(event) =>
                                                                handleDragStartTable(event, table.id, topic.id)
                                                            }
                                                            onDragEnd={handleDragEndTable}
                                                            className={`flex items-center justify-between px-3 py-2 rounded-xl border transition cursor-pointer gap-3 ${
                                                                draggingTableId === table.id
                                                                    ? 'border-blue-300 bg-primary-soft opacity-70'
                                                                    : 'border-subtle bg-surface-elevated hover:bg-primary-soft'
                                                            }`}
                                                            title={table.slug || table.name}
                                                        >
                                                            <button
                                                                onClick={() => {
                                                                    if (!controlledTopicId) {
                                                                        setSelectedTopicIdState(topic.id);
                                                                    }
                                                                    setSelectedTableIdState(table.id);
                                                                    onSelectTable?.(table.id);
                                                                    goToTableDetail(table.id);
                                                                }}
                                                                className="flex-1 text-left"
                                                            >
                                                                <div className="text-secondary text-sm font-medium">{table.name}</div>
                                                                {table.slug && (
                                                                    <div className="text-xs text-muted font-mono truncate max-w-[200px]">
                                                                        {table.slug}
                                                                    </div>
                                                                )}
                                                            </button>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        setEditingTable(table);
                                                                        setTableModalTopicId(topic.id);
                                                                        setShowTableModal(true);
                                                                    }}
                                                                    className="text-xs px-2 py-1 rounded-lg bg-primary-soft text-primary hover:text-primary"
                                                                >
                                                                    Sửa
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
            {renderTopicModals()}
        </>
    );

    const renderDetailView = () => (
        <>
            <div className="bg-surface-elevated border border-subtle rounded-2xl p-6 shadow-card">
                {loadingDetail || !selectedTable ? (
                    <div className="text-muted">
                        {loadingDetail ? 'Đang tải chi tiết...' : 'Không tìm thấy bảng automation.'}
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <h2 className="text-2xl font-semibold text-primary">{selectedTable.name}</h2>
                                <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                                    {/* <span className="px-2 py-1 bg-surface-muted rounded-lg border border-subtle">
                                        Slug: {selectedTable.slug}
                                    </span> */}
                                    <span
                                        className={`px-2 py-1 rounded-lg border ${
                                            selectedTable.is_active
                                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                                : 'bg-surface-muted text-muted border-subtle'
                                        }`}
                                    >
                                        {selectedTable.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                    {/* <span className="px-2 py-1 bg-primary-soft text-primary rounded-lg border border-blue-200">
                                        {selectedTable.statuses?.length ?? 0} trạng thái
                                    </span> */}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => {
                                        setRowDraft(null);
                                        setShowRowModal(true);
                                    }}
                                    className="btn btn-primary text-sm"
                                >
                                    + Thêm dòng mới
                                </button>
                                <button onClick={() => setShowConfigModal(true)} className="btn btn-muted text-sm">
                                    Cấu hình
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingField(null);
                                        setShowFieldModal(true);
                                    }}
                                    className="btn text-sm bg-purple-600 hover:bg-purple-700 text-white shadow-card"
                                >
                                    Quản lý Field
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingStatus(null);
                                        setShowStatusModal(true);
                                    }}
                                    className="btn text-sm bg-amber-500 hover:bg-amber-600 text-white shadow-card"
                                >
                                    Quản lý Status
                                </button>
                            </div>
                        </div>

                        <RowsToolbar
                            rows={rowsData.data}
                            selectedRows={selectedRows}
                            onSelectAll={toggleSelectAllRows}
                            onDeleteSelected={handleDeleteSelectedRows}
                        />

                        <RowsTable
                            rows={rowsData.data}
                            loading={rowsLoading}
                            table={selectedTable}
                            primaryInputFields={primaryInputFields}
                            primaryOutputFields={primaryOutputFields}
                            extraInputFields={extraInputFields}
                            extraOutputFields={extraOutputFields}
                            metaFields={metaFields}
                            selectedRows={selectedRows}
                            onToggleRow={toggleRowSelection}
                            onUpdateStatus={handleUpdateStatus}
                            onResend={handleResendWebhook}
                            now={now}
                            onEditRow={(row) => {
                                setRowDraft(row);
                                setShowRowModal(true);
                            }}
                        />

                        <Pagination meta={rowsData.meta} onChangePage={(page) => fetchRows(selectedTable.id, page)} />

                        {/* <ConfigSummary
                            config={selectedTable.config}
                            statuses={selectedTable.statuses}
                            fields={selectedTable.fields}
                        /> */}
                    </div>
                )}
            </div>

            {renderTopicModals()}

            {showConfigModal && selectedTable && (
                <ConfigModal table={selectedTable} onClose={() => setShowConfigModal(false)} onSubmit={handleUpdateConfig} />
            )}

            {showFieldModal && selectedTable && (
                <FieldManagerModal
                    table={selectedTable}
                    editingField={editingField}
                    onClose={() => {
                        setShowFieldModal(false);
                        setEditingField(null);
                    }}
                    onEdit={(field) => {
                        setEditingField(field);
                        setShowFieldModal(true);
                    }}
                    onSave={handleSaveField}
                    onDelete={handleDeleteField}
                    onReorder={handleReorderFields}
                />
            )}

            {showStatusModal && selectedTable && (
                <StatusManagerModal
                    table={selectedTable}
                    editingStatus={editingStatus}
                    onClose={() => {
                        setShowStatusModal(false);
                        setEditingStatus(null);
                    }}
                    onEdit={(status) => {
                        setEditingStatus(status);
                        setShowStatusModal(true);
                    }}
                    onSave={handleSaveStatus}
                    onDelete={handleDeleteStatus}
                    onReorder={handleReorderStatuses}
                />
            )}

            {showRowModal && selectedTable && (
                <RowModal
                    table={selectedTable}
                    rowDraft={rowDraft}
                    onClose={() => {
                        setShowRowModal(false);
                        setRowDraft(null);
                    }}
                    onSave={rowDraft ? handleUpdateRow : handleSaveRow}
                />
            )}
        </>
    );

    return hideTopicPanel ? renderDetailView() : renderManageView();
};

const RowsToolbar = ({ rows, selectedRows, onSelectAll, onDeleteSelected }) => (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-muted px-3 py-2 rounded-2xl border border-subtle">
        <div className="flex items-center space-x-2 text-muted text-sm">
            <input
                type="checkbox"
                checked={rows.length > 0 && selectedRows.length === rows.length}
                onChange={onSelectAll}
                className="rounded border-subtle bg-surface-elevated"
            />
            <span>
                Đã chọn {selectedRows.length}/{rows.length} dòng
            </span>
        </div>
        <div className="flex items-center space-x-2">
            <button
                onClick={onDeleteSelected}
                disabled={selectedRows.length === 0}
                className="btn btn-danger text-sm px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
                Xoá dòng
            </button>
        </div>
    </div>
);

const RowsTable = ({
    rows,
    loading,
    table,
    primaryInputFields,
    primaryOutputFields,
    extraInputFields,
    extraOutputFields,
    metaFields,
    selectedRows,
    onToggleRow,
    onUpdateStatus,
    onResend,
    onEditRow,
    now,
}) => {
    const [expandedRow, setExpandedRow] = useState(null);

    if (loading) {
        return <div className="text-gray-600">Đang tải dữ liệu dòng...</div>;
    }

    if (rows.length === 0) {
        return <div className="text-gray-400">Chưa có dữ liệu dòng nào. Hãy thêm dòng mới để bắt đầu.</div>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-subtle text-sm bg-surface-elevated shadow-card rounded-2xl overflow-hidden">
                <thead className="bg-surface-muted">
                    <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-muted uppercase tracking-wider">Chọn</th>
                        {primaryInputFields.map((field) => (
                            <th key={field.id} className="px-3 py-2 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                                {field.label}
                            </th>
                        ))}
                        {primaryOutputFields.map((field) => (
                            <th key={field.id} className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                                {field.label}
                            </th>
                        ))}
                        <th className="px-3 py-2 text-left text-xs font-semibold text-muted uppercase tracking-wider">Status</th>
                        <th className="px-3 py-2" />
                    </tr>
                </thead>
                <tbody className="divide-y divide-subtle bg-surface-elevated">
                    {rows.map((row) => (
                        <React.Fragment key={row.id}>
                            <tr className="hover:bg-surface-muted/80 transition-colors">
                                <td className="px-3 py-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedRows.includes(row.id)}
                                        onChange={() => onToggleRow(row.id)}
                                        className="rounded border-subtle bg-surface-muted"
                                    />
                                </td>
                                {primaryInputFields.map((field) => (
                                    <td key={field.id} className="px-3 py-2 text-secondary">
                                        {formatValue(row.input_data?.[field.key])}
                                    </td>
                                ))}
                                {primaryOutputFields.map((field) => (
                                    <td key={field.id} className="px-3 py-2 text-secondary">
                                        {formatValue(row.output_data?.[field.key])}
                                    </td>
                                ))}
                                <td className="px-3 py-2 text-secondary">
                                    <StatusBadge
                                        row={row}
                                        table={table}
                                        onUpdateStatus={onUpdateStatus}
                                        onResend={onResend}
                                        now={now}
                                    />
                                </td>
                                <td className="px-3 py-2 text-right text-muted">
                                    <div className="flex items-center justify-end space-x-2">
                                        <button
                                            onClick={() => onEditRow(row)}
                                            className="text-primary hover:text-primary/80 text-sm font-medium"
                                        >
                                            Sửa
                                        </button>
                                        <button
                                            onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
                                            className="text-muted hover:text-primary"
                                        >
                                            <svg
                                                className={`w-4 h-4 transition-transform ${expandedRow === row.id ? 'rotate-180' : ''}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            {expandedRow === row.id && (
                                <tr>
                                    <td colSpan={5 + primaryInputFields.length + primaryOutputFields.length} className="bg-surface-muted">
                                        <RowExpandedContent
                                            row={row}
                                            extraInputFields={extraInputFields}
                                            extraOutputFields={extraOutputFields}
                                            metaFields={metaFields}
                                        />
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const StatusBadge = ({ row, table, onUpdateStatus, onResend, now }) => {
    const [changing, setChanging] = useState(false);
    const [selectedStatus, setSelectedStatus] = useState(row.status?.value || '');
    const statusMap = useMemo(() => {
        const map = {};
        table.statuses.forEach((status) => {
            map[status.value] = status;
        });
        return map;
    }, [table.statuses]);

    useEffect(() => {
        setSelectedStatus(row.status?.value || '');
    }, [row.status?.value]);

    const pendingSeconds = useMemo(() => {
        if (!row.is_pending_callback || !row.pending_since) return null;
        const started = new Date(row.pending_since).getTime();
        return Math.max(0, Math.floor((now - started) / 1000));
    }, [row.is_pending_callback, row.pending_since, now]);

    const handleChange = async (value) => {
        setChanging(true);
        const result = await onUpdateStatus(row, value);
        setChanging(false);
        if (!result) {
            setSelectedStatus(row.status?.value || '');
        }
    };

    const currentStatus = statusMap[selectedStatus] || null;
    const borderColor = currentStatus?.color || null;

    return (
        <div className="flex items-center gap-3">
            <select
                value={selectedStatus}
                onChange={(e) => handleChange(e.target.value)}
                disabled={changing}
                className="bg-surface-muted text-secondary text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2"
                style={{
                    borderColor: borderColor || 'var(--border-subtle)',
                    boxShadow: borderColor ? `0 0 0 1px ${borderColor} inset` : undefined,
                }}
            >
                {table.statuses.map((status) => (
                    <option key={status.id} value={status.value}>
                        {status.label}
                    </option>
                ))}
            </select>
            {row.is_pending_callback ? (
                <div className="flex items-center space-x-1 text-amber-300 text-xs">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 105 14.32l-1.45-1.45A6 6 0 1112 6v4z" />
                    </svg>
                    <span>{pendingSeconds ?? 0}s</span>
                </div>
            ) : (
                <button
                    onClick={() => onResend(row.id)}
                    className="text-xs text-muted hover:text-primary"
                >
                    Gửi lại
                </button>
            )}
        </div>
    );
};

const RowExpandedContent = ({ row, extraInputFields, extraOutputFields, metaFields }) => (
    <div className="grid md:grid-cols-3 gap-4 p-4 text-sm text-secondary bg-surface-elevated">
        <div>
            <h4 className="text-muted uppercase text-xs mb-2">Input khác</h4>
            <dl className="space-y-2">
                {extraInputFields.map((field) => (
                    <div key={field.id}>
                        <dt className="text-muted text-xs">{field.label}</dt>
                        <dd className="text-secondary">{formatValue(row.input_data?.[field.key])}</dd>
                    </div>
                ))}
                {extraInputFields.length === 0 && <div className="text-muted">Không có</div>}
            </dl>
        </div>
        <div>
            <h4 className="text-muted uppercase text-xs mb-2">Output khác</h4>
            <dl className="space-y-2">
                {extraOutputFields.map((field) => (
                    <div key={field.id}>
                        <dt className="text-muted text-xs">{field.label}</dt>
                        <dd className="text-secondary">{formatValue(row.output_data?.[field.key])}</dd>
                    </div>
                ))}
                {extraOutputFields.length === 0 && <div className="text-muted">Không có</div>}
            </dl>
        </div>
        <div>
            <h4 className="text-muted uppercase text-xs mb-2">Meta</h4>
            <dl className="space-y-2">
                {metaFields.map((field) => (
                    <div key={field.id}>
                        <dt className="text-muted text-xs">{field.label}</dt>
                        <dd className="text-secondary">{formatValue(row.meta_data?.[field.key])}</dd>
                    </div>
                ))}
                <div>
                    <dt className="text-muted text-xs">UUID</dt>
                    <dd className="text-secondary font-mono text-xs break-all">{row.uuid}</dd>
                </div>
                <div>
                    <dt className="text-muted text-xs">Pending callback</dt>
                    <dd className="text-secondary">{row.is_pending_callback ? 'Đang đợi' : 'Đã hoàn tất'}</dd>
                </div>
            </dl>
        </div>
    </div>
);

const Pagination = ({ meta, onChangePage }) => {
    if (!meta?.last_page || meta.last_page <= 1) {
        return null;
    }

    const pages = Array.from({ length: meta.last_page }, (_, i) => i + 1);

    return (
        <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
            {pages.map((page) => (
                <button
                    key={page}
                    onClick={() => onChangePage(page)}
                    className={`px-3 py-1 rounded-lg ${
                        page === meta.current_page ? 'bg-primary-soft text-primary shadow-card' : 'bg-surface-muted hover:bg-surface-strong'
                    }`}
                >
                    {page}
                </button>
            ))}
        </div>
    );
};

const ConfigSummary = ({ config, statuses, fields }) => (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-100/50 text-sm text-gray-600 space-y-3">
        <h3 className="text-lg font-semibold text-white">Tóm tắt cấu hình</h3>
        <div className="grid md:grid-cols-3 gap-4">
            <div>
                <h4 className="text-xs uppercase text-gray-400 mb-1">Webhook</h4>
                <p>Method: <span className="text-white uppercase">{config?.webhook?.method || 'post'}</span></p>
                <p className="truncate">URL: {config?.webhook?.url || 'Chưa thiết lập'}</p>
                <p>Status triggers: {(config?.webhook?.status_triggers || []).join(', ') || 'Chưa chọn'}</p>
            </div>
            <div>
                <h4 className="text-xs uppercase text-gray-400 mb-1">Callback</h4>
                <p>Method: {config?.callback?.method?.toUpperCase() || 'POST'}</p>
                <p>Path: {config?.callback?.path || 'Chưa thiết lập'}</p>
                <p>Bảo mật: {config?.callback?.token ? 'Yêu cầu token' : 'Không'}</p>
            </div>
            <div>
                <h4 className="text-xs uppercase text-gray-400 mb-1">Thông tin khác</h4>
                <p>{fields?.filter((f) => f.group === 'input').length || 0} input field</p>
                <p>{fields?.filter((f) => f.group === 'output').length || 0} output field</p>
                <p>{statuses?.length || 0} trạng thái</p>
            </div>
        </div>
    </div>
);

const TopicModal = ({ onClose, onSubmit, form, setForm, saving, isEditing }) => {
    const handleChange = (field) => (event) => {
        const value = event.target.value;
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    return (
        <Modal onClose={onClose} title={isEditing ? 'Chỉnh sửa chủ đề' : 'Thêm chủ đề mới'}>
            <form onSubmit={onSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-secondary mb-1">Tên chủ đề *</label>
                    <input
                        type="text"
                        required
                        value={form.name}
                        onChange={handleChange('name')}
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-subtle text-secondary focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Ví dụ: Automation Marketing"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-secondary mb-1">Mô tả</label>
                    <textarea
                        value={form.description}
                        onChange={handleChange('description')}
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-subtle text-secondary focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={3}
                        placeholder="Mô tả ngắn gọn về chủ đề"
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="btn btn-muted text-sm px-4 py-2">
                        Huỷ
                    </button>
                    <button type="submit" disabled={saving} className="btn btn-primary text-sm px-4 py-2">
                        {saving ? 'Đang lưu...' : isEditing ? 'Cập nhật' : 'Tạo mới'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

const TableModal = ({ onClose, onSubmit, topicName, initialForm = { name: '', description: '' }, isEditing = false }) => {
    const [form, setForm] = useState(initialForm);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setForm(initialForm);
    }, [initialForm]);

    const handleChange = (field) => (event) => {
        const value = event.target.value;
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!form.name.trim()) {
            alert('Vui lòng nhập tên bảng.');
            return;
        }
        setSaving(true);
        try {
            await onSubmit({
                name: form.name.trim(),
                description: form.description?.trim() || '',
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal onClose={onClose} title={isEditing ? 'Chỉnh sửa bảng automation' : 'Thêm bảng automation'}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {topicName && (
                    <div className="text-sm text-muted">
                        Thuộc chủ đề: <span className="text-primary font-semibold">{topicName}</span>
                    </div>
                )}
                <div>
                    <label className="block text-sm font-medium text-secondary mb-1">Tên bảng *</label>
                    <input
                        type="text"
                        required
                        value={form.name}
                        onChange={handleChange('name')}
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-subtle text-secondary focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Ví dụ: Automation Marketing AI"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-secondary mb-1">Mô tả</label>
                    <textarea
                        value={form.description}
                        onChange={handleChange('description')}
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-subtle text-secondary focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={3}
                        placeholder="Mô tả ngắn về mục đích của bảng"
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn btn-muted text-sm px-4 py-2"
                    >
                        Huỷ
                    </button>
                    <button type="submit" disabled={saving} className="btn btn-primary text-sm px-4 py-2">
                        {saving ? 'Đang lưu...' : isEditing ? 'Cập nhật' : 'Tạo mới'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

const ConfigModal = ({ table, onClose, onSubmit }) => {
    const [form, setForm] = useState(() => JSON.parse(JSON.stringify(table.config || DEFAULT_CONFIG)));
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSubmit(form);
        setSaving(false);
    };

    const handleWebhookChange = (key, value) => {
        setForm((prev) => ({
            ...prev,
            webhook: {
                ...prev.webhook,
                [key]: value,
            },
        }));
    };

    const handleAuthorizationChange = (key, value) => {
        setForm((prev) => ({
            ...prev,
            webhook: {
                ...prev.webhook,
                authorization: {
                    ...prev.webhook.authorization,
                    [key]: value,
                },
            },
        }));
    };

    const handleFieldsSelection = (group, key) => {
        setForm((prev) => {
            const current = prev.webhook.fields[group] || [];
            const exists = current.includes(key);
            const updated = exists ? current.filter((item) => item !== key) : [...current, key];
            return {
                ...prev,
                webhook: {
                    ...prev.webhook,
                    fields: {
                        ...prev.webhook.fields,
                        [group]: updated,
                    },
                },
            };
        });
    };

    const toggleStatusTrigger = (value) => {
        setForm((prev) => {
            const current = prev.webhook.status_triggers || [];
            const exists = current.includes(value);
            return {
                ...prev,
                webhook: {
                    ...prev.webhook,
                    status_triggers: exists ? current.filter((item) => item !== value) : [...current, value],
                },
            };
        });
    };

    return (
        <Modal onClose={onClose} title="Cấu hình webhook & callback">
            <form onSubmit={handleSubmit} className="space-y-4 text-sm text-gray-600">
                <section className="space-y-3">
                    <h4 className="text-gray-600 font-semibold">Webhook</h4>
                    <div className="grid md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs uppercase text-gray-400 mb-1">Method</label>
                            <select
                                value={form.webhook.method}
                                onChange={(e) => handleWebhookChange('method', e.target.value)}
                                className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                            >
                                <option value="post">POST</option>
                                <option value="get">GET</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs uppercase text-gray-400 mb-1">URL</label>
                            <input
                                type="url"
                                value={form.webhook.url}
                                onChange={(e) => handleWebhookChange('url', e.target.value)}
                                placeholder="https://example.com/webhook"
                                className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-gray-400 mb-1">Authorization</label>
                        <select
                            value={form.webhook.authorization.type}
                            onChange={(e) => handleAuthorizationChange('type', e.target.value)}
                            className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300 mb-2"
                        >
                            <option value="none">Không</option>
                            <option value="bearer">Bearer Token</option>
                            <option value="basic">Basic Auth</option>
                            <option value="api_key_header">API Key Header</option>
                            <option value="api_key_query">API Key Query</option>
                        </select>
                        {form.webhook.authorization.type === 'bearer' && (
                            <input
                                type="text"
                                value={form.webhook.authorization.token}
                                onChange={(e) => handleAuthorizationChange('token', e.target.value)}
                                placeholder="Bearer token"
                                className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                            />
                        )}
                        {form.webhook.authorization.type === 'basic' && (
                            <div className="grid md:grid-cols-2 gap-2">
                                <input
                                    type="text"
                                    value={form.webhook.authorization.username}
                                    onChange={(e) => handleAuthorizationChange('username', e.target.value)}
                                    placeholder="Username"
                                    className="px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                />
                                <input
                                    type="password"
                                    value={form.webhook.authorization.password}
                                    onChange={(e) => handleAuthorizationChange('password', e.target.value)}
                                    placeholder="Password"
                                    className="px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                />
                            </div>
                        )}
                        {form.webhook.authorization.type === 'api_key_header' && (
                            <div className="grid md:grid-cols-2 gap-2">
                                <input
                                    type="text"
                                    value={form.webhook.authorization.header_name}
                                    onChange={(e) => handleAuthorizationChange('header_name', e.target.value)}
                                    placeholder="Header name"
                                    className="px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                />
                                <input
                                    type="text"
                                    value={form.webhook.authorization.token}
                                    onChange={(e) => handleAuthorizationChange('token', e.target.value)}
                                    placeholder="API key"
                                    className="px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                />
                            </div>
                        )}
                        {form.webhook.authorization.type === 'api_key_query' && (
                            <div className="grid md:grid-cols-2 gap-2">
                                <input
                                    type="text"
                                    value={form.webhook.authorization.query_name}
                                    onChange={(e) => handleAuthorizationChange('query_name', e.target.value)}
                                    placeholder="Query name"
                                    className="px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                />
                                <input
                                    type="text"
                                    value={form.webhook.authorization.token}
                                    onChange={(e) => handleAuthorizationChange('token', e.target.value)}
                                    placeholder="API key"
                                    className="px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                />
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-gray-400 mb-1">Status trigger</label>
                        <div className="flex flex-wrap gap-2">
                            {table.statuses.map((status) => {
                                const active = form.webhook.status_triggers.includes(status.value);
                                const color = status.color || '#2563eb';
                                const activeStyle = active
                                    ? {
                                          backgroundColor: color,
                                          color: '#ffffff',
                                          borderColor: color,
                                      }
                                    : {};
                                return (
                                    <button
                                        key={status.id}
                                        type="button"
                                        onClick={() => toggleStatusTrigger(status.value)}
                                        style={activeStyle}
                                        className={`px-3 py-1 rounded-full text-xs border transition ${
                                            active
                                                ? 'shadow-card'
                                                : 'bg-surface-muted text-muted border-subtle hover:bg-surface-strong hover:text-primary'
                                        }`}
                                    >
                                        {status.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <label className="flex items-center space-x-2 text-sm">
                        <input
                            type="checkbox"
                            checked={form.webhook.fields.include_status}
                            onChange={(e) =>
                                setForm((prev) => ({
                                    ...prev,
                                    webhook: {
                                        ...prev.webhook,
                                        fields: {
                                            ...prev.webhook.fields,
                                            include_status: e.target.checked,
                                        },
                                    },
                                }))
                            }
                            className="rounded border-gray-300"
                        />
                        <span>Gửi thông tin status trong payload</span>
                    </label>
                    <div className="grid md:grid-cols-2 gap-3">
                        <fieldset className="border border-gray-300 rounded p-3">
                            <legend className="px-1 text-xs uppercase text-gray-400">Input fields</legend>
                            <div className="space-y-2">
                                {table.fields
                                    .filter((field) => field.group === 'input')
                                    .map((field) => (
                                        <label key={field.id} className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                checked={form.webhook.fields.input.includes(field.key)}
                                                onChange={() => handleFieldsSelection('input', field.key)}
                                                className="rounded border-gray-300"
                                            />
                                            <span>{field.label}</span>
                                        </label>
                                    ))}
                            </div>
                        </fieldset>
                        <fieldset className="border border-gray-300 rounded p-3">
                            <legend className="px-1 text-xs uppercase text-gray-400">Output fields</legend>
                            <div className="space-y-2">
                                {table.fields
                                    .filter((field) => field.group === 'output')
                                    .map((field) => (
                                        <label key={field.id} className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                checked={form.webhook.fields.output.includes(field.key)}
                                                onChange={() => handleFieldsSelection('output', field.key)}
                                                className="rounded border-gray-300"
                                            />
                                            <span>{field.label}</span>
                                        </label>
                                    ))}
                            </div>
                        </fieldset>
                    </div>
                </section>

                <section className="space-y-3">
                    <h4 className="text-gray-600 font-semibold">Callback</h4>
                    <div className="grid md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs uppercase text-gray-400 mb-1">Method</label>
                            <select
                                value={form.callback.method}
                                onChange={(e) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        callback: {
                                            ...prev.callback,
                                            method: e.target.value,
                                        },
                                    }))
                                }
                                className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                            >
                                <option value="post">POST</option>
                                <option value="get">GET</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs uppercase text-gray-400 mb-1">Path</label>
                            <input
                                type="text"
                                value={form.callback.path}
                                onChange={(e) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        callback: {
                                            ...prev.callback,
                                            path: e.target.value,
                                        },
                                    }))
                                }
                                placeholder="Ví dụ: callback"
                                className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                URL callback thực tế sẽ là <span className="font-mono">/automation-{table.slug}/{form.callback.path || 'path'}/&lt;uuid&gt;</span>
                            </p>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-gray-400 mb-1">Token bảo mật (tùy chọn)</label>
                        <input
                            type="text"
                            value={form.callback.token}
                            onChange={(e) =>
                                setForm((prev) => ({
                                    ...prev,
                                    callback: {
                                        ...prev.callback,
                                        token: e.target.value,
                                    },
                                }))
                            }
                            placeholder="Giữ trống nếu không cần"
                            className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                        />
                        <p className="text-xs text-gray-500 mt-1">Callback nên gửi header <code className="font-mono">X-Automation-Callback-Token</code> hoặc Bearer token để xác thực.</p>
                    </div>
                </section>

                <div className="flex justify-end space-x-2">
                    <button type="button" onClick={onClose} className="btn btn-muted text-sm px-4 py-2">
                        Đóng
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="btn btn-primary text-sm px-4 py-2 disabled:opacity-50"
                    >
                        {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

const FieldManagerModal = ({ table, editingField, onClose, onEdit, onSave, onDelete, onReorder }) => {
    const initialFieldState = {
        label: '',
        key: '',
        group: 'input',
        data_type: 'string',
        is_required: false,
        display_order: table.fields.length,
        is_active: true,
    };

    const [form, setForm] = useState(editingField || initialFieldState);
    const [fieldList, setFieldList] = useState(() =>
        [...table.fields].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    );
    const [draggingFieldId, setDraggingFieldId] = useState(null);

    useEffect(() => {
        setFieldList([...table.fields].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)));
    }, [table.fields]);

    useEffect(() => {
        if (editingField) {
            setForm(editingField);
        } else {
            setForm({
                ...initialFieldState,
                display_order: fieldList.length,
            });
        }
    }, [editingField, fieldList.length]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        await onSave({
            ...form,
            display_order: form.display_order ?? fieldList.length,
            is_active: form.is_active ?? true,
        });
    };

    const handleDeleteField = async (field, event) => {
        event.stopPropagation();
        await onDelete(field.id);
    };

    const handleDragStart = (event, fieldId) => {
        setDraggingFieldId(fieldId);
        event.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (event, overFieldId) => {
        event.preventDefault();
        if (draggingFieldId === null || draggingFieldId === overFieldId) {
            return;
        }

        setFieldList((prev) => {
            const currentIndex = prev.findIndex((field) => field.id === draggingFieldId);
            const overIndex = prev.findIndex((field) => field.id === overFieldId);
            if (currentIndex === -1 || overIndex === -1) return prev;

            const updated = [...prev];
            const [moved] = updated.splice(currentIndex, 1);
            updated.splice(overIndex, 0, moved);
            return updated;
        });
    };

    const handleDragEnd = async () => {
        if (draggingFieldId === null) return;
        const ordered = fieldList.map((field, index) => ({
            ...field,
            display_order: index,
        }));
        setDraggingFieldId(null);
        if (onReorder) {
            await onReorder(ordered);
        }
    };

    return (
        <Modal onClose={onClose} title="Quản lý field">
            <div className="grid md:grid-cols-5 gap-4">
                <div className="md:col-span-2 space-y-3">
                    <h4 className="text-gray-600 font-semibold text-sm">Danh sách field</h4>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {fieldList.map((field) => (
                            <div
                                key={field.id}
                                draggable
                                onDragStart={(event) => handleDragStart(event, field.id)}
                                onDragOver={(event) => handleDragOver(event, field.id)}
                                onDragEnd={handleDragEnd}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition ${
                                    editingField?.id === field.id ? 'border-blue-400 bg-primary-soft' : 'border-subtle bg-surface-muted hover:bg-surface-strong'
                                }`}
                            >
                                <button
                                    onClick={() => onEdit(field)}
                                    className="flex-1 text-left"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-secondary">{field.label}</span>
                                        <span className="text-xs text-muted uppercase">{field.group}</span>
                                    </div>
                                    <div className="text-xs text-muted font-mono">{field.key}</div>
                                </button>
                                <button
                                    onClick={(event) => handleDeleteField(field, event)}
                                    className="text-muted hover:text-danger"
                                    title="Xoá field"
                                >
                                    ✕
                                </button>
                                <span className="cursor-grab text-muted select-none">⠿</span>
                            </div>
                        ))}
                        {fieldList.length === 0 && <p className="text-gray-500 text-sm">Chưa có field nào.</p>}
                    </div>
                </div>
                <div className="md:col-span-3">
                    <h4 className="text-gray-600 font-semibold text-sm mb-3">{editingField ? 'Chỉnh sửa field' : 'Thêm field mới'}</h4>
                    <form onSubmit={handleSubmit} className="space-y-3 text-sm text-gray-600">
                        <div>
                            <label className="block text-xs uppercase text-gray-400 mb-1">Label</label>
                            <input
                                type="text"
                                value={form.label}
                                onChange={(e) => setForm({ ...form, label: e.target.value })}
                                required
                                className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                            />
                        </div>
                        <div>
                            <label className="block text-xs uppercase text-gray-400 mb-1">Key</label>
                            <input
                                type="text"
                                value={form.key}
                                onChange={(e) => setForm({ ...form, key: e.target.value.trim() })}
                                required
                                className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                placeholder="vi-du-key"
                            />
                        </div>
                        <div className="grid md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs uppercase text-gray-400 mb-1">Group</label>
                                <select
                                    value={form.group}
                                    onChange={(e) => setForm({ ...form, group: e.target.value })}
                                    className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                >
                                    <option value="input">Input</option>
                                    <option value="output">Output</option>
                                    <option value="meta">Meta</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs uppercase text-gray-400 mb-1">Data type</label>
                                <input
                                    type="text"
                                    value={form.data_type || ''}
                                    onChange={(e) => setForm({ ...form, data_type: e.target.value })}
                                    className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                />
                            </div>
                        </div>
                        <div className="text-xs text-gray-600 space-y-3">
                            <div className="space-y-1">
                                <span className="block text-xs uppercase text-gray-400">Bắt buộc</span>
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center space-x-2">
                                        <input
                                            type="radio"
                                            name={`field-required-${table.id}`}
                                            checked={!!form.is_required}
                                            onChange={() => setForm({ ...form, is_required: true })}
                                            className="rounded border-gray-300"
                                        />
                                        <span>Có</span>
                                    </label>
                                    <label className="flex items-center space-x-2">
                                        <input
                                            type="radio"
                                            name={`field-required-${table.id}`}
                                            checked={!form.is_required}
                                            onChange={() => setForm({ ...form, is_required: false })}
                                            className="rounded border-gray-300"
                                        />
                                        <span>Không</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end space-x-2">
                            <button type="button" onClick={onClose} className="btn btn-muted text-sm px-4 py-2">
                                Đóng
                            </button>
                            <button type="submit" className="btn btn-primary text-sm px-4 py-2">
                                {editingField ? 'Cập nhật' : 'Thêm mới'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Modal>
    );
};

const StatusManagerModal = ({ table, editingStatus, onClose, onEdit, onSave, onDelete, onReorder }) => {
    const initialFormState = {
        label: '',
        value: '',
        color: '#34d399',
        is_default: false,
        is_terminal: false,
        sort_order: table.statuses.length,
    };
    const [form, setForm] = useState(editingStatus || initialFormState);
    const [statusList, setStatusList] = useState(() =>
        [...table.statuses].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    );
    const [draggingStatusId, setDraggingStatusId] = useState(null);

    useEffect(() => {
        setStatusList([...table.statuses].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
    }, [table.statuses]);

    useEffect(() => {
        if (editingStatus) {
            setForm(editingStatus);
        } else {
            setForm({
                ...initialFormState,
                sort_order: statusList.length,
            });
        }
    }, [editingStatus, statusList.length]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        await onSave({
            ...form,
            color: form.color || null,
        });
    };

    const handleStatusClick = (status) => {
        onEdit(status);
    };

    const handleDeleteClick = async (status, event) => {
        event.stopPropagation();
        await onDelete(status.id);
    };

    const handleDragStart = (event, statusId) => {
        setDraggingStatusId(statusId);
        event.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (event, overStatusId) => {
        event.preventDefault();
        if (draggingStatusId === null || draggingStatusId === overStatusId) {
            return;
        }

        setStatusList((prev) => {
            const currentIndex = prev.findIndex((status) => status.id === draggingStatusId);
            const overIndex = prev.findIndex((status) => status.id === overStatusId);
            if (currentIndex === -1 || overIndex === -1) return prev;

            const updated = [...prev];
            const [moved] = updated.splice(currentIndex, 1);
            updated.splice(overIndex, 0, moved);
            return updated;
        });
    };

    const handleDragEnd = async () => {
        if (draggingStatusId === null) return;
        const ordered = statusList.map((status, index) => ({
            ...status,
            sort_order: index,
        }));
        setDraggingStatusId(null);
        if (onReorder) {
            await onReorder(ordered);
        }
    };

    const handleColorChange = (value) => {
        setForm((prev) => ({ ...prev, color: value }));
    };

    return (
        <Modal onClose={onClose} title="Quản lý trạng thái">
            <div className="grid md:grid-cols-5 gap-4">
                <div className="md:col-span-2 space-y-2 max-h-72 overflow-y-auto pr-1">
                    {statusList.map((status) => {
                        const isActive = editingStatus?.id === status.id;
                        return (
                            <div
                                key={status.id}
                                draggable
                                onDragStart={(event) => handleDragStart(event, status.id)}
                                onDragOver={(event) => handleDragOver(event, status.id)}
                                onDragEnd={handleDragEnd}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition ${
                                    isActive ? 'border-blue-400 bg-primary-soft' : 'border-subtle bg-surface-muted hover:bg-surface-strong'
                                }`}
                            >
                                <span
                                    className="w-2.5 h-2.5 rounded-full border border-subtle"
                                    style={{ backgroundColor: status.color || '#d1d5db' }}
                                />
                                <button
                                    onClick={() => handleStatusClick(status)}
                                    className="flex-1 text-left"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-secondary">{status.label}</span>
                                        <span className="text-xs uppercase text-muted">{status.value}</span>
                                    </div>
                                    <div className="text-[11px] text-muted flex items-center gap-2">
                                        {status.is_default && <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600">Default</span>}
                                        {status.is_terminal && <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-600">Terminal</span>}
                                    </div>
                                </button>
                                <button
                                    onClick={(event) => handleDeleteClick(status, event)}
                                    className="text-muted hover:text-danger"
                                    title="Xoá trạng thái"
                                >
                                    ✕
                                </button>
                                <span className="cursor-grab text-muted select-none">⠿</span>
                            </div>
                        );
                    })}
                    {statusList.length === 0 && <p className="text-gray-500 text-sm">Chưa có trạng thái.</p>}
                </div>
                <div className="md:col-span-3">
                    <h4 className="text-gray-600 font-semibold text-sm mb-3">{editingStatus ? 'Chỉnh sửa' : 'Thêm trạng thái mới'}</h4>
                    <form onSubmit={handleSubmit} className="space-y-3 text-sm text-gray-600">
                        <div>
                            <label className="block text-xs uppercase text-gray-400 mb-1">Label</label>
                            <input
                                type="text"
                                value={form.label}
                                onChange={(e) => setForm({ ...form, label: e.target.value })}
                                required
                                className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                            />
                        </div>
                        <div>
                            <label className="block text-xs uppercase text-gray-400 mb-1">Value</label>
                            <input
                                type="text"
                                value={form.value || ''}
                                onChange={(e) => setForm({ ...form, value: e.target.value })}
                                className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                placeholder="Tự động sinh nếu để trống"
                            />
                        </div>
                        <div className="grid md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs uppercase text-gray-400 mb-1">Màu hiển thị</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={form.color || '#34d399'}
                                        onChange={(e) => handleColorChange(e.target.value)}
                                        className="w-12 h-10 border border-subtle rounded"
                                    />
                                    <input
                                        type="text" readOnly
                                        value={form.color || ''}
                                        onChange={(e) => handleColorChange(e.target.value)}
                                        className="flex-1 px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                        placeholder="#34d399"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs uppercase text-gray-400 mb-1">Thứ tự</label>
                                <input
                                    type="number"
                                    value={form.sort_order ?? 0}
                                    onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                                    className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end space-x-2">
                            <button type="button" onClick={onClose} className="btn btn-muted text-sm px-4 py-2">
                                Đóng
                            </button>
                            <button type="submit" className="btn btn-primary text-sm px-4 py-2">
                                {editingStatus ? 'Cập nhật' : 'Thêm mới'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Modal>
    );
};

const RowModal = ({ table, rowDraft, onClose, onSave }) => {
    const [form, setForm] = useState(() => ({
        input_data: rowDraft?.input_data || {},
        output_data: rowDraft?.output_data || {},
        meta_data: rowDraft?.meta_data || {},
        status_value: rowDraft?.status?.value || table.statuses.find((st) => st.is_default)?.value,
        external_reference: rowDraft?.external_reference || '',
    }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (rowDraft) {
            await onSave(rowDraft.id, form);
        } else {
            await onSave(form);
        }
        onClose();
    };

    const handleChange = (group, key, value) => {
        setForm((prev) => ({
            ...prev,
            [group]: {
                ...(prev[group] || {}),
                [key]: value,
            },
        }));
    };

    return (
        <Modal onClose={onClose} title={rowDraft ? 'Cập nhật dòng' : 'Thêm dòng mới'}>
            <form onSubmit={handleSubmit} className="space-y-4 text-sm text-gray-600">
                <div className="grid md:grid-cols-2 gap-4">
                    <fieldset className="space-y-2">
                        <legend className="text-xs uppercase text-gray-400">Input</legend>
                        {table.fields
                            .filter((field) => field.group === 'input')
                            .map((field) => (
                                <div key={field.id}>
                                    <label className="block text-xs uppercase text-gray-400 mb-1">{field.label}</label>
                                    <input
                                        type="text"
                                        value={form.input_data[field.key] ?? ''}
                                        onChange={(e) => handleChange('input_data', field.key, e.target.value)}
                                        className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                        placeholder={field.label}
                                    />
                                </div>
                            ))}
                    </fieldset>
                    <fieldset className="space-y-2">
                        <legend className="text-xs uppercase text-gray-400">Output</legend>
                        {table.fields
                            .filter((field) => field.group === 'output')
                            .map((field) => (
                                <div key={field.id}>
                                    <label className="block text-xs uppercase text-gray-400 mb-1">{field.label}</label>
                                    <input
                                        type="text"
                                        value={form.output_data[field.key] ?? ''}
                                        onChange={(e) => handleChange('output_data', field.key, e.target.value)}
                                        className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                        placeholder={field.label}
                                    />
                                </div>
                            ))}
                    </fieldset>
                </div>
                <fieldset className="space-y-2">
                    <legend className="text-xs uppercase text-gray-400">Meta</legend>
                    {table.fields
                        .filter((field) => field.group === 'meta')
                        .map((field) => (
                            <div key={field.id}>
                                <label className="block text-xs uppercase text-gray-400 mb-1">{field.label}</label>
                                <input
                                    type="text"
                                    value={form.meta_data[field.key] ?? ''}
                                    onChange={(e) => handleChange('meta_data', field.key, e.target.value)}
                                    className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                                    placeholder={field.label}
                                />
                            </div>
                        ))}
                </fieldset>
                <div className="grid md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs uppercase text-gray-400 mb-1">Status</label>
                        <select
                            value={form.status_value || ''}
                            onChange={(e) => setForm((prev) => ({ ...prev, status_value: e.target.value }))}
                            className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                        >
                            {table.statuses.map((status) => (
                                <option key={status.id} value={status.value}>
                                    {status.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-gray-400 mb-1">External reference</label>
                        <input
                            type="text"
                            value={form.external_reference}
                            onChange={(e) => setForm((prev) => ({ ...prev, external_reference: e.target.value }))}
                            className="w-full px-3 py-2 rounded bg-gray-100 border border-gray-300"
                            placeholder="ID tham chiếu ngoài (nếu có)"
                        />
                    </div>
                </div>
                <div className="flex justify-end space-x-2">
                    <button type="button" onClick={onClose} className="btn btn-muted text-sm px-4 py-2">
                        Huỷ
                    </button>
                    <button type="submit" className="btn btn-primary text-sm px-4 py-2">
                        {rowDraft ? 'Cập nhật' : 'Thêm dòng'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

const Modal = ({ children, onClose, title }) => (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
        <div className="bg-surface-elevated rounded-2xl shadow-card w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-subtle">
            <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
                <h3 className="text-lg font-semibold text-primary">{title}</h3>
                <button onClick={onClose} className="text-muted hover:text-primary">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div className="p-6">{children}</div>
        </div>
    </div>
);

const formatValue = (value) => {
    if (value === null || value === undefined || value === '') {
        return <span className="text-muted">—</span>;
    }
    if (typeof value === 'object') {
        return <pre className="bg-surface-muted text-xs p-2 rounded-xl text-secondary overflow-x-auto">{JSON.stringify(value, null, 2)}</pre>;
    }
    return String(value);
};

export default AutomationTablesTab;

export {
    RowsToolbar,
    RowsTable,
    StatusBadge,
    RowExpandedContent,
    Pagination,
    ConfigSummary,
    RowModal,
    Modal,
    formatValue,
};

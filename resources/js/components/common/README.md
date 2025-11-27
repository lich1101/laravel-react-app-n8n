# Shared Components và Hooks cho Config Modals

Thư mục này chứa các components và hooks có thể tái sử dụng cho tất cả config modals, giúp loại bỏ code lặp lại.

## Cấu trúc

### Hooks
- **`useConfigModal`** (`../utils/hooks/useConfigModal.js`) - Custom hook quản lý logic chung:
  - Test state (isTesting, testResults)
  - View modes (inputViewMode, outputViewMode)
  - Collapsed paths
  - Handlers (handleTest, handleSave, handleClose, handleStopTest)

### Components
- **`ConfigModalLayout`** - Wrapper cho modal structure chung (header, body, footer)
- **`ModalHeader`** - Header với rename functionality
- **`TestResultViewer`** - Component hiển thị input/output với view mode switching
- **`JSONViewer`** - Component hiển thị JSON với draggable variables

## Cách sử dụng

### Ví dụ: Refactor một Config Modal

**Trước (621 dòng code):**
```jsx
function EscapeConfigModal({ node, onSave, onClose, onTest, ... }) {
    const [testResults, setTestResults] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    // ... nhiều logic lặp lại ...
    
    return (
        <div className="fixed inset-0 ...">
            {/* Header code lặp lại */}
            {/* Test logic lặp lại */}
            {/* JSON viewer code lặp lại */}
        </div>
    );
}
```

**Sau (~200 dòng code):**
```jsx
import { useConfigModal } from '../utils/hooks/useConfigModal';
import ConfigModalLayout from './common/ConfigModalLayout';
import TestResultViewer from './common/TestResultViewer';

function EscapeConfigModal({ node, onSave, onClose, onTest, ... }) {
    const [config, setConfig] = useState({ /* chỉ config cụ thể */ });
    
    // Sử dụng hook cho logic chung
    const {
        isTesting,
        inputViewMode,
        outputViewMode,
        displayOutput,
        handleClose,
        handleTest,
        // ...
    } = useConfigModal({
        onTest,
        onSave: () => onSave(config),
        onClose,
        node,
        config,
        inputData,
        outputData,
        readOnly
    });
    
    return (
        <ConfigModalLayout
            node={node}
            onRename={onRename}
            onClose={handleClose}
            title="Escape"
            icon="⚡"
            readOnly={readOnly}
            isTesting={isTesting}
            testButtons={/* test buttons */}
        >
            <TestResultViewer
                data={inputData}
                viewMode={inputViewMode}
                onViewModeChange={setInputViewMode}
                title="INPUT"
            />
            {/* Config panel cụ thể */}
            <TestResultViewer
                data={displayOutput}
                viewMode={outputViewMode}
                onViewModeChange={setOutputViewMode}
                title="OUTPUT"
            />
        </ConfigModalLayout>
    );
}
```

## Lợi ích

1. **Giảm code lặp lại**: Từ ~621 dòng xuống ~200 dòng cho mỗi modal
2. **Dễ bảo trì**: Logic chung chỉ cần sửa ở một nơi
3. **Consistency**: Tất cả modals có UI/UX nhất quán
4. **Dễ test**: Logic chung được test một lần
5. **Tái sử dụng**: Dễ dàng tạo modal mới

## Migration Guide

Để refactor một modal hiện có:

1. Import các components/hooks cần thiết
2. Thay thế state management bằng `useConfigModal` hook
3. Thay thế modal wrapper bằng `ConfigModalLayout`
4. Thay thế input/output viewers bằng `TestResultViewer`
5. Xóa code lặp lại (test logic, JSON viewer, header, etc.)
6. Giữ lại chỉ logic/config cụ thể của modal đó

## Components API

### useConfigModal(props)
```jsx
const modalState = useConfigModal({
    onTest,        // Function to test
    onSave,        // Function to save config
    onClose,       // Function to close modal
    onTestResult,  // Callback when test completes
    node,          // Node object
    config,        // Current config state
    inputData,     // Input data for testing
    outputData,    // Output data to display
    readOnly       // Read-only mode
});
```

### ConfigModalLayout(props)
```jsx
<ConfigModalLayout
    node={node}
    onRename={onRename}
    onClose={handleClose}
    title="Modal Title"
    icon="⚡"
    readOnly={readOnly}
    isTesting={isTesting}
    testButtons={<TestButtons />}
    size="default" // 'default' | 'large' | 'extra-large'
>
    {children}
</ConfigModalLayout>
```

### TestResultViewer(props)
```jsx
<TestResultViewer
    data={inputData}
    viewMode={inputViewMode}
    onViewModeChange={setInputViewMode}
    collapsedPaths={collapsedPaths}
    onToggleCollapse={togglePathCollapse}
    title="INPUT"
    emptyState={<EmptyState />}
/>
```


# Cơ Chế Thực Thi Workflow

Tài liệu này giải thích chi tiết cách hệ thống thực thi workflow: làm thế nào một node chạy xong và tự động chuyển sang chạy node tiếp theo.

## Tổng Quan

Workflow execution là quá trình tuần tự chạy các node theo thứ tự được xác định trước. Mỗi node nhận input từ các node cha (upstream nodes) và tạo output để truyền cho các node con (downstream nodes).

```
[Trigger Node] → [Node 1] → [Node 2] → [Node 3] → ...
```

## Quy Trình Thực Thi

### Bước 1: Xác Định Thứ Tự Thực Thi (Topological Sort)

**File:** `app/Http/Controllers/Api/WebhookController.php`  
**Method:** `buildExecutionOrder($nodes, $edges)`

Trước khi chạy workflow, hệ thống phải xác định thứ tự chạy các node. Đây là bước quan trọng vì:

- Một node chỉ có thể chạy sau khi TẤT CẢ các node cha (dependencies) đã hoàn thành
- Hệ thống sử dụng thuật toán **Topological Sort** để sắp xếp

#### Các bước trong `buildExecutionOrder()`:

1. **Tìm Trigger Node:**
   - Ưu tiên: Schedule node → Webhook node
   - Nếu không có, tìm node không có edge vào (starting node)

2. **Xây dựng Dependency Graph:**
   ```php
   // Với mỗi edge: source → target
   // Node target phụ thuộc vào node source
   $dependencies[$targetId][] = $sourceId;
   ```

3. **Topological Sort:**
   ```php
   // Lặp cho đến khi tất cả node được thêm vào thứ tự
   while (count($order) < count($reachableNodes)) {
       // Tìm node nào có TẤT CẢ dependencies đã hoàn thành
       foreach ($nodes as $nodeId) {
           if (ALL dependencies completed) {
               $order[] = $node; // Thêm vào thứ tự
               $completed[] = $nodeId;
           }
       }
   }
   ```

**Ví dụ:**
```
Node A (trigger) → Node B
                ↓
              Node C → Node D
```

Thứ tự thực thi: `[A, B, C, D]` hoặc `[A, C, B, D]` (B và C có thể chạy song song nếu không phụ thuộc nhau)

### Bước 2: Vòng Lặp Thực Thi Tuần Tự

**File:** `app/Http/Controllers/Api/WebhookController.php`  
**Method:** `executeWorkflow($workflow, $webhookRequest, ...)`

Sau khi có thứ tự, hệ thống chạy từng node trong vòng lặp:

```php
// Khởi tạo biến lưu output
$nodeOutputs = []; // Lưu output của từng node

// Loop qua từng node theo thứ tự đã sắp xếp
foreach ($executionOrder as $index => $node) {
    
    // Bước 2.1: Lấy input từ các node cha
    $inputData = $this->getNodeInputData(
        $node['id'], 
        $edges, 
        $nodeOutputs,  // ← Output của các node đã chạy
        $ifResults, 
        $nodes, 
        $switchResults
    );
    
    // Bước 2.2: Thực thi node với input
    $output = $this->executeNode($node, $inputData, $webhookRequest);
    
    // Bước 2.3: Lưu output vào $nodeOutputs
    $nodeOutputs[$node['id']] = $output;  // ← Lưu để node sau dùng
    
    // Bước 2.4: Xử lý đặc biệt cho If/Switch nodes
    if ($node['type'] === 'if') {
        $ifResults[$node['id']] = $output['result']; // Lưu kết quả true/false
    }
    
    // Bước 2.5: Tiếp tục vòng lặp với node tiếp theo
}
```

#### Quy Trình Chi Tiết:

1. **Lấy Input Data:**
   - Gọi `getNodeInputData()` để lấy output từ các node cha
   - Output đã được lưu trong `$nodeOutputs` từ các vòng lặp trước

2. **Thực Thi Node:**
   - Gọi `executeNode()` với input data
   - Node thực hiện logic của nó (HTTP request, AI call, code execution, etc.)

3. **Lưu Output:**
   - Lưu output vào `$nodeOutputs[$node['id']]`
   - Output này sẽ được dùng làm input cho các node con

4. **Tiếp Tục:**
   - Vòng lặp tự động chuyển sang node tiếp theo
   - Node tiếp theo sẽ lấy output từ `$nodeOutputs`

### Bước 3: Truyền Dữ Liệu Giữa Các Node

**File:** `app/Http/Controllers/Api/WebhookController.php`  
**Method:** `getNodeInputData($nodeId, $edges, $nodeOutputs, ...)`

Method này có nhiệm vụ lấy output từ các node cha và truyền vào node hiện tại.

#### Các bước:

1. **Tìm Parent Edges:**
   ```php
   // Tìm tất cả edge kết nối TO node hiện tại
   $parentEdges = collect($edges)
       ->filter(function ($edge) use ($nodeId) {
           return $edge['target'] === $nodeId; // Edge đi vào node này
       })
   ```

2. **Lấy Output Từ Parent Nodes:**
   ```php
   foreach ($parentEdges as $edge) {
       $parentId = $edge['source']; // Node cha
       
       // Lấy output đã được lưu từ vòng lặp trước
       $inputData[] = $nodeOutputs[$parentId];
   }
   ```

3. **Xử Lý Đặc Biệt Cho If/Switch Nodes:**
   
   **If Node:**
   ```php
   // Nếu parent là If node, chỉ lấy output nếu branch khớp
   if (isset($ifResults[$parentId])) {
       $expectedHandle = $ifResult ? 'true' : 'false';
       
       // Chỉ lấy output nếu sourceHandle khớp với kết quả If
       if ($sourceHandle === $expectedHandle) {
           $inputData[] = $nodeOutputs[$parentId];
       }
   }
   ```
   
   **Switch Node:**
   ```php
   // Nếu parent là Switch node, chỉ lấy output từ branch được chọn
   if (isset($switchResults[$parentId])) {
       $expectedHandle = "output{$matchedOutput}"; // output0, output1, ...
       
       if ($sourceHandle === $expectedHandle) {
           $inputData[] = $nodeOutputs[$parentId];
       }
   }
   ```

4. **Thu Thập Tất Cả Upstream Nodes:**
   ```php
   // Sử dụng BFS để tìm TẤT CẢ upstream nodes
   $allUpstreamIds = $this->collectAllUpstreamNodes($nodeId, $edges);
   
   // Tạo map nodeName => output để dùng trong {{NodeName.field}}
   foreach ($allUpstreamIds as $upstreamId) {
       $namedInputs[$nodeName] = $nodeOutputs[$upstreamId];
   }
   ```

## Luồng Dữ Liệu Chi Tiết

### Ví Dụ: Workflow Đơn Giản

```
[Webhook] → [HTTP Request] → [OpenAI] → [Code]
```

#### Execution Flow:

**Vòng lặp 1: Webhook Node**
```php
// Input: [] (không có parent)
$output = executeNode(webhook, [], $webhookRequest);
// Output: { body: {...}, headers: {...}, method: 'POST' }

$nodeOutputs['webhook-id'] = output; // ← LƯU OUTPUT
```

**Vòng lặp 2: HTTP Request Node**
```php
// Input: Lấy từ webhook (node cha)
$inputData = getNodeInputData('http-node-id', ...);
// → $inputData[0] = $nodeOutputs['webhook-id'] // Output của webhook

$output = executeNode(http, $inputData, ...);
// Output: { status: 200, body: {...}, headers: {...} }

$nodeOutputs['http-node-id'] = output; // ← LƯU OUTPUT
```

**Vòng lặp 3: OpenAI Node**
```php
// Input: Lấy từ HTTP Request (node cha)
$inputData = getNodeInputData('openai-node-id', ...);
// → $inputData[0] = $nodeOutputs['http-node-id'] // Output của HTTP
// → $inputData['Webhook'] = $nodeOutputs['webhook-id'] // Tất cả upstream

$output = executeNode(openai, $inputData, ...);
// Output: { choices: [...], model: 'gpt-4', ... }

$nodeOutputs['openai-node-id'] = output; // ← LƯU OUTPUT
```

**Vòng lặp 4: Code Node**
```php
// Input: Lấy từ OpenAI (node cha)
$inputData = getNodeInputData('code-node-id', ...);
// → $inputData[0] = $nodeOutputs['openai-node-id'] // Output của OpenAI
// → $inputData['HTTP Request'] = $nodeOutputs['http-node-id']
// → $inputData['Webhook'] = $nodeOutputs['webhook-id']

$output = executeNode(code, $inputData, ...);
// Output: { result: ... }

$nodeOutputs['code-node-id'] = output; // ← LƯU OUTPUT
```

## Cấu Trúc Dữ Liệu

### `$nodeOutputs` Array

```php
$nodeOutputs = [
    'node-1-id' => [
        'status' => 200,
        'body' => {...},
        'headers' => {...}
    ],
    'node-2-id' => [
        'choices' => [...],
        'model' => 'gpt-4'
    ],
    'node-3-id' => [
        'result' => {...}
    ]
];
```

### `$inputData` Cho Mỗi Node

```php
$inputData = [
    // Positional inputs (từ direct parents)
    0 => $nodeOutputs['parent-1'],
    1 => $nodeOutputs['parent-2'],
    
    // Named inputs (từ tất cả upstream nodes)
    'Parent Node 1' => $nodeOutputs['parent-1'],
    'Parent Node 2' => $nodeOutputs['parent-2'],
    'Upstream Node' => $nodeOutputs['upstream-id']
];
```

## Xử Lý Đặc Biệt

### If Node (Branch Routing)

```php
// Khi If node chạy xong
if ($node['type'] === 'if') {
    $ifResults[$node['id']] = $output['result']; // true hoặc false
}

// Khi node con lấy input
if (isset($ifResults[$parentId])) {
    $expectedHandle = $ifResult ? 'true' : 'false';
    
    // Chỉ lấy output nếu branch khớp
    if ($sourceHandle === $expectedHandle) {
        $inputData[] = $nodeOutputs[$parentId];
    }
}
```

**Ví dụ:**
```
[HTTP] → [If] → true → [Node A]
             → false → [Node B]
```

- Nếu If = true: chỉ Node A nhận input từ If
- Nếu If = false: chỉ Node B nhận input từ If

### Switch Node (Multiple Branches)

```php
// Khi Switch node chạy xong
if ($node['type'] === 'switch') {
    $switchResults[$node['id']] = $output['matchedOutput']; // 0, 1, 2, ... hoặc -1 (fallback)
}

// Khi node con lấy input
if (isset($switchResults[$parentId])) {
    $expectedHandle = $matchedOutput >= 0 ? "output{$matchedOutput}" : 'fallback';
    
    // Chỉ lấy output nếu branch khớp
    if ($sourceHandle === $expectedHandle) {
        $inputData[] = $nodeOutputs[$parentId];
    }
}
```

## Xử Lý Lỗi

```php
try {
    $output = $this->executeNode($node, $inputData, $webhookRequest);
    
    // Lưu output thành công
    $nodeOutputs[$node['id']] = $output;
    
} catch (\Exception $e) {
    // Lưu lỗi
    $nodeOutputs[$node['id']] = ['error' => $e->getMessage()];
    
    // DỪNG TOÀN BỘ WORKFLOW
    break; // ← Không chạy các node tiếp theo
}
```

**Khi có lỗi:**
- Lưu thông tin lỗi vào `$nodeOutputs`
- Dừng toàn bộ workflow (`break`)
- Các node sau sẽ KHÔNG được chạy

## Tóm Tắt

### Key Points:

1. **Topological Sort**: Xác định thứ tự chạy dựa trên dependencies
2. **Sequential Loop**: Chạy từng node theo thứ tự đã xác định
3. **Output Storage**: Output của mỗi node được lưu ngay vào `$nodeOutputs`
4. **Input Retrieval**: Node tiếp theo tự động lấy output từ `$nodeOutputs`
5. **Branch Routing**: If/Switch nodes chỉ truyền dữ liệu theo branch được chọn
6. **Error Handling**: Lỗi ở một node sẽ dừng toàn bộ workflow

### Flow Chart:

```
┌─────────────────────────────────────────┐
│  1. Trigger Workflow (Webhook/Schedule) │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  2. buildExecutionOrder()               │
│     → Topological Sort                  │
│     → Tạo thứ tự: [Node1, Node2, ...]  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  3. Loop qua từng node:                 │
│                                         │
│     FOR EACH node in executionOrder:   │
│       a. getNodeInputData()             │
│          → Lấy output từ $nodeOutputs  │
│       b. executeNode()                  │
│          → Chạy node với input         │
│       c. Lưu output vào $nodeOutputs   │
│       d. Tiếp tục node tiếp theo       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  4. Return Results                      │
│     → node_results                      │
│     → execution_order                   │
│     → error_node (nếu có)              │
└─────────────────────────────────────────┘
```

## Code References

- **buildExecutionOrder()**: `app/Http/Controllers/Api/WebhookController.php:560-726`
- **executeWorkflow()**: `app/Http/Controllers/Api/WebhookController.php:301-558`
- **getNodeInputData()**: `app/Http/Controllers/Api/WebhookController.php:728-854`
- **executeNode()**: `app/Http/Controllers/Api/WebhookController.php:893-949`

## FAQ

**Q: Làm sao node biết được output của node trước?**  
A: Output được lưu vào `$nodeOutputs` ngay sau khi node chạy xong. Node tiếp theo lấy từ đây.

**Q: Nếu có nhiều node cha, input sẽ như thế nào?**  
A: Input là mảng chứa output của tất cả node cha: `[output1, output2, ...]`

**Q: Nếu node có nhiều node con, output có được chia sẻ không?**  
A: Có, tất cả node con đều nhận cùng một output từ node cha (stored trong `$nodeOutputs`)

**Q: Làm sao If node chỉ truyền dữ liệu cho một branch?**  
A: Sử dụng `sourceHandle` của edge để match với kết quả If (`true` hoặc `false`)

**Q: Node có thể chạy song song không?**  
A: Hiện tại không. Hệ thống chạy tuần tự, nhưng Topological Sort đảm bảo node chỉ chạy sau khi dependencies xong.


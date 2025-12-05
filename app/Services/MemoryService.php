<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;

class MemoryService
{
    /**
     * Lấy memory từ cache theo ID và số lượng messages
     * 
     * @param string $memoryId ID của memory
     * @param int $limit Số lượng messages cần lấy
     * @return array Mảng các messages (user và assistant)
     */
    public function getMemory(string $memoryId, int $limit = 10): array
    {
        if (empty($memoryId)) {
            return [];
        }

        $cacheKey = "ai_memory:{$memoryId}";
        $memories = Cache::get($cacheKey, []);

        if (!is_array($memories)) {
            return [];
        }

        // Lấy N messages gần nhất (theo thứ tự thời gian)
        $memories = array_slice($memories, -$limit);

        return $memories;
    }

    /**
     * Lưu memory vào cache
     * 
     * @param string $memoryId ID của memory
     * @param string $userMessage Câu hỏi của user
     * @param string $assistantMessage Câu trả lời của assistant
     * @param int $maxMessages Số lượng messages tối đa được lưu (xóa các cái thừa)
     * @return bool
     */
    public function saveMemory(string $memoryId, string $userMessage, string $assistantMessage, int $maxMessages = 10): bool
    {
        if (empty($memoryId)) {
            return false;
        }

        $cacheKey = "ai_memory:{$memoryId}";
        $memories = Cache::get($cacheKey, []);

        if (!is_array($memories)) {
            $memories = [];
        }

        // Thêm memory mới
        $memories[] = [
            'user' => $userMessage,
            'assistant' => $assistantMessage,
            'timestamp' => now()->toIso8601String(),
        ];

        // Giới hạn số lượng messages, xóa các cái cũ nhất
        $beforeCount = count($memories);
        if ($beforeCount > $maxMessages) {
            $memories = array_slice($memories, -$maxMessages);
            $deletedCount = $beforeCount - count($memories);
            Log::info('Memory trimmed (old messages deleted)', [
                'memory_id' => $memoryId,
                'before_count' => $beforeCount,
                'after_count' => count($memories),
                'deleted_count' => $deletedCount,
                'max_messages' => $maxMessages,
            ]);
        }

        // Lưu vào cache (không hết hạn)
        Cache::forever($cacheKey, $memories);

        Log::info('Memory saved', [
            'memory_id' => $memoryId,
            'total_messages' => count($memories),
            'max_messages' => $maxMessages,
        ]);

        return true;
    }

    /**
     * Tóm tắt câu hỏi và câu trả lời bằng chính model AI đang sử dụng
     * 
     * @param string $userMessage Câu hỏi
     * @param string $assistantMessage Câu trả lời
     * @param string $modelType Loại model: 'openai', 'claude', 'perplexity', 'gemini'
     * @param int|null $credentialId ID của credential
     * @param string|null $modelName Tên model cụ thể (vd: 'gpt-4o', 'claude-3-5-sonnet-20241022')
     * @param string|null $assistantMessagePath Path động để extract assistant message (vd: 'choices[0].message.content')
     * @return array ['user' => string, 'assistant' => string]
     */
    public function summarizeMemory(string $userMessage, string $assistantMessage, string $modelType = null, ?int $credentialId = null, ?string $modelName = null, ?string $assistantMessagePath = null): array
    {
        // Nếu không có thông tin model hoặc credential, fallback về cách tóm tắt đơn giản
        if (empty($modelType) || empty($credentialId)) {
            return $this->simpleSummarize($userMessage, $assistantMessage);
        }

        try {
            // Tạo prompt tóm tắt
            $summarizePrompt = "Hãy tóm tắt ngắn gọn câu hỏi và câu trả lời sau đây, giữ lại thông tin quan trọng nhất. Trả về dạng JSON với 2 keys: 'user' (tóm tắt câu hỏi) và 'assistant' (tóm tắt câu trả lời). Mỗi phần tóm tắt không quá 300 từ.\n\n";
            $summarizePrompt .= "Câu hỏi: " . $userMessage . "\n\n";
            $summarizePrompt .= "Câu trả lời: " . $assistantMessage;

            // Gọi API tương ứng
            $summarized = $this->callAISummarize($modelType, $credentialId, $modelName, $summarizePrompt, $assistantMessagePath);
            
            if ($summarized && isset($summarized['user']) && isset($summarized['assistant'])) {
                return $summarized;
            }
        } catch (\Exception $e) {
            Log::warning('Failed to summarize using AI, falling back to simple summarize', [
                'error' => $e->getMessage(),
                'model_type' => $modelType,
            ]);
        }

        // Fallback về cách tóm tắt đơn giản nếu AI summarize thất bại
        return $this->simpleSummarize($userMessage, $assistantMessage);
    }

    /**
     * Tóm tắt đơn giản (fallback)
     */
    private function simpleSummarize(string $userMessage, string $assistantMessage): array
    {
        $maxLength = 500;
        
        $summarizedUser = mb_strlen($userMessage) > $maxLength 
            ? mb_substr($userMessage, 0, $maxLength) . '...' 
            : $userMessage;
        
        $summarizedAssistant = mb_strlen($assistantMessage) > $maxLength 
            ? mb_substr($assistantMessage, 0, $maxLength) . '...' 
            : $assistantMessage;

        return [
            'user' => $summarizedUser,
            'assistant' => $summarizedAssistant,
        ];
    }

    /**
     * Gọi API AI để tóm tắt
     */
    private function callAISummarize(string $modelType, int $credentialId, ?string $modelName, string $prompt, ?string $assistantMessagePath = null): ?array
    {
        $credential = \App\Models\Credential::find($credentialId);
        if (!$credential) {
            throw new \Exception('Credential not found');
        }

        switch ($modelType) {
            case 'openai':
                return $this->summarizeWithOpenAI($credential, $modelName, $prompt, $assistantMessagePath);
            case 'claude':
                return $this->summarizeWithClaude($credential, $modelName, $prompt, $assistantMessagePath);
            case 'perplexity':
                return $this->summarizeWithPerplexity($credential, $modelName, $prompt, $assistantMessagePath);
            case 'gemini':
                return $this->summarizeWithGemini($credential, $modelName, $prompt, $assistantMessagePath);
            default:
                throw new \Exception("Unsupported model type: {$modelType}");
        }
    }

    /**
     * Extract value from JSON using dynamic path
     */
    private function extractValueFromPath($data, $path)
    {
        if (empty($path) || !is_array($data)) {
            return null;
        }

        $segments = [];
        $currentSegment = '';
        $inBracket = false;
        
        for ($i = 0; $i < strlen($path); $i++) {
            $char = $path[$i];
            
            if ($char === '[') {
                $inBracket = true;
                $currentSegment .= $char;
            } elseif ($char === ']') {
                $inBracket = false;
                $currentSegment .= $char;
            } elseif ($char === '.' && !$inBracket) {
                if ($currentSegment !== '') {
                    $segments[] = $currentSegment;
                    $currentSegment = '';
                }
            } else {
                $currentSegment .= $char;
            }
        }
        
        if ($currentSegment !== '') {
            $segments[] = $currentSegment;
        }

        $current = $data;
        
        foreach ($segments as $segment) {
            if (preg_match('/^([^\[]+)(.*)$/', $segment, $matches)) {
                $field = $matches[1];
                $indices = $matches[2];
                
                if (is_array($current) && isset($current[$field])) {
                    $current = $current[$field];
                } else {
                    return null;
                }
                
                if (!empty($indices)) {
                    preg_match_all('/\[(\d+)\]/', $indices, $indexMatches);
                    foreach ($indexMatches[1] as $index) {
                        $index = (int)$index;
                        if (is_array($current) && isset($current[$index])) {
                            $current = $current[$index];
                        } else {
                            return null;
                        }
                    }
                }
            } else {
                return null;
            }
        }
        
        return $current;
    }

    /**
     * Tóm tắt bằng OpenAI
     */
    private function summarizeWithOpenAI($credential, ?string $modelName, string $prompt, ?string $assistantMessagePath = null): ?array
    {
        $apiKey = null;
        if ($credential->type === 'openai') {
            $apiKey = $credential->data['key'] ?? null;
        } elseif ($credential->type === 'custom' && isset($credential->data['headerValue'])) {
            $headerValue = $credential->data['headerValue'];
            $apiKey = $headerValue;
            if (strpos($headerValue, 'Bearer ') === 0) {
                $apiKey = substr($headerValue, 7);
            }
        }

        if (!$apiKey) {
            throw new \Exception('Invalid OpenAI credential');
        }

        $model = $modelName ?: 'gpt-3.5-turbo';
        
        $response = Http::withHeaders([
            'Content-Type' => 'application/json',
            'Authorization' => 'Bearer ' . $apiKey,
        ])
        ->timeout(30)
        ->post('https://api.openai.com/v1/chat/completions', [
            'model' => $model,
            'messages' => [
                [
                    'role' => 'system',
                    'content' => 'Bạn là một trợ lý chuyên tóm tắt thông tin. Trả về kết quả dưới dạng JSON với format: {"user": "tóm tắt câu hỏi", "assistant": "tóm tắt câu trả lời"}'
                ],
                [
                    'role' => 'user',
                    'content' => $prompt
                ]
            ],
            'response_format' => ['type' => 'json_object'],
            'temperature' => 0.3,
            'max_tokens' => 500,
        ]);

        if (!$response->successful()) {
            throw new \Exception('OpenAI API error: ' . $response->body());
        }

        $result = $response->json();
        
        // Use dynamic path if provided
        $path = $assistantMessagePath ?: 'choices[0].message.content';
        $content = $this->extractValueFromPath($result, $path);
        
        // Fallback to default path
        if (empty($content)) {
            $content = $result['choices'][0]['message']['content'] ?? null;
        }
        
        if ($content) {
            $decoded = json_decode($content, true);
            if (is_array($decoded) && isset($decoded['user']) && isset($decoded['assistant'])) {
                return $decoded;
            }
        }

        return null;
    }

    /**
     * Tóm tắt bằng Claude
     */
    private function summarizeWithClaude($credential, ?string $modelName, string $prompt, ?string $assistantMessagePath = null): ?array
    {
        $apiKey = null;
        if ($credential->type === 'claude') {
            $apiKey = $credential->data['key'] ?? null;
        } elseif ($credential->type === 'custom' && isset($credential->data['headerValue'])) {
            $apiKey = $credential->data['headerValue'];
        }

        if (!$apiKey) {
            throw new \Exception('Invalid Claude credential');
        }

        $model = $modelName ?: 'claude-3-5-haiku-20241022'; // Dùng model nhỏ để tiết kiệm
        
        $response = Http::withHeaders([
            'Content-Type' => 'application/json',
            'anthropic-version' => '2023-06-01',
            'x-api-key' => $apiKey,
        ])
        ->timeout(30)
        ->post('https://api.anthropic.com/v1/messages', [
            'model' => $model,
            'system' => 'Bạn là một trợ lý chuyên tóm tắt thông tin. Trả về kết quả dưới dạng JSON với format: {"user": "tóm tắt câu hỏi", "assistant": "tóm tắt câu trả lời"}',
            'messages' => [
                [
                    'role' => 'user',
                    'content' => $prompt
                ]
            ],
            'max_tokens' => 500,
        ]);

        if (!$response->successful()) {
            throw new \Exception('Claude API error: ' . $response->body());
        }

        $result = $response->json();
        
        // Use dynamic path if provided
        $path = $assistantMessagePath ?: 'content[0].text';
        $content = $this->extractValueFromPath($result, $path);
        
        // Fallback to default path
        if (empty($content)) {
            $content = $result['content'][0]['text'] ?? null;
        }
        
        if ($content) {
            $decoded = json_decode($content, true);
            if (is_array($decoded) && isset($decoded['user']) && isset($decoded['assistant'])) {
                return $decoded;
            }
        }

        return null;
    }

    /**
     * Tóm tắt bằng Perplexity
     */
    private function summarizeWithPerplexity($credential, ?string $modelName, string $prompt, ?string $assistantMessagePath = null): ?array
    {
        $apiKey = null;
        if ($credential->type === 'perplexity') {
            $apiKey = $credential->data['key'] ?? null;
        } elseif ($credential->type === 'custom' && isset($credential->data['headerValue'])) {
            $apiKey = $credential->data['headerValue'];
        } elseif ($credential->type === 'bearer' && isset($credential->data['token'])) {
            $apiKey = $credential->data['token'];
        }

        if (!$apiKey) {
            throw new \Exception('Invalid Perplexity credential');
        }

        $model = $modelName ?: 'sonar';
        
        $response = Http::withHeaders([
            'Content-Type' => 'application/json',
            'Authorization' => 'Bearer ' . $apiKey,
        ])
        ->timeout(30)
        ->post('https://api.perplexity.ai/chat/completions', [
            'model' => $model,
            'messages' => [
                [
                    'role' => 'system',
                    'content' => 'Bạn là một trợ lý chuyên tóm tắt thông tin. Trả về kết quả dưới dạng JSON với format: {"user": "tóm tắt câu hỏi", "assistant": "tóm tắt câu trả lời"}'
                ],
                [
                    'role' => 'user',
                    'content' => $prompt
                ]
            ],
            'temperature' => 0.3,
            'max_tokens' => 500,
        ]);

        if (!$response->successful()) {
            throw new \Exception('Perplexity API error: ' . $response->body());
        }

        $result = $response->json();
        
        // Use dynamic path if provided
        $path = $assistantMessagePath ?: 'choices[0].message.content';
        $content = $this->extractValueFromPath($result, $path);
        
        // Fallback to default path
        if (empty($content)) {
            $content = $result['choices'][0]['message']['content'] ?? null;
        }
        
        if ($content) {
            $decoded = json_decode($content, true);
            if (is_array($decoded) && isset($decoded['user']) && isset($decoded['assistant'])) {
                return $decoded;
            }
        }

        return null;
    }

    /**
     * Tóm tắt bằng Gemini
     */
    private function summarizeWithGemini($credential, ?string $modelName, string $prompt, ?string $assistantMessagePath = null): ?array
    {
        $apiKey = null;
        if ($credential->type === 'gemini') {
            $apiKey = $credential->data['key'] ?? null;
        } elseif ($credential->type === 'custom' && isset($credential->data['headerValue'])) {
            $apiKey = $credential->data['headerValue'];
        }

        if (!$apiKey) {
            throw new \Exception('Invalid Gemini credential');
        }

        $model = $modelName ?: 'gemini-1.5-flash'; // Dùng model nhỏ để tiết kiệm
        
        $response = Http::withHeaders([
            'Content-Type' => 'application/json',
        ])
        ->timeout(30)
        ->post("https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}", [
            'contents' => [
                [
                    'parts' => [
                        [
                            'text' => 'Bạn là một trợ lý chuyên tóm tắt thông tin. Trả về kết quả dưới dạng JSON với format: {"user": "tóm tắt câu hỏi", "assistant": "tóm tắt câu trả lời"}\n\n' . $prompt
                        ]
                    ]
                ]
            ],
            'generationConfig' => [
                'temperature' => 0.3,
                'maxOutputTokens' => 500,
            ],
        ]);

        if (!$response->successful()) {
            throw new \Exception('Gemini API error: ' . $response->body());
        }

        $result = $response->json();
        
        // Use dynamic path if provided
        $path = $assistantMessagePath ?: 'candidates[0].content.parts[0].text';
        $content = $this->extractValueFromPath($result, $path);
        
        // Fallback to default path
        if (empty($content)) {
            $content = $result['candidates'][0]['content']['parts'][0]['text'] ?? null;
        }
        
        if ($content) {
            $decoded = json_decode($content, true);
            if (is_array($decoded) && isset($decoded['user']) && isset($decoded['assistant'])) {
                return $decoded;
            }
        }

        return null;
    }

    /**
     * Chuyển đổi memory thành format messages cho AI API
     * 
     * @param array $memories Mảng các memory
     * @return array Mảng messages theo format [['role' => 'user', 'content' => ...], ...]
     */
    public function memoriesToMessages(array $memories): array
    {
        $messages = [];

        foreach ($memories as $memory) {
            if (isset($memory['user']) && !empty($memory['user'])) {
                $messages[] = [
                    'role' => 'user',
                    'content' => $memory['user'],
                ];
            }

            if (isset($memory['assistant']) && !empty($memory['assistant'])) {
                $messages[] = [
                    'role' => 'assistant',
                    'content' => $memory['assistant'],
                ];
            }
        }

        return $messages;
    }

    /**
     * Xóa memory theo ID
     * 
     * @param string $memoryId
     * @return bool
     */
    public function deleteMemory(string $memoryId): bool
    {
        if (empty($memoryId)) {
            return false;
        }

        $cacheKey = "ai_memory:{$memoryId}";
        Cache::forget($cacheKey);

        return true;
    }
}


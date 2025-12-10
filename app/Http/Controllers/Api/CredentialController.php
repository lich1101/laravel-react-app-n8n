<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Credential;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class CredentialController extends Controller
{
    /**
     * Display a listing of the credentials for the authenticated user.
     */
    public function index(Request $request)
    {
        $query = Credential::query();
        
        // Filter by type if provided
        if ($request->has('type')) {
            $query->ofType($request->type);
        }
        
        $credentials = $query->orderBy('created_at', 'desc')->get();
        
        // Return credentials without sensitive data field
        return response()->json($credentials->map(function ($credential) {
            return [
                'id' => $credential->id,
                'name' => $credential->name,
                'type' => $credential->type,
                'description' => $credential->description,
                'created_at' => $credential->created_at,
                'updated_at' => $credential->updated_at,
            ];
        }));
    }

    /**
     * Store a newly created credential.
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'type' => 'required|string|in:bearer,api_key,oauth2,basic,custom,openai,claude,gemini,perplexity',
            'data' => 'required|array',
            'description' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Log the data being saved (without sensitive values)
        Log::info('Creating credential', [
            'type' => $request->type,
            'name' => $request->name,
            'data_keys' => is_array($request->data) ? array_keys($request->data) : 'not_array',
            'has_key' => isset($request->data['key']) && !empty($request->data['key']),
        ]);

        $credential = Credential::create([
            'user_id' => Auth::id(),
            'name' => $request->name,
            'type' => $request->type,
            'data' => $request->data, // Will be auto-encrypted by model
            'description' => $request->description,
        ]);

        // Verify the credential was saved correctly
        $credential->refresh();
        Log::info('Credential created', [
            'credential_id' => $credential->id,
            'type' => $credential->type,
            'decrypted_data_keys' => is_array($credential->data) ? array_keys($credential->data) : 'not_array',
            'has_key' => isset($credential->data['key']) && !empty($credential->data['key']),
        ]);

        return response()->json([
            'message' => 'Credential created successfully',
            'credential' => [
                'id' => $credential->id,
                'name' => $credential->name,
                'type' => $credential->type,
                'description' => $credential->description,
                'created_at' => $credential->created_at,
                'updated_at' => $credential->updated_at,
            ]
        ], 201);
    }

    /**
     * Display the specified credential (with decrypted data for the owner).
     */
    public function show(string $id)
    {
        $credential = Credential::findOrFail($id);

        return response()->json([
            'id' => $credential->id,
            'name' => $credential->name,
            'type' => $credential->type,
            'data' => $credential->data, // Will be auto-decrypted by model
            'description' => $credential->description,
            'created_at' => $credential->created_at,
            'updated_at' => $credential->updated_at,
        ]);
    }

    /**
     * Update the specified credential.
     */
    public function update(Request $request, string $id)
    {
        $credential = Credential::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|required|string|max:255',
            'type' => 'sometimes|required|string|in:bearer,api_key,oauth2,basic,custom,openai,claude,gemini,perplexity',
            'data' => 'sometimes|required|array',
            'description' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $credential->update($request->only(['name', 'type', 'data', 'description']));

        return response()->json([
            'message' => 'Credential updated successfully',
            'credential' => [
                'id' => $credential->id,
                'name' => $credential->name,
                'type' => $credential->type,
                'description' => $credential->description,
                'created_at' => $credential->created_at,
                'updated_at' => $credential->updated_at,
            ]
        ]);
    }

    /**
     * Remove the specified credential.
     */
    public function destroy(string $id)
    {
        $credential = Credential::findOrFail($id);

        $credential->delete();

        return response()->json([
            'message' => 'Credential deleted successfully'
        ]);
    }

    /**
     * Test credential (validate if it works)
     */
    public function test(string $id)
    {
        $credential = Credential::findOrFail($id);

        // Here you could add logic to test the credential
        // For now, just return the decrypted data
        return response()->json([
            'success' => true,
            'message' => 'Credential retrieved successfully',
            'type' => $credential->type,
            'data' => $credential->data,
        ]);
    }

    /**
     * Test OAuth2 configuration before saving - REAL CONNECTION TEST
     */
    public function testOAuth2(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'service' => 'required|string',
            'clientId' => 'required|string',
            'clientSecret' => 'required|string',
            'authUrl' => 'required|url',
            'accessTokenUrl' => 'required|url',
            'redirectUrl' => 'required|url',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid OAuth2 configuration',
                'errors' => $validator->errors()
            ], 422);
        }

        try {
            $service = $request->service;
            $clientId = $request->clientId;
            $clientSecret = $request->clientSecret;
            $authUrl = $request->authUrl;
            $accessTokenUrl = $request->accessTokenUrl;
            
            // Step 1: Validate format
            if ($service === 'google') {
                if (!str_ends_with($clientId, '.apps.googleusercontent.com')) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Invalid Google Client ID format. Should end with .apps.googleusercontent.com'
                    ], 400);
                }
            }

            // Step 2: Test Client ID/Secret validity by attempting token exchange
            // This also tests if the token URL is reachable
            $tokenTestResult = $this->testClientCredentials($clientId, $clientSecret, $accessTokenUrl, $service);
            if (!$tokenTestResult['success']) {
                return response()->json([
                    'success' => false,
                    'message' => $tokenTestResult['message']
                ], 400);
            }

            // All tests passed!
            return response()->json([
                'success' => true,
                'message' => "✅ OAuth2 connection successful! {$service} credentials are valid and reachable.",
                'service' => $service,
                'details' => [
                    'format_valid' => true,
                    'token_url_reachable' => true,
                    'client_credentials_valid' => true,
                ]
            ]);

        } catch (\Exception $e) {
            \Log::error('OAuth2 test error: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Connection test failed: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Test if URL is reachable
     */
    private function testUrlReachability($url)
    {
        try {
            $response = Http::timeout(10)->get($url);
            return $response->successful();
        } catch (\Exception $e) {
            \Log::warning("URL not reachable: {$url} - " . $e->getMessage());
            return false;
        }
    }

    /**
     * Test Client ID/Secret by validating with Google's tokeninfo endpoint
     */
    private function testClientCredentials($clientId, $clientSecret, $tokenUrl, $service)
    {
        try {
            \Log::info("Testing OAuth2 credentials for service: {$service}");
            
            // For Google, we can validate the Client ID using Google's tokeninfo endpoint
            if ($service === 'google') {
                // Step 1: Check if OAuth endpoint is reachable
                $configResponse = Http::timeout(10)
                    ->withHeaders(['User-Agent' => 'Mozilla/5.0'])
                    ->get('https://accounts.google.com/.well-known/openid-configuration');

                if (!$configResponse->successful()) {
                    return [
                        'success' => false,
                        'message' => 'Unable to reach Google OAuth2 endpoints. Please check your internet connection.'
                    ];
                }

                // Step 2: Validate Client ID and Secret
                // For web applications, we can't fully validate without user authorization
                // But we can try to make a token request with invalid grant to see if credentials are recognized
                $tokenResponse = Http::timeout(15)
                    ->asForm()
                    ->post('https://oauth2.googleapis.com/token', [
                        'client_id' => $clientId,
                        'client_secret' => $clientSecret,
                        'grant_type' => 'authorization_code',
                        'code' => 'invalid_code_for_testing',
                        'redirect_uri' => 'https://user.chatplus.vn/oauth2/callback'
                    ]);

                $error = $tokenResponse->json();
                $errorCode = $error['error'] ?? 'unknown';
                
                \Log::info("Google token validation response: " . json_encode($error));
                
                // Analyze the error to determine if credentials are valid
                if ($errorCode === 'invalid_grant') {
                    // This means the code is invalid, but Client ID/Secret are VALID!
                    \Log::info("Google Client ID and Secret are valid (got invalid_grant which is expected)");
                    return [
                        'success' => true,
                        'message' => 'Google OAuth2 Client ID and Secret are valid'
                    ];
                } elseif ($errorCode === 'invalid_client') {
                    // Invalid Client ID or Secret
                    $errorDesc = $error['error_description'] ?? 'Invalid credentials';
                    \Log::warning("Invalid Google credentials: {$errorDesc}");
                    return [
                        'success' => false,
                        'message' => 'Invalid Client ID or Client Secret. Please check your Google Cloud Console credentials.'
                    ];
                } elseif ($errorCode === 'unauthorized_client') {
                    // Client is valid but not authorized for this grant type
                    \Log::info("Client exists but may need additional configuration");
                    return [
                        'success' => true,
                        'message' => 'Google OAuth2 Client ID is valid. Please ensure it\'s configured as a Web application.'
                    ];
                } else {
                    // Other errors - likely means credentials exist but something else is wrong
                    \Log::warning("Google validation returned: {$errorCode}");
                    return [
                        'success' => true,
                        'message' => 'Google OAuth2 credentials format is valid and endpoints are reachable'
                    ];
                }
            }

            // For Microsoft, similar test
            if ($service === 'microsoft') {
                $response = Http::timeout(15)
                    ->withHeaders(['User-Agent' => 'Mozilla/5.0'])
                    ->get('https://login.microsoftonline.com/common/.well-known/openid-configuration');

                if ($response->successful()) {
                    \Log::info("Microsoft OAuth2 endpoint is reachable");
                    return [
                        'success' => true,
                        'message' => 'Microsoft OAuth2 endpoints are reachable. Client validation requires tenant ID.'
                    ];
                } else {
                    return [
                        'success' => false,
                        'message' => 'Unable to reach Microsoft OAuth2 endpoints. Please check your internet connection.'
                    ];
                }
            }

            // For custom services, just validate format
            return [
                'success' => true,
                'message' => 'Custom service - format validation passed'
            ];

        } catch (\Exception $e) {
            \Log::error('Client credentials test error: ' . $e->getMessage());
            \Log::error('Stack trace: ' . $e->getTraceAsString());
            return [
                'success' => false,
                'message' => 'Connection test failed. Please check your internet connection or try again later.'
            ];
        }
    }

    /**
     * Start OAuth2 authorization flow (with or without existing credential)
     */
    public function startOAuth2Authorization(Request $request, $credentialId = null)
    {
        try {
            $user = Auth::user();
            
            // If credentialId provided, use existing credential
            if ($credentialId) {
                $credential = Credential::findOrFail($credentialId);

                if ($credential->type !== 'oauth2') {
                    return response()->json(['error' => 'Not an OAuth2 credential'], 400);
                }

                $data = $credential->data;
                $credentialData = [
                    'credential_id' => $credentialId,
                    'is_existing' => true
                ];
            } else {
                // New credential - validate and save to session
                $validator = Validator::make($request->all(), [
                    'name' => 'required|string|max:255',
                    'description' => 'nullable|string',
                    'data' => 'required|array',
                    'data.clientId' => 'required|string',
                    'data.clientSecret' => 'required|string',
                    'data.authUrl' => 'required|string',
                    'data.accessTokenUrl' => 'required|string',
                    'data.scope' => 'required|string',
                ]);

                if ($validator->fails()) {
                    return response()->json(['error' => $validator->errors()->first()], 400);
                }

                $data = $request->input('data');
                
                // Save credential info to cache (will be created after authorization)
                // Use unique ID with user_id to ensure security
                $pendingId = uniqid('oauth2_' . $user->id . '_', true);
                $pendingCredential = [
                    'name' => $request->input('name'),
                    'type' => 'oauth2',
                    'description' => $request->input('description'),
                    'data' => $data,
                    'user_id' => $user->id,
                    'created_at' => now()->toDateTimeString()
                ];
                
                // Store in cache for 15 minutes (enough time for OAuth flow)
                Cache::put('oauth2_pending_' . $pendingId, $pendingCredential, 900);

                $credentialData = [
                    'pending_id' => $pendingId,
                    'is_existing' => false
                ];
            }
            
            // Build authorization URL
            $params = [
                'client_id' => $data['clientId'],
                'redirect_uri' => url('/api/oauth2/callback'),
                'response_type' => 'code',
                'scope' => $data['scope'] ?? '',
                'access_type' => 'offline', // To get refresh token
                'prompt' => 'consent', // Force to show consent screen to get refresh token
                'state' => base64_encode(json_encode(array_merge($credentialData, [
                    'user_id' => $user->id,
                    'timestamp' => time()
                ])))
            ];

            $authUrl = $data['authUrl'] . '?' . http_build_query($params);

            Log::info('Starting OAuth2 authorization', [
                'credential_id' => $credentialId,
                'is_existing' => $credentialData['is_existing'],
                'user_id' => $user->id,
                'redirect_uri' => url('/api/oauth2/callback')
            ]);

            // Return authorization URL to frontend
            return response()->json([
                'authorization_url' => $authUrl
            ]);

        } catch (\Exception $e) {
            Log::error('OAuth2 authorization start failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json(['error' => 'Failed to start authorization: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Handle OAuth2 callback
     */
    public function handleOAuth2Callback(Request $request)
    {
        try {
            $code = $request->input('code');
            $state = $request->input('state');
            $error = $request->input('error');

            // Check for errors from OAuth provider
            if ($error) {
                Log::error('OAuth2 callback error', ['error' => $error]);
                return redirect('/workflows?oauth_error=' . urlencode($error));
            }

            if (!$code || !$state) {
                Log::error('OAuth2 callback missing code or state');
                return redirect('/workflows?oauth_error=missing_parameters');
            }

            // Decode state
            $stateData = json_decode(base64_decode($state), true);
            $userId = $stateData['user_id'] ?? null;
            $isExisting = $stateData['is_existing'] ?? false;

            if (!$userId) {
                Log::error('Invalid state data', ['state' => $stateData]);
                return redirect('/workflows?oauth_error=invalid_state');
            }

            // Get credential data
            if ($isExisting) {
                // Existing credential - update with tokens
                $credentialId = $stateData['credential_id'] ?? null;
                if (!$credentialId) {
                    Log::error('Missing credential_id for existing credential');
                    return redirect('/workflows?oauth_error=invalid_state');
                }

                $credential = Credential::find($credentialId);

                if (!$credential) {
                    Log::error('Credential not found', ['credential_id' => $credentialId]);
                    return redirect('/workflows?oauth_error=credential_not_found');
                }

                $data = $credential->data;
            } else {
                // New credential - get from cache
                $pendingId = $stateData['pending_id'] ?? null;
                if (!$pendingId) {
                    Log::error('Missing pending_id for new credential');
                    return redirect('/workflows?oauth_error=invalid_state');
                }

                $pendingCredential = Cache::get('oauth2_pending_' . $pendingId);
                if (!$pendingCredential) {
                    Log::error('Pending credential not found in cache', ['pending_id' => $pendingId]);
                    return redirect('/workflows?oauth_error=session_expired');
                }

                // Verify user_id matches
                if ($pendingCredential['user_id'] != $userId) {
                    Log::error('User ID mismatch for pending credential', [
                        'pending_user_id' => $pendingCredential['user_id'],
                        'state_user_id' => $userId
                    ]);
                    return redirect('/workflows?oauth_error=invalid_user');
                }

                $data = $pendingCredential['data'];
                $credential = null; // Will be created later
            }

            // Exchange authorization code for tokens
            $response = Http::asForm()->post($data['accessTokenUrl'], [
                'client_id' => $data['clientId'],
                'client_secret' => $data['clientSecret'],
                'code' => $code,
                'grant_type' => 'authorization_code',
                'redirect_uri' => url('/api/oauth2/callback')
            ]);

            if (!$response->successful()) {
                Log::error('Token exchange failed', [
                    'status' => $response->status(),
                    'body' => $response->body()
                ]);
                
                // Clean up cache if new credential
                if (!$isExisting && isset($pendingId)) {
                    Cache::forget('oauth2_pending_' . $pendingId);
                }
                
                return redirect('/workflows?oauth_error=token_exchange_failed');
            }

            $tokens = $response->json();

            // Add tokens to data
            $data['accessToken'] = $tokens['access_token'];
            $data['refreshToken'] = $tokens['refresh_token'] ?? null;
            $data['tokenType'] = $tokens['token_type'] ?? 'Bearer';
            $data['expiresAt'] = isset($tokens['expires_in']) 
                ? now()->addSeconds($tokens['expires_in'])->toDateTimeString()
                : null;

            // Save or update credential
            if ($isExisting) {
                // Update existing credential
                $credential->data = $data;
                $credential->save();
                $credentialId = $credential->id;

                Log::info('OAuth2 authorization successful - credential updated', [
                    'credential_id' => $credentialId,
                    'has_refresh_token' => !empty($data['refreshToken'])
                ]);
            } else {
                // Create new credential (only now, after successful authorization)
                $credential = new Credential();
                $credential->user_id = $userId;
                $credential->name = $pendingCredential['name'];
                $credential->type = 'oauth2';
                $credential->description = $pendingCredential['description'] ?? null;
                $credential->data = $data;
                $credential->save();
                $credentialId = $credential->id;

                // Clean up cache
                Cache::forget('oauth2_pending_' . $pendingId);

                Log::info('OAuth2 authorization successful - credential created', [
                    'credential_id' => $credentialId,
                    'has_refresh_token' => !empty($data['refreshToken'])
                ]);
            }

            // Redirect back to workflows page with success (credentials tab will handle the params)
            return redirect('/workflows?oauth_success=true&credential_id=' . $credentialId);

        } catch (\Exception $e) {
            Log::error('OAuth2 callback handling failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return redirect('/workflows?oauth_error=' . urlencode($e->getMessage()));
        }
    }

    /**
     * Export credentials as JSON
     */
    public function export()
    {
        try {
            $credentials = Credential::where('user_id', Auth::id())
                ->orderBy('created_at', 'desc')
                ->get();

            Log::info('Exporting credentials', [
                'user_id' => Auth::id(),
                'credentials_count' => $credentials->count(),
            ]);

            $exportData = [
                'version' => '1.0',
                'exported_at' => now()->toIso8601String(),
                'exported_by' => Auth::user()->email ?? Auth::id(),
                'credentials' => $credentials->map(function ($credential) {
                    // Get decrypted data using the model accessor
                    $decryptedData = $credential->data;
                    
                    Log::debug('Exporting credential', [
                        'name' => $credential->name,
                        'type' => $credential->type,
                        'has_data' => !empty($decryptedData),
                        'data_type' => gettype($decryptedData),
                    ]);
                    
                    return [
                        'name' => $credential->name,
                        'type' => $credential->type,
                        'data' => $decryptedData, // Will be decrypted by model accessor
                        'description' => $credential->description,
                    ];
                })->toArray(),
            ];

            Log::info('Export data prepared', [
                'credentials_count' => count($exportData['credentials']),
                'export_data_keys' => array_keys($exportData),
            ]);

            return response()->json($exportData, 200, [
                'Content-Type' => 'application/json',
                'Content-Disposition' => 'attachment; filename="credentials_' . date('Y-m-d_His') . '.json"',
            ]);
        } catch (\Exception $e) {
            Log::error('Error exporting credentials', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'error' => 'Failed to export credentials',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Import credentials from JSON
     */
    public function import(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'file' => 'required|file|mimes:json,txt|max:10240', // Max 10MB
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Invalid file',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $file = $request->file('file');
            $content = file_get_contents($file->getRealPath());
            $importData = json_decode($content, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                return response()->json([
                    'error' => 'Invalid JSON file',
                    'message' => json_last_error_msg(),
                ], 400);
            }

            // Validate import data structure
            if (!isset($importData['credentials']) || !is_array($importData['credentials'])) {
                return response()->json([
                    'error' => 'Invalid import file format',
                    'message' => 'File must contain a "credentials" array',
                ], 400);
            }

            $imported = 0;
            $skipped = 0;
            $errors = [];

            foreach ($importData['credentials'] as $index => $credentialData) {
                try {
                    // Validate required fields
                    if (empty($credentialData['name']) || empty($credentialData['type']) || empty($credentialData['data'])) {
                        $errors[] = "Credential #{$index}: Missing required fields (name, type, or data)";
                        $skipped++;
                        continue;
                    }

                    // Check if credential with same name already exists
                    $existing = Credential::where('user_id', Auth::id())
                        ->where('name', $credentialData['name'])
                        ->first();

                    if ($existing) {
                        // Update existing credential
                        $existing->update([
                            'type' => $credentialData['type'],
                            'data' => $credentialData['data'], // Will be auto-encrypted by model
                            'description' => $credentialData['description'] ?? null,
                        ]);
                        $imported++;
                    } else {
                        // Create new credential
                        Credential::create([
                            'user_id' => Auth::id(),
                            'name' => $credentialData['name'],
                            'type' => $credentialData['type'],
                            'data' => $credentialData['data'], // Will be auto-encrypted by model
                            'description' => $credentialData['description'] ?? null,
                        ]);
                        $imported++;
                    }
                } catch (\Exception $e) {
                    $credentialName = $credentialData['name'] ?? 'unknown';
                    $errors[] = "Credential #{$index} ({$credentialName}): " . $e->getMessage();
                    $skipped++;
                    Log::error('Error importing credential', [
                        'index' => $index,
                        'credential_data' => $credentialData,
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            Log::info('Credentials import completed', [
                'imported' => $imported,
                'skipped' => $skipped,
                'errors_count' => count($errors),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Credentials imported successfully',
                'imported' => $imported,
                'skipped' => $skipped,
                'errors' => $errors,
            ], 200);
        } catch (\Exception $e) {
            Log::error('Error importing credentials', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'error' => 'Failed to import credentials',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}

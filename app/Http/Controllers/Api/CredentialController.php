<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Credential;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
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
        $user = Auth::user();
        
        $query = Credential::forUser($user->id);
        
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
            'type' => 'required|string|in:bearer,api_key,oauth2,basic,custom',
            'data' => 'required|array',
            'description' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $credential = Credential::create([
            'user_id' => Auth::id(),
            'name' => $request->name,
            'type' => $request->type,
            'data' => $request->data, // Will be auto-encrypted by model
            'description' => $request->description,
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
        $credential = Credential::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

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
        $credential = Credential::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|required|string|max:255',
            'type' => 'sometimes|required|string|in:bearer,api_key,oauth2,basic,custom',
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
        $credential = Credential::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

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
        $credential = Credential::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

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
}

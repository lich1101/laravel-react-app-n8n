<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class Credential extends Model
{
    protected $fillable = [
        'user_id',
        'name',
        'type',
        'data',
        'description'
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // Automatically encrypt/decrypt the 'data' field
    public function getDataAttribute($value)
    {
        if (!$value) return null;
        
        try {
            $decrypted = Crypt::decryptString($value);
            return json_decode($decrypted, true);
        } catch (\Exception $e) {
            \Log::error('Failed to decrypt credential data: ' . $e->getMessage());
            return null;
        }
    }

    public function setDataAttribute($value)
    {
        if (!$value) {
            $this->attributes['data'] = null;
            return;
        }
        
        try {
            $json = is_string($value) ? $value : json_encode($value);
            $this->attributes['data'] = Crypt::encryptString($json);
        } catch (\Exception $e) {
            \Log::error('Failed to encrypt credential data: ' . $e->getMessage());
            $this->attributes['data'] = null;
        }
    }

    /**
     * Get the user that owns the credential
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Scope to get credentials by type
     */
    public function scopeOfType($query, $type)
    {
        return $query->where('type', $type);
    }

    /**
     * Scope to get credentials for a specific user
     */
    public function scopeForUser($query, $userId)
    {
        return $query->where('user_id', $userId);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmailRecipient extends Model
{
    protected $fillable = [
        'email',
        'name',
        'is_active',
        'notes',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}

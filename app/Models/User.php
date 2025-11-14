<?php

namespace App\Models;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable, HasApiTokens;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'project_id',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function workflows()
    {
        return $this->hasMany(Workflow::class);
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isAdministrator(): bool
    {
        return $this->role === 'administrator';
    }

    /**
     * Check if this user is a protected system user (cannot be deleted)
     */
    public function isProtectedUser(): bool
    {
        return in_array($this->email, [
            'administrator@chatplus.vn',
            'admin@chatplus.vn',
        ]);
    }

    /**
     * Get the list of protected user emails
     */
    public static function getProtectedEmails(): array
    {
        return [
            'administrator@chatplus.vn',
            'admin@chatplus.vn',
        ];
    }
}

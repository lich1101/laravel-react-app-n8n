<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

class SystemUsersSeeder extends Seeder
{
    /**
     * Run the database seeds.
     * Creates 3 fixed system users: Administrator, Admin, and User
     */

    private function randomStringSpecial($length = 20) {
        $characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()-_=+[]{};:,.<>/?';
        $max = strlen($characters) - 1;
        $result = '';
    
        for ($i = 0; $i < $length; $i++) {
            $result .= $characters[random_int(0, $max)];
        }
    
        return $result;
    }
    public function run(): void
    {
        // 1. Create Administrator user
        User::updateOrCreate(
            ['email' => 'dangvanbinh11012003@gmail.com'],
            [
                'name' => 'Administrator',
                'password' => Hash::make($this->randomStringSpecial()),
                'role' => 'administrator',
                'email_verified_at' => now(),
            ]
        );

        // 2. Create Admin user
        User::updateOrCreate(
            ['email' => 'admin@chatplus.vn'],
            [
                'name' => 'Admin',
                'password' => Hash::make($this->randomStringSpecial()),
                'role' => 'admin',
                'email_verified_at' => now(),
            ]
        );

        User::updateOrCreate(
            ['email' => 'admin.user@chatplus.vn'],
            [
                'name' => 'Admin',
                'password' => Hash::make($this->randomStringSpecial()),
                'role' => 'admin',
                'email_verified_at' => now(),
            ]
        );

        User::updateOrCreate(
            ['email' => 'user@chatplus.vn'],
            [
                'name' => 'User',
                'password' => Hash::make($this->randomStringSpecial()),
                'role' => 'user',
                'email_verified_at' => now(),
            ]
        );

        $this->command->info('System users created successfully!');
        $this->command->info('');
        $this->command->info('=== LOGIN CREDENTIALS ===');
        $this->command->info('1. Administrator:');
        $this->command->info('   Email: administrator@chatplus.vn');
        $this->command->info('   Password: Dangbinh1101@gmail.com');
        $this->command->info('');
        $this->command->info('2. Admin:');
        $this->command->info('   Email: admin@chatplus.vn');
        $this->command->info('   Password: Dangbinh1101@gmail.com');
    }
}


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
    public function run(): void
    {
        // 1. Create Administrator user
        User::updateOrCreate(
            ['email' => 'administrator@chatplus.vn'],
            [
                'name' => 'Administrator',
                'password' => Hash::make('Admin@2024'),
                'role' => 'administrator',
            ]
        );

        // 2. Create Admin user
        User::updateOrCreate(
            ['email' => 'admin@chatplus.vn'],
            [
                'name' => 'Admin',
                'password' => Hash::make('Admin@2024'),
                'role' => 'admin',
            ]
        );

        // 3. Create regular User
        User::updateOrCreate(
            ['email' => 'user@chatplus.vn'],
            [
                'name' => 'User',
                'password' => Hash::make('User@2024'),
                'role' => 'user',
            ]
        );

        $this->command->info('System users created successfully!');
        $this->command->info('');
        $this->command->info('=== LOGIN CREDENTIALS ===');
        $this->command->info('1. Administrator:');
        $this->command->info('   Email: administrator@chatplus.vn');
        $this->command->info('   Password: Admin@2024');
        $this->command->info('');
        $this->command->info('2. Admin:');
        $this->command->info('   Email: admin@chatplus.vn');
        $this->command->info('   Password: Admin@2024');
        $this->command->info('');
        $this->command->info('3. User:');
        $this->command->info('   Email: user@chatplus.vn');
        $this->command->info('   Password: User@2024');
        $this->command->info('========================');
    }
}


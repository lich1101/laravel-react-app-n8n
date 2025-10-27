<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

class CreateAdministratorSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Create administrator user
        User::create([
            'name' => 'Administrator',
            'email' => 'administrator@example.com',
            'password' => Hash::make('administrator123'),
            'role' => 'administrator',
        ]);

        $this->command->info('Administrator user created successfully!');
        $this->command->info('Email: administrator@example.com');
        $this->command->info('Password: administrator123');
    }
}

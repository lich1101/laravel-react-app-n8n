<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class DeleteFileJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public readonly string $filePath
    ) {
    }

    public function handle(): void
    {
        if (!file_exists($this->filePath)) {
            Log::info('DeleteFileJob: file already removed', [
                'path' => $this->filePath,
            ]);

            return;
        }

        if (!is_writable($this->filePath)) {
            Log::warning('DeleteFileJob: file not writable, skip delete', [
                'path' => $this->filePath,
            ]);

            return;
        }

        try {
            unlink($this->filePath);
            Log::info('DeleteFileJob: file deleted', [
                'path' => $this->filePath,
            ]);
        } catch (\Throwable $e) {
            Log::error('DeleteFileJob: failed to delete file', [
                'path' => $this->filePath,
                'error' => $e->getMessage(),
            ]);
        }
    }
}


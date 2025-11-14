<?php

namespace App\Jobs;

use App\Models\Project;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Process;

class ProvisionProjectJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public readonly int $projectId,
        public readonly string $environmentName
    ) {
    }

    public function handle(): void
    {
        $script = config('projects.provision_script');

        if (!$script || !is_file($script)) {
            $message = sprintf('Provision script not found at path: %s', $script ?? '(empty)');
            Log::error($message, [
                'project_id' => $this->projectId,
                'environment' => $this->environmentName,
            ]);
            throw new \RuntimeException($message);
        }

        $process = new Process(['bash', $script, $this->environmentName]);
        $process->setTimeout(null);

        Log::info('Starting project provisioning script', [
            'project_id' => $this->projectId,
            'environment' => $this->environmentName,
            'script' => $script,
        ]);

        $process->run(function ($type, $buffer) {
            Log::info(sprintf('[provision-%s] %s', $this->environmentName, trim($buffer)));
        });

        if (!$process->isSuccessful()) {
            Log::error('Provision script failed', [
                'project_id' => $this->projectId,
                'environment' => $this->environmentName,
                'output' => $process->getErrorOutput() ?: $process->getOutput(),
            ]);

            throw new ProcessFailedException($process);
        }

        Log::info('Provision script completed successfully', [
            'project_id' => $this->projectId,
            'environment' => $this->environmentName,
        ]);

        Project::where('id', $this->projectId)->update(['status' => 'active']);
    }
}


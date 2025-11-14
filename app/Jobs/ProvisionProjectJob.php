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
        public readonly array $folderIds
    ) {
    }

    public function handle(): void
    {
        $project = Project::findOrFail($this->projectId);
        $environmentName = $project->subdomain;
        $script = config('projects.provision_script');

        if (!$script || !is_file($script)) {
            $message = sprintf('Provision script not found at path: %s', $script ?? '(empty)');
            Log::error($message, [
                'project_id' => $this->projectId,
                'environment' => $environmentName,
            ]);
            $project->update(['provisioning_status' => 'failed']);
            throw new \RuntimeException($message);
        }

        $process = new Process(['bash', $script, $environmentName]);
        $process->setTimeout(null);

        try {
            Log::info('Starting project provisioning script', [
                'project_id' => $this->projectId,
                'environment' => $environmentName,
                'script' => $script,
            ]);

            $process->run(function ($type, $buffer) use ($environmentName) {
                Log::info(sprintf('[provision-%s] %s', $environmentName, trim($buffer)));
            });

            if (!$process->isSuccessful()) {
                throw new ProcessFailedException($process);
            }
        } catch (\Throwable $e) {
            $errorOutput = $process->getErrorOutput() ?: $process->getOutput();
            $message = trim($errorOutput) ?: $e->getMessage();

            Log::error('Provision script failed', [
                'project_id' => $this->projectId,
                'environment' => $environmentName,
                'output' => $message,
            ]);

            $project->update([
                'provisioning_status' => 'failed',
                'provisioning_error' => mb_substr($message, 0, 2000),
            ]);

            throw $e;
        }

        // Update project after successful provisioning
        $project->update([
            'provisioning_status' => 'completed',
            'provisioning_error' => null,
        ]);

        // Attach folders if provided
        if (!empty($this->folderIds)) {
            $project->folders()->sync($this->folderIds);
        }

        Log::info('Provision script completed successfully', [
            'project_id' => $this->projectId,
            'environment' => $environmentName,
        ]);
    }
}


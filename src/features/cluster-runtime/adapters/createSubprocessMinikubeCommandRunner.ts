import { spawn } from 'node:child_process';

import type {
  MinikubeCommandRequest,
  MinikubeCommandResult,
  MinikubeCommandRunner,
} from '../../../types/minikubeRuntime';

/** Create the concrete shell-free subprocess boundary used by Minikube operations. */
export function createSubprocessMinikubeCommandRunner(): MinikubeCommandRunner {
  return { runAsync };
}

/** Execute one argv-safe command without exposing process output through thrown errors. */
function runAsync(request: MinikubeCommandRequest): Promise<MinikubeCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(request.executable, [...request.arguments], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (exitCode) =>
      resolve({
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }),
    );
  });
}

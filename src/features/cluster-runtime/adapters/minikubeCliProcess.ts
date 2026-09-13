import type { InfraResult } from '@ankhorage/contracts/infra';

import type { MinikubeCommandResult, MinikubeCommandRunner } from '../../../types/minikubeRuntime';

/** Run one command, retaining exit status for state-oriented Minikube commands. */
export async function runMinikubeCommandAsync(
  runner: MinikubeCommandRunner,
  executable: string,
  arguments_: readonly string[],
  signal?: AbortSignal,
): Promise<InfraResult<MinikubeCommandResult>> {
  try {
    const value = await runner.runAsync({
      executable,
      arguments: arguments_,
      ...(signal === undefined ? {} : { signal }),
    });
    return { ok: true, value, diagnostics: [] };
  } catch {
    return minikubeCommandFailure();
  }
}

/** Run one command that must exit successfully. */
export async function runCheckedMinikubeCommandAsync(
  runner: MinikubeCommandRunner,
  executable: string,
  arguments_: readonly string[],
  signal?: AbortSignal,
): Promise<InfraResult<MinikubeCommandResult>> {
  const result = await runMinikubeCommandAsync(runner, executable, arguments_, signal);
  return result.ok && result.value.exitCode === 0 ? result : minikubeCommandFailure();
}

/** Return a provider-safe command failure that excludes stdout and stderr. */
function minikubeCommandFailure(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'minikube-command-failed',
        message: 'A required Minikube control-plane command failed.',
      },
    ],
  };
}

/** Wait between status observations and abort promptly when requested. */
export function delayMinikubePollAsync(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal === undefined) return new Promise((resolve) => setTimeout(resolve, milliseconds));
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortError(signal));
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('Minikube operation aborted.');
}

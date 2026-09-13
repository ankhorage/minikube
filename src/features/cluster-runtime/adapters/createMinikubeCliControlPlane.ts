import type { InfraResult } from '@ankhorage/contracts/infra';

import type {
  MinikubeCliControlPlaneOptions,
  MinikubeClusterIdentity,
  MinikubeClusterSpec,
  MinikubeCommandRunner,
  MinikubeControlPlane,
} from '../../../types/minikubeRuntime';
import { createSubprocessMinikubeCommandRunner } from './createSubprocessMinikubeCommandRunner';
import { inspectMinikubeAsync } from './inspectMinikubeAsync';
import { delayMinikubePollAsync, runCheckedMinikubeCommandAsync } from './minikubeCliProcess';
import { readMinikubeEndpointsAsync } from './readMinikubeEndpointsAsync';

interface MinikubeCliContext {
  readonly runner: MinikubeCommandRunner;
  readonly executable: string;
  readonly kubectlExecutable: string;
  readonly kubectlRunner?: MinikubeCliControlPlaneOptions['kubectlRunner'];
  readonly pollIntervalMs: number;
  readonly readinessTimeoutSeconds: number;
}

/** Create the concrete stateless Minikube CLI control plane. */
export function createMinikubeCliControlPlane(
  options: MinikubeCliControlPlaneOptions = {},
): MinikubeControlPlane {
  const context: MinikubeCliContext = {
    runner: options.runner ?? createSubprocessMinikubeCommandRunner(),
    executable: options.executable ?? 'minikube',
    kubectlExecutable: options.kubectlExecutable ?? 'kubectl',
    ...(options.kubectlRunner === undefined ? {} : { kubectlRunner: options.kubectlRunner }),
    pollIntervalMs: options.pollIntervalMs ?? 500,
    readinessTimeoutSeconds: options.readinessTimeoutSeconds ?? 120,
  };
  assertNonNegativeInteger('pollIntervalMs', context.pollIntervalMs);
  assertPositiveInteger('readinessTimeoutSeconds', context.readinessTimeoutSeconds);
  return createControlPlane(context);
}

function createControlPlane(context: MinikubeCliContext): MinikubeControlPlane {
  return {
    validateAsync: (spec, signal) => validateMinikubeCliAsync(context, spec, signal),
    inspectAsync: (identity, signal) => inspectMinikubeAsync(context, identity, signal),
    ensureAsync: (spec, signal) => ensureMinikubeCliAsync(context, spec, signal),
    waitUntilReadyAsync: (identity, signal) => waitForMinikubeCliAsync(context, identity, signal),
    loadImagesAsync: (identity, images, signal) =>
      loadMinikubeImagesAsync(context, identity, images, signal),
    repairEndpointsAsync: (identity, workloads, signal) =>
      readMinikubeEndpointsAsync(context.runner, context.executable, identity, workloads, signal),
    suspendAsync: (identity, signal) => suspendMinikubeCliAsync(context, identity, signal),
    destroyAsync: (identity, signal) => destroyMinikubeCliAsync(context, identity, signal),
  };
}

async function validateMinikubeCliAsync(
  context: MinikubeCliContext,
  spec: MinikubeClusterSpec,
  signal?: AbortSignal,
): Promise<InfraResult<null>> {
  const commands: readonly [string, readonly string[]][] = [
    [context.executable, ['version', '--output=json']],
    [spec.driver, ['info']],
    [context.kubectlExecutable, ['version', '--client=true', '--output=json']],
  ];
  for (const [executable, arguments_] of commands) {
    const result = await runCheckedMinikubeCommandAsync(
      context.runner,
      executable,
      arguments_,
      signal,
    );
    if (!result.ok) return result;
  }
  return { ok: true, value: null, diagnostics: [] };
}

async function ensureMinikubeCliAsync(
  context: MinikubeCliContext,
  spec: MinikubeClusterSpec,
  signal?: AbortSignal,
) {
  const observed = await inspectMinikubeAsync(context, spec, signal);
  if (!observed.ok) return observed;
  if (observed.value.state === 'ready' && observed.value.configurationMatches) return observed;
  const started = await runCheckedMinikubeCommandAsync(
    context.runner,
    context.executable,
    createStartArguments(spec),
    signal,
  );
  return started.ok ? inspectMinikubeAsync(context, spec, signal) : started;
}

async function waitForMinikubeCliAsync(
  context: MinikubeCliContext,
  identity: MinikubeClusterIdentity,
  signal?: AbortSignal,
) {
  const deadline = Date.now() + context.readinessTimeoutSeconds * 1_000;
  for (;;) {
    const observed = await inspectMinikubeAsync(context, identity, signal);
    if (!observed.ok) return observed;
    if (observed.value.state === 'ready') return observed;
    if (Date.now() >= deadline) return readinessTimeout();
    await delayMinikubePollAsync(
      Math.min(context.pollIntervalMs, Math.max(0, deadline - Date.now())),
      signal,
    );
  }
}

async function loadMinikubeImagesAsync(
  context: MinikubeCliContext,
  identity: MinikubeClusterIdentity,
  images: readonly string[],
  signal?: AbortSignal,
): Promise<InfraResult<null>> {
  for (const image of images) {
    const loaded = await runCheckedMinikubeCommandAsync(
      context.runner,
      context.executable,
      ['image', 'load', image, '-p', identity.profile],
      signal,
    );
    if (!loaded.ok) return loaded;
  }
  return { ok: true, value: null, diagnostics: [] };
}

async function suspendMinikubeCliAsync(
  context: MinikubeCliContext,
  identity: MinikubeClusterIdentity,
  signal?: AbortSignal,
): Promise<InfraResult<null>> {
  const observed = await inspectMinikubeAsync(context, identity, signal);
  if (!observed.ok) return observed;
  if (observed.value.state === 'absent' || observed.value.state === 'stopped') {
    return { ok: true, value: null, diagnostics: [] };
  }
  const stopped = await runCheckedMinikubeCommandAsync(
    context.runner,
    context.executable,
    ['stop', '-p', identity.profile, '--output=json'],
    signal,
  );
  return stopped.ok ? { ok: true, value: null, diagnostics: [] } : stopped;
}

async function destroyMinikubeCliAsync(
  context: MinikubeCliContext,
  identity: MinikubeClusterIdentity,
  signal?: AbortSignal,
): Promise<InfraResult<null>> {
  const observed = await inspectMinikubeAsync(context, identity, signal);
  if (!observed.ok) return observed;
  if (observed.value.state === 'absent') {
    return { ok: true, value: null, diagnostics: [] };
  }
  const destroyed = await runCheckedMinikubeCommandAsync(
    context.runner,
    context.executable,
    ['delete', '-p', identity.profile, '--output=json'],
    signal,
  );
  return destroyed.ok ? { ok: true, value: null, diagnostics: [] } : destroyed;
}

function createStartArguments(spec: MinikubeClusterSpec): readonly string[] {
  return [
    'start',
    '-p',
    spec.profile,
    `--driver=${spec.driver}`,
    '--interactive=false',
    '--addons=ingress',
    ...(spec.cpus === undefined ? [] : [`--cpus=${spec.cpus}`]),
    ...(spec.memoryMiB === undefined ? [] : [`--memory=${spec.memoryMiB}mb`]),
  ];
}

function readinessTimeout(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'minikube-readiness-timeout',
        message: 'Timed out waiting for the Minikube cluster to become ready.',
      },
    ],
  };
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`Minikube ${name} must be a non-negative integer.`);
  }
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`Minikube ${name} must be a positive integer.`);
  }
}

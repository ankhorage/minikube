import type {
  InfraExecutionContext,
  InfraResult,
  InfraRuntimeDesiredState,
  InfraWorkloadSpec,
} from '@ankhorage/contracts/infra';
import { expect, it } from 'bun:test';

import { createInfraAdapter } from './index';
import { FakeMinikubeControlPlane } from './runtimeFixtures.test';
import type { MinikubeClusterObservation } from './types/minikubeRuntime';

it('plans and converges the complete local runtime lifecycle', async () => {
  const controlPlane = new FakeMinikubeControlPlane();
  const adapter = createInfraAdapter({ controlPlane });
  const context = createContext();
  const desired = createDesired();

  const initial = await adapter.planAsync(context, desired);
  expect(initial.ok && initial.value.every(({ operation }) => operation === 'create')).toBe(true);
  const ensured = await adapter.ensureAsync(context, desired);
  expect(ensured.ok).toBe(true);
  expect(controlPlane.calls).toContain('images:registry.example/api@sha256:abc');
  expect(controlPlane.calls).toContain('endpoints:api');
  const converged = await adapter.planAsync(context, desired);
  expect(converged.ok && converged.value.every(({ operation }) => operation === 'noop')).toBe(true);
  const status = await adapter.statusAsync(context, desired);
  expect(status.ok && status.value.every(({ state }) => state === 'ready')).toBe(true);

  expect((await adapter.suspendAsync(context, desired)).ok).toBe(true);
  expect(controlPlane.state).toBe('stopped');
  expect((await adapter.planAsync(context, desired)).ok).toBe(false);
  expect((await adapter.ensureAsync(context, desired)).ok).toBe(true);
  expect((await adapter.destroyAsync(context, desired, createDestroyRequest())).ok).toBe(true);
  expect(controlPlane.state).toBe('absent');
});

it('retains the Minikube cluster when persistent workload data is not authorized for deletion', async () => {
  const controlPlane = new FakeMinikubeControlPlane();
  const adapter = createInfraAdapter({ controlPlane });
  const context = createContext();
  const desired = createDesired(true);
  expect((await adapter.ensureAsync(context, desired)).ok).toBe(true);

  const result = await adapter.destroyAsync(context, desired, createDestroyRequest());
  expect(result.ok && result.value.resources.some(({ persistent }) => persistent)).toBe(true);
  expect(controlPlane.calls).not.toContain('destroy');
});

it('waits for transient running cluster access before destructive inspection', async () => {
  const controlPlane = new TransientMinikubeControlPlane();
  const adapter = createInfraAdapter({ controlPlane });
  const context = createContext();
  const desired = createDesired();
  expect((await adapter.ensureAsync(context, desired)).ok).toBe(true);
  const waitsBeforeDestroy = countCalls(controlPlane, 'wait');
  controlPlane.state = 'pending';

  const result = await adapter.destroyAsync(context, desired, createDestroyRequest());

  expect(result.ok).toBe(true);
  expect(countCalls(controlPlane, 'wait')).toBe(waitsBeforeDestroy + 1);
  expect(controlPlane.calls).toContain('destroy');
});

it('refuses cluster deletion while retained resources cannot be inspected', async () => {
  const controlPlane = new FakeMinikubeControlPlane();
  const adapter = createInfraAdapter({ controlPlane });
  const context = createContext();
  expect((await adapter.ensureAsync(context, createDesired())).ok).toBe(true);
  const desired = createDesired();
  expect((await adapter.suspendAsync(context, desired)).ok).toBe(true);
  const waitsBeforeDestroy = countCalls(controlPlane, 'wait');

  const result = await adapter.destroyAsync(context, desired, createDestroyRequest());
  expect(result.ok).toBe(false);
  expect(countCalls(controlPlane, 'wait')).toBe(waitsBeforeDestroy);
  expect(controlPlane.calls).not.toContain('destroy');
});

it('rejects non-local portable compute targets', async () => {
  const controlPlane = new FakeMinikubeControlPlane();
  const adapter = createInfraAdapter({ controlPlane });
  const desired: InfraRuntimeDesiredState<'minikube'> = {
    ...createDesired(),
    targets: [
      {
        id: 'remote',
        kind: 'ssh-host',
        os: 'linux',
        architecture: 'amd64',
        host: 'example.test',
        port: 22,
        user: 'root',
        hostKeyFingerprint: 'SHA256:test',
        credential: { source: 'control-plane', name: 'SSH_KEY' },
      },
    ],
  };

  const result = await adapter.validateAsync(createContext(), desired);
  expect(result.ok).toBe(false);
});

/*** Create a canonical local Minikube runtime request. */
function createDesired(persistent = false): InfraRuntimeDesiredState<'minikube'> {
  const workload: InfraWorkloadSpec = {
    id: 'api',
    artifact: { kind: 'image', image: 'registry.example/api@sha256:abc' },
    ports: { http: { port: 8080, publishedPort: 18_080 } },
    exposure: 'public',
    ...(persistent
      ? { persistence: { data: { id: 'data', mountPath: '/data', sizeGiB: 1, retention: 'retain' } } }
      : {}),
  };
  return {
    selection: { provider: 'minikube' },
    targets: [{ id: 'host', kind: 'local-host', os: 'darwin', architecture: 'arm64' }],
    workloads: [workload],
    availableOutputs: [],
  };
}

/*** Create the execution-only environment context. */
function createContext(): InfraExecutionContext {
  return {
    projectId: 'sample',
    environment: 'local',
    desired: {
      deployment: { compute: { provider: 'local' }, runtime: { provider: 'minikube' } },
      networking: { domain: 'api.sample.test' },
    },
    credentials: { resolveAsync: () => Promise.resolve({ ok: true, value: {}, diagnostics: [] }) },
    secrets: {
      resolveAsync: () => Promise.resolve({ ok: true, value: 'secret', diagnostics: [] }),
    },
  };
}

/*** Create exact non-persistent destruction confirmation. */
function createDestroyRequest() {
  return {
    projectId: 'sample',
    environment: 'local' as const,
    confirmation: { projectId: 'sample', environment: 'local' as const },
    persistence: { policy: 'retain' as const },
  };
}

/*** Count exact control-plane calls without mutating the fixture history. */
function countCalls(controlPlane: FakeMinikubeControlPlane, call: string): number {
  return controlPlane.calls.filter((candidate) => candidate === call).length;
}

class TransientMinikubeControlPlane extends FakeMinikubeControlPlane {
  override waitUntilReadyAsync(): Promise<InfraResult<MinikubeClusterObservation>> {
    this.state = 'ready';
    return super.waitUntilReadyAsync();
  }
}

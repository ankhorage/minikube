import type { InfraWorkloadSpec } from '@ankhorage/contracts/infra';
import { expect, it } from 'bun:test';

import { createSubprocessMinikubeCommandRunner } from './features/cluster-runtime/adapters/createSubprocessMinikubeCommandRunner';
import type {
  MinikubeClusterSpec,
  MinikubeCommandRequest,
  MinikubeCommandResult,
  MinikubeCommandRunner,
} from './index';
import { createMinikubeCliControlPlane } from './index';

it('operates one exact Minikube profile through the stateless CLI boundary', async () => {
  const runner = new FakeMinikubeCommandRunner();
  const controlPlane = createMinikubeCliControlPlane({
    runner,
    kubectlRunner: { runAsync: (request) => runner.runAsync(request) },
    pollIntervalMs: 0,
    readinessTimeoutSeconds: 1,
  });
  const spec = createSpec();

  expect((await controlPlane.validateAsync(spec)).ok).toBe(true);
  const absent = await controlPlane.inspectAsync(spec);
  expect(absent.ok && absent.value.state === 'absent').toBe(true);

  const ensured = await controlPlane.ensureAsync(spec);
  expect(ensured.ok && ensured.value.state === 'ready').toBe(true);
  expect(ensured.ok && ensured.value.configurationMatches).toBe(true);
  expect(ensured.ok && ensured.value.api !== undefined).toBe(true);
  expect(
    runner.calls.some(
      ({ arguments: arguments_ }) =>
        arguments_.join(' ') ===
        'start -p sample-local --driver=docker --interactive=false --addons=ingress --ports=49152:49152 --cpus=3 --memory=4096mb',
    ),
  ).toBe(true);

  expect((await controlPlane.waitUntilReadyAsync(spec)).ok).toBe(true);
  expect((await controlPlane.loadImagesAsync(spec, ['registry.example/api:1'])).ok).toBe(true);
  const endpoints = await controlPlane.repairEndpointsAsync(spec, [createPublishedWorkload()]);
  expect(endpoints.ok && endpoints.value[0]?.value).toBe('http://127.0.0.1:49152');

  expect((await controlPlane.suspendAsync(spec)).ok).toBe(true);
  expect(runner.state).toBe('stopped');
  expect((await controlPlane.destroyAsync(spec)).ok).toBe(true);
  expect(runner.state).toBe('absent');
});

it('retries a transient Minikube image load failure', async () => {
  const runner = new FakeMinikubeCommandRunner();
  runner.imageLoadFailuresRemaining = 1;
  const controlPlane = createMinikubeCliControlPlane({ runner, pollIntervalMs: 0 });

  const loaded = await controlPlane.loadImagesAsync(createSpec(), ['registry.example/api:1']);

  expect(loaded.ok).toBe(true);
  expect(imageLoadCalls(runner)).toHaveLength(2);
});

it('bounds repeated Minikube image load failures', async () => {
  const runner = new FakeMinikubeCommandRunner();
  runner.imageLoadFailuresRemaining = 3;
  const controlPlane = createMinikubeCliControlPlane({ runner, pollIntervalMs: 0 });

  const loaded = await controlPlane.loadImagesAsync(createSpec(), ['registry.example/api:1']);

  expect(loaded.ok).toBe(false);
  expect(imageLoadCalls(runner)).toHaveLength(3);
});

it('prefers the declared public origin when it addresses the fixed listener', async () => {
  const endpoints = await createMinikubeCliControlPlane().repairEndpointsAsync(
    createSpec(),
    [createPublishedWorkload()],
    'http://192.0.2.10:49152',
  );

  expect(endpoints.ok && endpoints.value[0]?.value).toBe('http://192.0.2.10:49152');
});

it('reports profile drift and sanitizes failed provider output', async () => {
  const runner = new FakeMinikubeCommandRunner();
  runner.state = 'ready';
  runner.driver = 'podman';
  const controlPlane = createMinikubeCliControlPlane({ runner });
  const observed = await controlPlane.inspectAsync(createSpec());
  expect(observed.ok && observed.value.configurationMatches).toBe(false);
  const convergence = await controlPlane.ensureAsync(createSpec());
  expect(
    !convergence.ok &&
      convergence.diagnostics.some(({ code }) => code === 'minikube-profile-configuration-drift'),
  ).toBe(true);

  runner.failNext = true;
  const failed = await controlPlane.validateAsync(createSpec());
  expect(failed.ok).toBe(false);
  expect(JSON.stringify(failed)).not.toContain('provider-secret-output');
});

it('executes concrete Minikube commands without a shell', async () => {
  const runner = createSubprocessMinikubeCommandRunner();
  const result = await runner.runAsync({
    executable: process.execPath,
    arguments: ['-e', 'process.stdout.write("minikube-runner-ok")'],
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe('minikube-runner-ok');
});

function createSpec(): MinikubeClusterSpec {
  return {
    projectId: 'sample',
    environment: 'local',
    profile: 'sample-local',
    target: { id: 'host', kind: 'local-host', os: 'darwin', architecture: 'arm64' },
    driver: 'docker',
    cpus: 3,
    memoryMiB: 4096,
    publishedPorts: [49_152],
  };
}

/*** Create one public workload with an exact host listener. */
function createPublishedWorkload(): InfraWorkloadSpec {
  return {
    id: 'api',
    artifact: { kind: 'image', image: 'registry.example/api:1' },
    ports: { http: { port: 8080, publishedPort: 49_152 } },
    exposure: 'public',
  };
}

function imageLoadCalls(runner: FakeMinikubeCommandRunner): readonly MinikubeCommandRequest[] {
  return runner.calls.filter(
    ({ executable, arguments: [command, subcommand] }) =>
      executable === 'minikube' && command === 'image' && subcommand === 'load',
  );
}

class FakeMinikubeCommandRunner implements MinikubeCommandRunner {
  readonly calls: MinikubeCommandRequest[] = [];
  state: 'absent' | 'ready' | 'stopped' = 'absent';
  driver = 'docker';
  failNext = false;
  imageLoadFailuresRemaining = 0;
  publishedPorts: readonly number[] = [];

  runAsync(request: MinikubeCommandRequest): Promise<MinikubeCommandResult> {
    this.calls.push(request);
    if (this.failNext) {
      this.failNext = false;
      return result(1, '', 'provider-secret-output');
    }
    if (request.executable !== 'minikube') return result(0);
    return this.runMinikubeAsync(request);
  }

  private runMinikubeAsync(request: MinikubeCommandRequest): Promise<MinikubeCommandResult> {
    const [command, subcommand] = request.arguments;
    if (command === 'version') return result(0, '{}');
    if (command === 'profile' && subcommand === 'list') return result(0, this.profileList());
    if (command === 'status') {
      return this.state === 'ready'
        ? result(0, 'Running|Running|Running|Configured')
        : result(7, 'Stopped|Stopped|Stopped|Misconfigured');
    }
    if (command === 'start') {
      this.state = 'ready';
      this.publishedPorts = request.arguments.flatMap((argument) => {
        const match = /^--ports=(\d+):\d+$/u.exec(argument);
        return match?.[1] === undefined ? [] : [Number(match[1])];
      });
      return result(0);
    }
    if (command === 'image' && subcommand === 'load' && this.imageLoadFailuresRemaining > 0) {
      this.imageLoadFailuresRemaining -= 1;
      return result(1, '', 'transient image load failure');
    }
    if (command === 'service' && subcommand === 'list') {
      return result(
        0,
        JSON.stringify({ services: [{ name: 'api', urls: ['http://127.0.0.1:49152'] }] }),
      );
    }
    if (command === 'stop') {
      this.state = 'stopped';
      return result(0);
    }
    if (command === 'delete') {
      this.state = 'absent';
      return result(0);
    }
    return result(0);
  }

  private profileList(): string {
    return JSON.stringify({
      invalid: [],
      valid:
        this.state === 'absent'
          ? []
          : [
              {
                Name: 'sample-local',
                Config: {
                  Driver: this.driver,
                  CPUs: 3,
                  Memory: 4096,
                  ExposedPorts: this.publishedPorts.map((port) => `${port}:${port}`),
                },
              },
            ],
    });
  }
}

function result(exitCode: number, stdout = '', stderr = ''): Promise<MinikubeCommandResult> {
  return Promise.resolve({ exitCode, stdout, stderr });
}

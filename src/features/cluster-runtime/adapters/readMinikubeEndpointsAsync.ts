import type { InfraResult, InfraWorkloadSpec } from '@ankhorage/contracts/infra';

import type {
  MinikubeClusterIdentity,
  MinikubeCommandRunner,
  MinikubeEndpointOutput,
} from '../../../types/minikubeRuntime';
import { runCheckedMinikubeCommandAsync } from './minikubeCliProcess';

/** Discover already reachable service URLs without starting unmanaged background tunnels. */
export async function readMinikubeEndpointsAsync(
  runner: MinikubeCommandRunner,
  executable: string,
  identity: MinikubeClusterIdentity,
  workloads: readonly InfraWorkloadSpec[],
  signal?: AbortSignal,
): Promise<InfraResult<readonly MinikubeEndpointOutput[]>> {
  if (workloads.length === 0) return { ok: true, value: [], diagnostics: [] };
  const namespace = toKubernetesName(`${identity.projectId}-${identity.environment}`);
  const listed = await runCheckedMinikubeCommandAsync(
    runner,
    executable,
    ['service', 'list', '-p', identity.profile, '--namespace', namespace, '--output=json'],
    signal,
  );
  if (!listed.ok) return listed;
  const services = readServiceUrls(listed.value.stdout);
  if (!services.ok) return services;
  return {
    ok: true,
    value: workloads.flatMap((workload) => createEndpoint(identity, workload, services.value)),
    diagnostics: [],
  };
}

function createEndpoint(
  identity: MinikubeClusterIdentity,
  workload: InfraWorkloadSpec,
  services: ReadonlyMap<string, string>,
): readonly MinikubeEndpointOutput[] {
  const url = services.get(toKubernetesName(workload.id));
  return url === undefined
    ? []
    : [
        {
          owner: {
            projectId: identity.projectId,
            environment: identity.environment,
            adapter: 'minikube',
            resourceId: `endpoint:${workload.id}`,
          },
          name: 'localUrl',
          visibility: 'public',
          value: url,
        },
      ];
}

/** Recursively collect service names and their first concrete URL. */
function readServiceUrls(input: string): InfraResult<ReadonlyMap<string, string>> {
  try {
    const parsed = JSON.parse(input) as unknown;
    const result = new Map<string, string>();
    collectServiceUrls(parsed, result);
    return { ok: true, value: result, diagnostics: [] };
  } catch {
    return invalidOutput();
  }
}

function collectServiceUrls(value: unknown, result: Map<string, string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectServiceUrls(entry, result);
    return;
  }
  if (!isRecord(value)) return;
  const { name: lowerName, Name: upperName, urls: lowerUrls, URLs: upperUrls } = value;
  const name = typeof lowerName === 'string' ? lowerName : upperName;
  const urls = Array.isArray(lowerUrls) ? lowerUrls : upperUrls;
  const url = Array.isArray(urls)
    ? urls.find((entry): entry is string => typeof entry === 'string')
    : undefined;
  if (typeof name === 'string' && url !== undefined) result.set(name, url);
  for (const entry of Object.values(value)) collectServiceUrls(entry, result);
}

function toKubernetesName(value: string): string {
  const normalized =
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'resource';
  if (normalized.length <= 63) return normalized;
  const suffix = hash(value).toString(36).padStart(7, '0').slice(-7);
  return `${normalized.slice(0, 55).replace(/-+$/g, '')}-${suffix}`;
}

function hash(value: string): number {
  let result = 2_166_136_261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidOutput(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'minikube-output-invalid',
        message: 'Minikube returned an invalid machine-readable response.',
      },
    ],
  };
}

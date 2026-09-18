import type { InfraResult, InfraWorkloadSpec } from '@ankhorage/contracts/infra';

import type {
  MinikubeClusterIdentity,
  MinikubeEndpointOutput,
} from '../../../types/minikubeRuntime';

/*** Resolve deterministic reachable URLs for ports exposed by the owned Minikube profile. */
export function readMinikubeEndpoints(
  identity: MinikubeClusterIdentity,
  workloads: readonly InfraWorkloadSpec[],
  publicBaseUrl?: string,
): InfraResult<readonly MinikubeEndpointOutput[]> {
  const preferredOrigin = parseOrigin(publicBaseUrl);
  return {
    ok: true,
    value: workloads.flatMap((workload) => createEndpoint(identity, workload, preferredOrigin)),
    diagnostics: [],
  };
}

/*** Create one output per public workload with a fixed published listener. */
function createEndpoint(
  identity: MinikubeClusterIdentity,
  workload: InfraWorkloadSpec,
  preferredOrigin: URL | undefined,
): readonly MinikubeEndpointOutput[] {
  const publishedPort = Object.entries(workload.ports ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .find(([, port]) => port.publishedPort !== undefined)?.[1].publishedPort;
  if (publishedPort === undefined) return [];
  const value = matchesPort(preferredOrigin, publishedPort)
    ? preferredOrigin.origin
    : `http://127.0.0.1:${publishedPort}`;
  return [
    {
      owner: {
        projectId: identity.projectId,
        environment: identity.environment,
        adapter: 'minikube',
        resourceId: `endpoint:${workload.id}`,
      },
      name: 'localUrl',
      visibility: 'public',
      value,
    },
  ];
}

/*** Parse the optional desired public origin without inventing endpoint state. */
function parseOrigin(value: string | undefined): URL | undefined {
  if (value === undefined) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

/*** Match default and explicit origin ports to one fixed listener. */
function matchesPort(origin: URL | undefined, port: number): origin is URL {
  if (origin === undefined) return false;
  const originPort =
    origin.port === '' ? (origin.protocol === 'https:' ? 443 : 80) : Number(origin.port);
  return originPort === port;
}

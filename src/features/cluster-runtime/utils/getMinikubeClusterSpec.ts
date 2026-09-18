import type { InfraExecutionContext, InfraResult } from '@ankhorage/contracts/infra';

import type { MinikubeClusterSpec, MinikubeDesiredState } from '../../../types/minikubeRuntime';
import { getMinikubeClusterIdentity } from './getMinikubeClusterIdentity';

/*** Validate and create the local Minikube cluster specification. */
export function getMinikubeClusterSpec(
  context: InfraExecutionContext,
  desired: MinikubeDesiredState,
): InfraResult<MinikubeClusterSpec> {
  const identity = getMinikubeClusterIdentity(context);
  if (!identity.ok) return identity;
  const localTargets = desired.targets.filter(
    (target): target is Extract<(typeof desired.targets)[number], { kind: 'local-host' }> =>
      target.kind === 'local-host',
  );
  const [target] = localTargets;
  if (desired.targets.length !== 1 || target === undefined) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'minikube-target-invalid',
          message: 'Minikube requires exactly one portable local-host compute target.',
        },
      ],
    };
  }
  return {
    ok: true,
    value: {
      ...identity.value,
      target,
      driver: desired.selection.driver ?? 'docker',
      ...(desired.selection.cpus === undefined ? {} : { cpus: desired.selection.cpus }),
      ...(desired.selection.memoryMiB === undefined
        ? {}
        : { memoryMiB: desired.selection.memoryMiB }),
      publishedPorts: [
        ...new Set(
          desired.workloads.flatMap((workload) =>
            Object.entries(workload.ports ?? {})
              .sort(([left], [right]) => left.localeCompare(right))
              .flatMap(([, { publishedPort }]) =>
                publishedPort === undefined ? [] : [publishedPort],
              ),
          ),
        ),
      ].sort((left, right) => left - right),
    },
    diagnostics: [],
  };
}

import type { InfraRuntimeAdapter } from '@ankhorage/contracts/infra';

import { infraAdapterDescriptor } from '../../../constants/infra';
import type { MinikubeAdapterOptions } from '../../../types/minikubeRuntime';
import { createMinikubeCliControlPlane } from '../adapters/createMinikubeCliControlPlane';
import { destroyMinikubeRuntimeAsync } from '../application/use-cases/destroyMinikubeRuntimeAsync';
import { ensureMinikubeRuntimeAsync } from '../application/use-cases/ensureMinikubeRuntimeAsync';
import { getMinikubeStatusAsync } from '../application/use-cases/getMinikubeStatusAsync';
import { planMinikubeRuntimeAsync } from '../application/use-cases/planMinikubeRuntimeAsync';
import { suspendMinikubeRuntimeAsync } from '../application/use-cases/suspendMinikubeRuntimeAsync';
import { validateMinikubeRuntimeAsync } from '../application/use-cases/validateMinikubeRuntimeAsync';

/***
 * Create the canonical Minikube runtime adapter entrypoint.
 *
 * The caller supplies a Minikube-specific command boundary. Standard workload projection and
 * reconciliation are delegated to the published Kubernetes driver.
 *
 * @readme
 */
export function createInfraAdapter(
  options?: MinikubeAdapterOptions,
): InfraRuntimeAdapter<'minikube'> {
  const resolved = options ?? { controlPlane: createMinikubeCliControlPlane() };
  return {
    descriptor: infraAdapterDescriptor,
    validateAsync: (context, desired) => validateMinikubeRuntimeAsync(resolved, context, desired),
    planAsync: (context, desired) => planMinikubeRuntimeAsync(resolved, context, desired),
    ensureAsync: (context, desired) => ensureMinikubeRuntimeAsync(resolved, context, desired),
    statusAsync: (context, desired) => getMinikubeStatusAsync(resolved, context, desired),
    suspendAsync: (context, desired) => suspendMinikubeRuntimeAsync(resolved, context, desired),
    destroyAsync: (context, desired, request) =>
      destroyMinikubeRuntimeAsync(resolved, context, desired, request),
  };
}

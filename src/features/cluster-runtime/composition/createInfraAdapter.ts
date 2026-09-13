import type { InfraRuntimeAdapter } from '@ankhorage/contracts/infra';

import { infraAdapterDescriptor } from '../../../constants/infra';
import type { MinikubeAdapterOptions } from '../../../types/minikubeRuntime';
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
  options: MinikubeAdapterOptions,
): InfraRuntimeAdapter<'minikube'> {
  return {
    descriptor: infraAdapterDescriptor,
    validateAsync: (context, desired) => validateMinikubeRuntimeAsync(options, context, desired),
    planAsync: (context, desired) => planMinikubeRuntimeAsync(options, context, desired),
    ensureAsync: (context, desired) => ensureMinikubeRuntimeAsync(options, context, desired),
    statusAsync: (context) => getMinikubeStatusAsync(options, context),
    suspendAsync: (context) => suspendMinikubeRuntimeAsync(options, context),
    destroyAsync: (context, request) => destroyMinikubeRuntimeAsync(options, context, request),
  };
}

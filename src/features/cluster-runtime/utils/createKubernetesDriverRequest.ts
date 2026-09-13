import type { InfraExecutionContext } from '@ankhorage/contracts/infra';
import type { KubernetesDriverRequest } from '@ankhorage/kubernetes';

import type { MinikubeDesiredState } from '../../../types/minikubeRuntime';

/*** Map runtime desired state to the shared Kubernetes driver boundary. */
export function createKubernetesDriverRequest(
  context: InfraExecutionContext,
  desired: MinikubeDesiredState,
): KubernetesDriverRequest {
  return {
    context,
    ownerAdapter: 'minikube',
    workloads: desired.workloads,
    availableOutputs: desired.availableOutputs,
  };
}

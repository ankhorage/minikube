import type {
  InfraExecutionContext,
  InfraResourceStatus,
  InfraResult,
} from '@ankhorage/contracts/infra';
import { createKubernetesDriver } from '@ankhorage/kubernetes';

import type { MinikubeAdapterOptions } from '../../../../types/minikubeRuntime';
import { createMinikubeClusterOwner } from '../../utils/createMinikubeClusterOwner';
import { getMinikubeClusterIdentity } from '../../utils/getMinikubeClusterIdentity';

/*** Aggregate Minikube cluster and owned Kubernetes workload status. */
export async function getMinikubeStatusAsync(
  options: MinikubeAdapterOptions,
  context: InfraExecutionContext,
): Promise<InfraResult<readonly InfraResourceStatus[]>> {
  const identity = getMinikubeClusterIdentity(context);
  if (!identity.ok) return identity;
  const observed = await options.controlPlane.inspectAsync(identity.value, context.signal);
  if (!observed.ok) return observed;
  const cluster = createMinikubeClusterOwner(context, identity.value);
  const clusterStatus: InfraResourceStatus = {
    owner: cluster.identity,
    state: observed.value.state,
    ...(observed.value.detail === undefined ? {} : { detail: observed.value.detail }),
  };
  if (observed.value.api === undefined) {
    return { ok: true, value: [clusterStatus], diagnostics: [] };
  }
  const workloads = await createKubernetesDriver({ api: observed.value.api }).statusAsync({
    context,
    ownerAdapter: 'minikube',
    workloads: [],
    availableOutputs: [],
  });
  if (!workloads.ok) return workloads;
  return { ok: true, value: [clusterStatus, ...workloads.value], diagnostics: [] };
}

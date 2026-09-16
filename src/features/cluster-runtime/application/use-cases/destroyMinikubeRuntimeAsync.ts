import type {
  InfraDestroyRequest,
  InfraExecutionContext,
  InfraReconcileResult,
  InfraResult,
} from '@ankhorage/contracts/infra';
import { createKubernetesDriver } from '@ankhorage/kubernetes';

import type {
  MinikubeAdapterOptions,
  MinikubeDesiredState,
} from '../../../../types/minikubeRuntime';
import { createMinikubeClusterOwner } from '../../utils/createMinikubeClusterOwner';
import { getMinikubeClusterIdentity } from '../../utils/getMinikubeClusterIdentity';

/*** Remove owned workloads before deleting Minikube, retaining the cluster when data survives. */
export async function destroyMinikubeRuntimeAsync(
  options: MinikubeAdapterOptions,
  context: InfraExecutionContext,
  _desired: MinikubeDesiredState,
  request: InfraDestroyRequest,
): Promise<InfraResult<InfraReconcileResult>> {
  if (!isConfirmed(context, request)) return unconfirmedDestroy();
  const identity = getMinikubeClusterIdentity(context);
  if (!identity.ok) return identity;
  const observed = await options.controlPlane.inspectAsync(identity.value, context.signal);
  if (!observed.ok) return observed;
  const cluster = createMinikubeClusterOwner(context, identity.value);
  if (observed.value.state === 'absent') {
    return { ok: true, value: { resources: [], outputs: [] }, diagnostics: [] };
  }
  const accessible =
    observed.value.api === undefined && observed.value.state !== 'stopped'
      ? await options.controlPlane.waitUntilReadyAsync(identity.value, context.signal)
      : observed;
  if (!accessible.ok) return accessible;
  if (accessible.value.api === undefined) return missingDestroyAccess();
  const removed = await createKubernetesDriver({ api: accessible.value.api }).removeAsync(
    { context, ownerAdapter: 'minikube', workloads: [], availableOutputs: [] },
    request,
  );
  if (!removed.ok) return removed;
  if (removed.value.resources.length > 0) {
    return {
      ok: true,
      value: { resources: [cluster, ...removed.value.resources], outputs: [] },
      diagnostics: [],
    };
  }
  const destroyed = await options.controlPlane.destroyAsync(identity.value, context.signal);
  return destroyed.ok
    ? { ok: true, value: { resources: [], outputs: [] }, diagnostics: [] }
    : destroyed;
}

/*** Refuse cluster deletion when persistent Kubernetes ownership cannot be inspected. */
function missingDestroyAccess(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'minikube-destroy-access-required',
        message: 'Minikube must be running so retained Kubernetes resources can be verified.',
      },
    ],
  };
}

/*** Require exact project and environment confirmation before any destructive inspection. */
function isConfirmed(context: InfraExecutionContext, request: InfraDestroyRequest): boolean {
  return (
    request.projectId === context.projectId &&
    request.environment === context.environment &&
    request.confirmation.projectId === context.projectId &&
    request.confirmation.environment === context.environment
  );
}

/*** Return the canonical Minikube destructive-confirmation diagnostic. */
function unconfirmedDestroy(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'minikube-destroy-unconfirmed',
        message: 'Minikube destroy requires exact project and environment confirmation.',
      },
    ],
  };
}

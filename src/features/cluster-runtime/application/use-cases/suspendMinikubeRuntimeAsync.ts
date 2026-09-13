import type {
  InfraExecutionContext,
  InfraReconcileResult,
  InfraResult,
} from '@ankhorage/contracts/infra';

import type { MinikubeAdapterOptions } from '../../../../types/minikubeRuntime';
import { createMinikubeClusterOwner } from '../../utils/createMinikubeClusterOwner';
import { getMinikubeClusterIdentity } from '../../utils/getMinikubeClusterIdentity';

/*** Stop the Minikube profile while preserving its cluster and persistent data. */
export async function suspendMinikubeRuntimeAsync(
  options: MinikubeAdapterOptions,
  context: InfraExecutionContext,
): Promise<InfraResult<InfraReconcileResult>> {
  const identity = getMinikubeClusterIdentity(context);
  if (!identity.ok) return identity;
  const suspended = await options.controlPlane.suspendAsync(identity.value, context.signal);
  if (!suspended.ok) return suspended;
  return {
    ok: true,
    value: { resources: [createMinikubeClusterOwner(context, identity.value)], outputs: [] },
    diagnostics: [],
  };
}

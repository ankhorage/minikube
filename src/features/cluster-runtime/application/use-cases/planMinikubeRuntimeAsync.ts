import type {
  InfraExecutionContext,
  InfraPlanAction,
  InfraResult,
} from '@ankhorage/contracts/infra';
import { createKubernetesDriver, projectKubernetesResourcesAsync } from '@ankhorage/kubernetes';

import type {
  MinikubeAdapterOptions,
  MinikubeClusterObservation,
  MinikubeDesiredState,
} from '../../../../types/minikubeRuntime';
import { createKubernetesDriverRequest } from '../../utils/createKubernetesDriverRequest';
import { createMinikubeClusterOwner } from '../../utils/createMinikubeClusterOwner';
import { getMinikubeClusterSpec } from '../../utils/getMinikubeClusterSpec';
import { validateMinikubeRuntimeAsync } from './validateMinikubeRuntimeAsync';

/*** Plan Minikube cluster and standard Kubernetes resources without mutation. */
export async function planMinikubeRuntimeAsync(
  options: MinikubeAdapterOptions,
  context: InfraExecutionContext,
  desired: MinikubeDesiredState,
): Promise<InfraResult<readonly InfraPlanAction[]>> {
  const validation = await validateMinikubeRuntimeAsync(options, context, desired);
  if (!validation.ok) return validation;
  const spec = getMinikubeClusterSpec(context, desired);
  if (!spec.ok) return spec;
  const observed = await options.controlPlane.inspectAsync(spec.value, context.signal);
  if (!observed.ok) return observed;
  const owner = createMinikubeClusterOwner(context, spec.value);
  const cluster = createClusterPlan(owner, observed.value);
  const request = createKubernetesDriverRequest(context, desired);
  if (observed.value.api === undefined && observed.value.state !== 'absent') {
    return missingPlanAccess();
  }
  const workload = observed.value.api
    ? await createKubernetesDriver({ api: observed.value.api }).planAsync(request)
    : await createPreClusterPlanAsync(request, owner.identity);
  if (!workload.ok) return workload;
  return {
    ok: true,
    value: [cluster, ...workload.value.map((action) => linkRootAction(action, owner.identity))],
    diagnostics: [],
  };
}

/*** Create the plan action for Minikube profile convergence. */
function createClusterPlan(
  owner: ReturnType<typeof createMinikubeClusterOwner>,
  observed: MinikubeClusterObservation,
): InfraPlanAction {
  const operation =
    observed.state === 'absent'
      ? 'create'
      : observed.state === 'ready' && observed.configurationMatches
        ? 'noop'
        : 'update';
  return {
    owner: owner.identity,
    operation,
    impact: operation === 'update' ? 'interrupts-service' : 'none',
    detail: `Minikube profile ${owner.externalId}: ${operation}.`,
    dependsOn: [],
  };
}

/*** Refuse to guess at existing workload changes while the cluster API is unavailable. */
function missingPlanAccess(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'minikube-plan-access-required',
        message: 'Minikube must be running so existing Kubernetes resources can be planned safely.',
      },
    ],
  };
}

/*** Project create actions before cluster API access exists. */
async function createPreClusterPlanAsync(
  request: Parameters<typeof projectKubernetesResourcesAsync>[0],
  cluster: InfraPlanAction['owner'],
): Promise<InfraResult<readonly InfraPlanAction[]>> {
  const projection = await projectKubernetesResourcesAsync(request);
  if (!projection.ok) return projection;
  return {
    ok: true,
    value: projection.value.resources.map(({ owner }) => ({
      owner: owner.identity,
      operation: 'create',
      impact: 'none',
      detail: `Kubernetes resource ${owner.identity.resourceId}: create.`,
      dependsOn: owner.dependsOn.length === 0 ? [cluster] : owner.dependsOn,
    })),
    diagnostics: [],
  };
}

/*** Link root Kubernetes actions to the Minikube cluster owner. */
function linkRootAction(
  action: InfraPlanAction,
  cluster: InfraPlanAction['owner'],
): InfraPlanAction {
  return action.dependsOn.length === 0 ? { ...action, dependsOn: [cluster] } : action;
}

import type {
  InfraExecutionContext,
  InfraOwnedResource,
  InfraReconcileResult,
  InfraResult,
} from '@ankhorage/contracts/infra';
import { createKubernetesDriver } from '@ankhorage/kubernetes';

import type {
  MinikubeAdapterOptions,
  MinikubeDesiredState,
} from '../../../../types/minikubeRuntime';
import { createKubernetesDriverRequest } from '../../utils/createKubernetesDriverRequest';
import { createMinikubeClusterOwner } from '../../utils/createMinikubeClusterOwner';
import { getMinikubeClusterSpec } from '../../utils/getMinikubeClusterSpec';
import { validateMinikubeRuntimeAsync } from './validateMinikubeRuntimeAsync';

/*** Ensure the Minikube cluster, bridge images, reconcile workloads and repair local endpoints. */
export async function ensureMinikubeRuntimeAsync(
  options: MinikubeAdapterOptions,
  context: InfraExecutionContext,
  desired: MinikubeDesiredState,
): Promise<InfraResult<InfraReconcileResult>> {
  const validation = await validateMinikubeRuntimeAsync(options, context, desired);
  if (!validation.ok) return validation;
  const spec = getMinikubeClusterSpec(context, desired);
  if (!spec.ok) return spec;
  const ensured = await options.controlPlane.ensureAsync(spec.value, context.signal);
  if (!ensured.ok) return ensured;
  const ready = await options.controlPlane.waitUntilReadyAsync(spec.value, context.signal);
  if (!ready.ok) return ready;
  if (ready.value.api === undefined) return missingClusterAccess();
  const images = [...new Set(desired.workloads.map(({ artifact }) => artifact.image))].sort();
  const loaded = await options.controlPlane.loadImagesAsync(spec.value, images, context.signal);
  if (!loaded.ok) return loaded;
  const driver = createKubernetesDriver({ api: ready.value.api });
  const request = createKubernetesDriverRequest(context, desired);
  const reconciled = await driver.reconcileAsync(request);
  if (!reconciled.ok) return reconciled;
  const readiness = await driver.waitUntilReadyAsync(request);
  if (!readiness.ok) return readiness;
  const endpoints = await options.controlPlane.repairEndpointsAsync(
    spec.value,
    desired.workloads.filter(({ exposure }) => exposure === 'public'),
    context.desired.networking?.publicBaseUrl,
    context.signal,
  );
  if (!endpoints.ok) return endpoints;
  const cluster = createMinikubeClusterOwner(context, spec.value);
  return {
    ok: true,
    value: {
      resources: [
        cluster,
        ...reconciled.value.resources.map((owner) => linkRootOwner(owner, cluster)),
      ],
      outputs: [...reconciled.value.outputs, ...endpoints.value],
    },
    diagnostics: [],
  };
}

/*** Reject a ready cluster observation that omitted authenticated Kubernetes access. */
function missingClusterAccess(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'minikube-cluster-access-missing',
        message: 'Minikube became ready without authenticated Kubernetes API access.',
      },
    ],
  };
}

/*** Link root Kubernetes resources to the Minikube cluster owner. */
function linkRootOwner(owner: InfraOwnedResource, cluster: InfraOwnedResource): InfraOwnedResource {
  return owner.dependsOn.length === 0 ? { ...owner, dependsOn: [cluster.identity] } : owner;
}

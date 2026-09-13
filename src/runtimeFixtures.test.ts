import type { InfraResult, InfraWorkloadSpec } from '@ankhorage/contracts/infra';
import type {
  KubernetesApi,
  KubernetesOwnershipQuery,
  KubernetesResource,
  KubernetesResourceObservation,
  KubernetesResourceReference,
} from '@ankhorage/kubernetes';

import type {
  MinikubeClusterIdentity,
  MinikubeClusterObservation,
  MinikubeClusterSpec,
  MinikubeControlPlane,
} from './index';

/** Generic in-memory boundary fixture for Minikube and Kubernetes lifecycle acceptance. */
export class FakeMinikubeControlPlane implements MinikubeControlPlane {
  readonly api = new FakeKubernetesApi();
  readonly calls: string[] = [];
  state: MinikubeClusterObservation['state'] = 'absent';

  validateAsync(): Promise<InfraResult<null>> {
    this.calls.push('validate');
    return success(null);
  }

  inspectAsync(): Promise<InfraResult<MinikubeClusterObservation>> {
    this.calls.push('inspect');
    return success(this.observation());
  }

  ensureAsync(_spec: MinikubeClusterSpec): Promise<InfraResult<MinikubeClusterObservation>> {
    this.calls.push('ensure');
    this.state = 'ready';
    return success(this.observation());
  }

  waitUntilReadyAsync(): Promise<InfraResult<MinikubeClusterObservation>> {
    this.calls.push('wait');
    return success(this.observation());
  }

  loadImagesAsync(
    _identity: MinikubeClusterIdentity,
    images: readonly string[],
  ): Promise<InfraResult<null>> {
    this.calls.push(`images:${images.join(',')}`);
    return success(null);
  }

  repairEndpointsAsync(identity: MinikubeClusterIdentity, workloads: readonly InfraWorkloadSpec[]) {
    this.calls.push(`endpoints:${workloads.map(({ id }) => id).join(',')}`);
    return success(
      workloads.map(({ id }) => ({
        owner: {
          projectId: identity.projectId,
          environment: identity.environment,
          adapter: 'minikube' as const,
          resourceId: `endpoint:${id}`,
        },
        name: 'localUrl',
        visibility: 'public' as const,
        value: `http://${id}.test`,
      })),
    );
  }

  suspendAsync(): Promise<InfraResult<null>> {
    this.calls.push('suspend');
    this.state = 'stopped';
    return success(null);
  }

  destroyAsync(): Promise<InfraResult<null>> {
    this.calls.push('destroy');
    this.state = 'absent';
    return success(null);
  }

  /** Return the current cluster observation with access only for an existing cluster. */
  private observation(): MinikubeClusterObservation {
    return {
      state: this.state,
      configurationMatches: true,
      ...(this.state === 'ready' ? { api: this.api } : {}),
    };
  }
}

/** Generic Kubernetes API fixture used through the published driver boundary. */
class FakeKubernetesApi implements KubernetesApi {
  readonly resources: KubernetesResource[] = [];

  listOwnedAsync(query: KubernetesOwnershipQuery): Promise<readonly KubernetesResource[]> {
    return Promise.resolve(
      this.resources.filter(({ metadata }) => includesLabels(metadata.labels, query.labels)),
    );
  }

  applyAsync(resource: KubernetesResource): Promise<void> {
    const index = this.resources.findIndex((candidate) => sameResource(candidate, resource));
    if (index === -1) this.resources.push(resource);
    else this.resources.splice(index, 1, resource);
    return Promise.resolve();
  }

  deleteAsync(reference: KubernetesResourceReference): Promise<void> {
    const index = this.resources.findIndex((resource) => sameResource(resource, reference));
    if (index >= 0) this.resources.splice(index, 1);
    return Promise.resolve();
  }

  observeAsync(reference: KubernetesResourceReference): Promise<KubernetesResourceObservation> {
    return Promise.resolve({
      state: 'ready',
      ...(reference.kind === 'Service'
        ? { publicOutputs: { endpoint: 'http://api.sample.test' } }
        : {}),
    });
  }

  waitUntilReadyAsync(): Promise<KubernetesResourceObservation> {
    return Promise.resolve({ state: 'ready' });
  }
}

/*** Wrap a successful fixture result. */
function success<T>(value: T): Promise<InfraResult<T>> {
  return Promise.resolve({ ok: true, value, diagnostics: [] });
}

/*** Match a required subset of ownership labels. */
function includesLabels(
  actual: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(expected).every(([expectedKey, expectedValue]) =>
    Object.entries(actual).some(
      ([actualKey, actualValue]) => actualKey === expectedKey && actualValue === expectedValue,
    ),
  );
}

/*** Compare Kubernetes resources and references by immutable identity. */
function sameResource(
  left: KubernetesResource,
  right: KubernetesResource | KubernetesResourceReference,
): boolean {
  return (
    left.apiVersion === right.apiVersion &&
    left.kind === right.kind &&
    left.metadata.name === ('metadata' in right ? right.metadata.name : right.name) &&
    left.metadata.namespace === ('metadata' in right ? right.metadata.namespace : right.namespace)
  );
}

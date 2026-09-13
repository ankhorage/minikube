import type {
  InfraComputeTarget,
  InfraOutput,
  InfraResourceStatus,
  InfraResult,
  InfraRuntimeDesiredState,
  InfraWorkloadSpec,
} from '@ankhorage/contracts/infra';
import type { KubernetesApi } from '@ankhorage/kubernetes';

export interface MinikubeAdapterOptions {
  readonly controlPlane: MinikubeControlPlane;
}

export interface MinikubeClusterIdentity {
  readonly projectId: string;
  readonly environment: 'local';
  readonly profile: string;
}

export interface MinikubeClusterSpec extends MinikubeClusterIdentity {
  readonly target: Extract<InfraComputeTarget, { readonly kind: 'local-host' }>;
  readonly driver: 'docker' | 'podman';
  readonly cpus?: number;
  readonly memoryMiB?: number;
}

export interface MinikubeClusterObservation {
  readonly state: InfraResourceStatus['state'];
  readonly configurationMatches: boolean;
  readonly api?: KubernetesApi;
  readonly detail?: string;
}

export type MinikubeEndpointOutput = Extract<InfraOutput, { readonly visibility: 'public' }>;

/** Minikube-specific command boundary; implementations verify and execute local CLI operations. */
export interface MinikubeControlPlane {
  validateAsync(spec: MinikubeClusterSpec, signal?: AbortSignal): Promise<InfraResult<null>>;
  inspectAsync(
    identity: MinikubeClusterIdentity,
    signal?: AbortSignal,
  ): Promise<InfraResult<MinikubeClusterObservation>>;
  ensureAsync(
    spec: MinikubeClusterSpec,
    signal?: AbortSignal,
  ): Promise<InfraResult<MinikubeClusterObservation>>;
  waitUntilReadyAsync(
    identity: MinikubeClusterIdentity,
    signal?: AbortSignal,
  ): Promise<InfraResult<MinikubeClusterObservation>>;
  loadImagesAsync(
    identity: MinikubeClusterIdentity,
    images: readonly string[],
    signal?: AbortSignal,
  ): Promise<InfraResult<null>>;
  repairEndpointsAsync(
    identity: MinikubeClusterIdentity,
    workloads: readonly InfraWorkloadSpec[],
    signal?: AbortSignal,
  ): Promise<InfraResult<readonly MinikubeEndpointOutput[]>>;
  suspendAsync(identity: MinikubeClusterIdentity, signal?: AbortSignal): Promise<InfraResult<null>>;
  destroyAsync(identity: MinikubeClusterIdentity, signal?: AbortSignal): Promise<InfraResult<null>>;
}

export type MinikubeDesiredState = InfraRuntimeDesiredState<'minikube'>;

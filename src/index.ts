/** Public Minikube runtime adapter package boundary. */
export { infraAdapterDescriptor } from './constants/infra';
export { createMinikubeCliControlPlane } from './features/cluster-runtime/adapters/createMinikubeCliControlPlane';
export { createInfraAdapter } from './features/cluster-runtime/composition/createInfraAdapter';
export type {
  MinikubeAdapterOptions,
  MinikubeCliControlPlaneOptions,
  MinikubeClusterIdentity,
  MinikubeClusterObservation,
  MinikubeClusterSpec,
  MinikubeCommandRequest,
  MinikubeCommandResult,
  MinikubeCommandRunner,
  MinikubeControlPlane,
  MinikubeDesiredState,
  MinikubeEndpointOutput,
} from './types/minikubeRuntime';

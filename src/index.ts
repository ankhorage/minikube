/** Public Minikube runtime adapter package boundary. */
export { infraAdapterDescriptor } from './constants/infra';
export { createInfraAdapter } from './features/cluster-runtime/composition/createInfraAdapter';
export type {
  MinikubeAdapterOptions,
  MinikubeClusterIdentity,
  MinikubeClusterObservation,
  MinikubeClusterSpec,
  MinikubeControlPlane,
  MinikubeDesiredState,
  MinikubeEndpointOutput,
} from './types/minikubeRuntime';

import type { MinikubeControlPlane } from '@ankhorage/minikube';
import { createInfraAdapter, infraAdapterDescriptor } from '@ankhorage/minikube';

declare const controlPlane: MinikubeControlPlane;
const adapter = createInfraAdapter({ controlPlane });

console.log(infraAdapterDescriptor.id, adapter.descriptor.package);

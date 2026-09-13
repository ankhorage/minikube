import { createInfraAdapter, infraAdapterDescriptor } from '@ankhorage/minikube';

const adapter = createInfraAdapter();

console.log(infraAdapterDescriptor.id, adapter.descriptor.package);

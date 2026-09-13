import type { InfraExecutionContext, InfraOwnedResource } from '@ankhorage/contracts/infra';

import type { MinikubeClusterIdentity } from '../../../types/minikubeRuntime';

/*** Create canonical ownership for the selected Minikube profile. */
export function createMinikubeClusterOwner(
  context: InfraExecutionContext,
  identity: MinikubeClusterIdentity,
): InfraOwnedResource {
  return {
    identity: {
      projectId: context.projectId,
      environment: context.environment,
      adapter: 'minikube',
      resourceId: 'cluster',
    },
    externalId: identity.profile,
    persistent: false,
    retention: 'retain',
    dependsOn: [],
  };
}

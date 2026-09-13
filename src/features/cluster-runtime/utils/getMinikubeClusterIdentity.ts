import type { InfraExecutionContext, InfraResult } from '@ankhorage/contracts/infra';

import type { MinikubeClusterIdentity } from '../../../types/minikubeRuntime';

/*** Resolve the active Minikube identity from the canonical environment selection. */
export function getMinikubeClusterIdentity(
  context: InfraExecutionContext,
): InfraResult<MinikubeClusterIdentity> {
  const { runtime } = context.desired.deployment;
  if (context.environment !== 'local' || runtime.provider !== 'minikube') {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'minikube-selection-invalid',
          message: 'Minikube requires the canonical local environment and Minikube selection.',
        },
      ],
    };
  }
  return {
    ok: true,
    value: {
      projectId: context.projectId,
      environment: 'local',
      profile: runtime.profile ?? toProfileName(`${context.projectId}-${context.environment}`),
    },
    diagnostics: [],
  };
}

/*** Normalize a project identity into a deterministic Minikube profile name. */
function toProfileName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'ankhorage'
  );
}

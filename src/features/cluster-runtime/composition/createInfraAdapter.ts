import type { InfraResult, InfraRuntimeAdapter } from '@ankhorage/contracts/infra';

import { infraAdapterDescriptor } from '../../../constants/infra';

/***
 * Create the canonical Minikube runtime adapter entrypoint.
 *
 * The foundation exposes the released Contracts boundary and fails lifecycle calls explicitly
 * until the provider implementation phase supplies its external adapters.
 *
 * @readme
 */
export function createInfraAdapter(): InfraRuntimeAdapter<'minikube'> {
  return {
    descriptor: infraAdapterDescriptor,
    validateAsync: () => notImplementedAsync(),
    planAsync: () => notImplementedAsync(),
    ensureAsync: () => notImplementedAsync(),
    statusAsync: () => notImplementedAsync(),
    suspendAsync: () => notImplementedAsync(),
    destroyAsync: () => notImplementedAsync(),
  };
}

/*** Reject lifecycle execution until this package's provider phase is implemented. */
function notImplementedAsync<T>(): Promise<InfraResult<T>> {
  return Promise.resolve({
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'minikube_adapter_not_implemented',
        message:
          'The Minikube runtime adapter foundation is installed, but its lifecycle is not implemented yet.',
      },
    ],
  });
}

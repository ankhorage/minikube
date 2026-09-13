# Public API

## createInfraAdapter

Kind: `function`
Module: `src/features/cluster-runtime/composition/createInfraAdapter.ts`
Source: `src/features/cluster-runtime/composition/createInfraAdapter.ts:13:1`

Create the canonical Minikube runtime adapter entrypoint.

The foundation exposes the released Contracts boundary and fails lifecycle calls explicitly
until the provider implementation phase supplies its external adapters.

### Signatures

- `() => InfraRuntimeAdapter<"minikube">`
  - returns: `InfraRuntimeAdapter<"minikube">`

## infraAdapterDescriptor

Kind: `value`
Module: `src/constants/infra.ts`
Source: `src/constants/infra.ts:5:14`

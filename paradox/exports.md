# Public API

## createInfraAdapter

Kind: `function`
Module: `src/features/cluster-runtime/composition/createInfraAdapter.ts`
Source: `src/features/cluster-runtime/composition/createInfraAdapter.ts:20:1`

Create the canonical Minikube runtime adapter entrypoint.

The caller supplies a Minikube-specific command boundary. Standard workload projection and
reconciliation are delegated to the published Kubernetes driver.

### Signatures

- `(options: MinikubeAdapterOptions) => InfraRuntimeAdapter<"minikube">`
  - options: `MinikubeAdapterOptions`
  - returns: `InfraRuntimeAdapter<"minikube">`

## infraAdapterDescriptor

Kind: `value`
Module: `src/constants/infra.ts`
Source: `src/constants/infra.ts:5:14`

## MinikubeAdapterOptions

Kind: `type`
Module: `src/types/minikubeRuntime.ts`
Source: `src/types/minikubeRuntime.ts:11:1`

### Members

| Name         | Kind     | Type                   | Required | Description |
| ------------ | -------- | ---------------------- | -------- | ----------- |
| controlPlane | property | `MinikubeControlPlane` | yes      |             |

## MinikubeClusterIdentity

Kind: `type`
Module: `src/types/minikubeRuntime.ts`
Source: `src/types/minikubeRuntime.ts:15:1`

### Members

| Name        | Kind     | Type      | Required | Description |
| ----------- | -------- | --------- | -------- | ----------- |
| environment | property | `"local"` | yes      |             |
| profile     | property | `string`  | yes      |             |
| projectId   | property | `string`  | yes      |             |

## MinikubeClusterObservation

Kind: `type`
Module: `src/types/minikubeRuntime.ts`
Source: `src/types/minikubeRuntime.ts:28:1`

### Members

| Name                 | Kind     | Type                                                                                                 | Required | Description |
| -------------------- | -------- | ---------------------------------------------------------------------------------------------------- | -------- | ----------- |
| api                  | property | `KubernetesApi \| undefined`                                                                         | no       |             |
| configurationMatches | property | `boolean`                                                                                            | yes      |             |
| detail               | property | `string \| undefined`                                                                                | no       |             |
| state                | property | `"absent" \| "pending" \| "ready" \| "degraded" \| "stopped" \| "retained" \| "failed" \| "unknown"` | yes      |             |

## MinikubeClusterSpec

Kind: `type`
Module: `src/types/minikubeRuntime.ts`
Source: `src/types/minikubeRuntime.ts:21:1`

### Members

| Name        | Kind     | Type                                                                                                                                                    | Required | Description |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| cpus        | property | `number \| undefined`                                                                                                                                   | no       |             |
| driver      | property | `"docker" \| "podman"`                                                                                                                                  | yes      |             |
| environment | property | `"local"`                                                                                                                                               | yes      |             |
| memoryMiB   | property | `number \| undefined`                                                                                                                                   | no       |             |
| profile     | property | `string`                                                                                                                                                | yes      |             |
| projectId   | property | `string`                                                                                                                                                | yes      |             |
| target      | property | `{ readonly id: string; readonly os: "linux" \| "darwin" \| "windows"; readonly architecture: "amd64" \| "arm64"; } & { readonly kind: "local-host"; }` | yes      |             |

## MinikubeControlPlane

Kind: `type`
Module: `src/types/minikubeRuntime.ts`
Source: `src/types/minikubeRuntime.ts:38:1`

### Members

| Name                 | Kind   | Type                                                                                                                                                            | Required | Description |
| -------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| destroyAsync         | method | `(identity: MinikubeClusterIdentity, signal?: AbortSignal) => Promise<InfraResult<null>>`                                                                       | yes      |             |
| ensureAsync          | method | `(spec: MinikubeClusterSpec, signal?: AbortSignal) => Promise<InfraResult<MinikubeClusterObservation>>`                                                         | yes      |             |
| inspectAsync         | method | `(identity: MinikubeClusterIdentity, signal?: AbortSignal) => Promise<InfraResult<MinikubeClusterObservation>>`                                                 | yes      |             |
| loadImagesAsync      | method | `(identity: MinikubeClusterIdentity, images: readonly string[], signal?: AbortSignal) => Promise<InfraResult<null>>`                                            | yes      |             |
| repairEndpointsAsync | method | `(identity: MinikubeClusterIdentity, workloads: readonly InfraWorkloadSpec[], signal?: AbortSignal) => Promise<InfraResult<readonly MinikubeEndpointOutput[]>>` | yes      |             |
| suspendAsync         | method | `(identity: MinikubeClusterIdentity, signal?: AbortSignal) => Promise<InfraResult<null>>`                                                                       | yes      |             |
| validateAsync        | method | `(spec: MinikubeClusterSpec, signal?: AbortSignal) => Promise<InfraResult<null>>`                                                                               | yes      |             |
| waitUntilReadyAsync  | method | `(identity: MinikubeClusterIdentity, signal?: AbortSignal) => Promise<InfraResult<MinikubeClusterObservation>>`                                                 | yes      |             |

## MinikubeDesiredState

Kind: `unknown`
Module: `src/types/minikubeRuntime.ts`
Source: `src/types/minikubeRuntime.ts:66:1`

## MinikubeEndpointOutput

Kind: `unknown`
Module: `src/types/minikubeRuntime.ts`
Source: `src/types/minikubeRuntime.ts:35:1`

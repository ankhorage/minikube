import type { InfraResult } from '@ankhorage/contracts/infra';
import { createKubectlKubernetesApi } from '@ankhorage/kubernetes';

import type {
  MinikubeCliControlPlaneOptions,
  MinikubeClusterIdentity,
  MinikubeClusterObservation,
  MinikubeClusterSpec,
  MinikubeCommandRunner,
} from '../../../types/minikubeRuntime';
import { runCheckedMinikubeCommandAsync, runMinikubeCommandAsync } from './minikubeCliProcess';

const STATUS_FORMAT = '{{.Host}}|{{.Kubelet}}|{{.APIServer}}|{{.Kubeconfig}}';

interface MinikubeProfile {
  readonly name: string;
  readonly driver?: string;
  readonly cpus?: number;
  readonly memoryMiB?: number;
}

interface InspectMinikubeOptions {
  readonly runner: MinikubeCommandRunner;
  readonly executable: string;
  readonly kubectlExecutable: string;
  readonly kubectlRunner?: MinikubeCliControlPlaneOptions['kubectlRunner'];
}

/** Inspect exact profile configuration and live status without mutating Minikube. */
export async function inspectMinikubeAsync(
  options: InspectMinikubeOptions,
  identity: MinikubeClusterIdentity | MinikubeClusterSpec,
  signal?: AbortSignal,
): Promise<InfraResult<MinikubeClusterObservation>> {
  const listed = await runCheckedMinikubeCommandAsync(
    options.runner,
    options.executable,
    ['profile', 'list', '--light', '--output=json'],
    signal,
  );
  if (!listed.ok) return listed;
  const profile = readProfile(listed.value.stdout, identity.profile);
  if (!profile.ok) return profile;
  if (profile.value === undefined) return absentObservation();
  return inspectExistingMinikubeAsync(options, identity, profile.value, signal);
}

async function inspectExistingMinikubeAsync(
  options: InspectMinikubeOptions,
  identity: MinikubeClusterIdentity | MinikubeClusterSpec,
  profile: MinikubeProfile,
  signal?: AbortSignal,
): Promise<InfraResult<MinikubeClusterObservation>> {
  const status = await runMinikubeCommandAsync(
    options.runner,
    options.executable,
    ['status', '-p', identity.profile, '--format', STATUS_FORMAT],
    signal,
  );
  if (!status.ok) return status;
  const state = readStatus(status.value.stdout);
  return {
    ok: true,
    value: {
      state,
      configurationMatches: profileMatches(profile, identity),
      ...(state === 'ready' ? { api: createKubernetesApi(options, identity.profile) } : {}),
      ...(status.value.exitCode === 0 ? {} : { detail: 'Minikube profile is not ready.' }),
    },
    diagnostics: [],
  };
}

function createKubernetesApi(options: InspectMinikubeOptions, context: string) {
  return createKubectlKubernetesApi({
    context,
    executable: options.kubectlExecutable,
    ...(options.kubectlRunner === undefined ? {} : { runner: options.kubectlRunner }),
  });
}

function absentObservation(): InfraResult<MinikubeClusterObservation> {
  return {
    ok: true,
    value: { state: 'absent', configurationMatches: true },
    diagnostics: [],
  };
}

/** Compare only user-controlled profile fields; omitted resources accept existing defaults. */
function profileMatches(
  profile: MinikubeProfile,
  identity: MinikubeClusterIdentity | MinikubeClusterSpec,
): boolean {
  if (!isClusterSpec(identity)) return true;
  return (
    profile.driver === identity.driver &&
    (identity.cpus === undefined || profile.cpus === identity.cpus) &&
    (identity.memoryMiB === undefined || profile.memoryMiB === identity.memoryMiB)
  );
}

function isClusterSpec(
  identity: MinikubeClusterIdentity | MinikubeClusterSpec,
): identity is MinikubeClusterSpec {
  return 'driver' in identity;
}

/** Parse one exact profile from Minikube's machine-readable profile catalog. */
function readProfile(input: string, name: string): InfraResult<MinikubeProfile | undefined> {
  const parsed = parseJson(input);
  if (!parsed.ok) return parsed;
  if (!isRecord(parsed.value)) return invalidOutput();
  const { valid, invalid } = parsed.value;
  const entries: readonly unknown[] = [...toUnknownArray(valid), ...toUnknownArray(invalid)];
  const entry = entries.find((candidate) => isRecord(candidate) && candidate.Name === name);
  if (!isRecord(entry)) return { ok: true, value: undefined, diagnostics: [] };
  const config = isRecord(entry.Config) ? entry.Config : undefined;
  return { ok: true, value: readProfileConfig(name, config), diagnostics: [] };
}

function toUnknownArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as readonly unknown[]) : [];
}

function readProfileConfig(
  name: string,
  config: Readonly<Record<string, unknown>> | undefined,
): MinikubeProfile {
  return {
    name,
    ...(typeof config?.Driver === 'string' ? { driver: config.Driver } : {}),
    ...(typeof config?.CPUs === 'number' ? { cpus: config.CPUs } : {}),
    ...(typeof config?.Memory === 'number' ? { memoryMiB: config.Memory } : {}),
  };
}

/** Map Minikube component status into the provider-neutral lifecycle state. */
function readStatus(input: string): MinikubeClusterObservation['state'] {
  const [host, kubelet, apiServer, kubeconfig] = input.trim().split('|');
  if (
    host === 'Running' &&
    kubelet === 'Running' &&
    apiServer === 'Running' &&
    kubeconfig === 'Configured'
  ) {
    return 'ready';
  }
  if (host === 'Stopped') return 'stopped';
  if (host === 'Running') return 'pending';
  return 'unknown';
}

function parseJson(input: string): InfraResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(input) as unknown, diagnostics: [] };
  } catch {
    return invalidOutput();
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidOutput(): InfraResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'minikube-output-invalid',
        message: 'Minikube returned an invalid machine-readable response.',
      },
    ],
  };
}

import { noTelemetry } from '@askcalls/adapter-runtime';
import type { Telemetry } from '@askcalls/domain';
import type { InstanceConfig } from '../config/schema';
import { AdapterUnavailableError } from './errors';

/** TELEMETRY (comma list) → adapters, fanned out. Empty means none. */
export async function buildTelemetry(config: InstanceConfig): Promise<Telemetry> {
  if (config.telemetry.backends.length === 0) return noTelemetry;
  throw new AdapterUnavailableError('telemetry', config.telemetry.backends.join(','));
}

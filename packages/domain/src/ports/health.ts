export interface HealthResult {
  ok: boolean;
  /** Content-free description, e.g. "connected", "bucket not found". */
  message: string;
  latencyMs?: number;
}

export interface HealthCheckable {
  healthCheck(): Promise<HealthResult>;
}

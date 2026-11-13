export class AdapterUnavailableError extends Error {
  constructor(
    readonly port: string,
    readonly adapter: string,
  ) {
    super(`No ${port} adapter named "${adapter}" is installed`);
    this.name = 'AdapterUnavailableError';
  }
}

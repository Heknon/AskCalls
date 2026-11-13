/** Placeholder action for a command whose milestone has not landed yet. */
export function notBuilt(command: string, milestone: string): never {
  console.error(`askcalls ${command} is not built yet (milestone ${milestone}).`);
  process.exit(2);
}

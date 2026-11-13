/** What a device label names: the agent CLI, a phone browser or a desktop browser. */
export function deviceKindOf(label: string): 'agent' | 'phone' | 'laptop' {
  if (/\b(agent|askcalls)\b/i.test(label)) return 'agent';
  if (/\b(iOS|iPhone|iPad|Android)\b/i.test(label)) return 'phone';
  return 'laptop';
}

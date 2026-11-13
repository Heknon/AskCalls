import { type ClientEvent, reportProductEvent } from '../../../../../../server/actions/telemetry';

const ACTIVATED = 'askcalls:activated';

/** Fire-and-forget; the server drops it unless the account opted in to product analytics. */
export function report(event: ClientEvent): void {
  reportProductEvent(event).catch(() => {});
}

/** The activation event (spec 11.3): the first search with a result, once per browser. */
export function reportActivation(): void {
  try {
    if (localStorage.getItem(ACTIVATED)) return;
    localStorage.setItem(ACTIVATED, '1');
  } catch {}
  report({ name: 'first_search_with_result' });
}

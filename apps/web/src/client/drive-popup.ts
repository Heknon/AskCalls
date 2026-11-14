import type { GrantPurpose } from '@askcalls/api-contract/routes/storage';

export interface DrivePopup {
  popup: Window;
  ticket: string;
}

/**
 * Opens Google's consent in a popup on our own routes (no Google script on the page). Call it
 * straight from a click, or the browser blocks it: null then. `waitForDrive` (./drive-connect)
 * takes it from there; it is small enough to keep in the click's code, the wait is not.
 */
export function openDrivePopup(purpose: GrantPurpose): DrivePopup | null {
  const ticket = crypto.randomUUID();
  const popup = window.open(
    `/api/storage/connect/google?ticket=${ticket}&purpose=${purpose}`,
    'askcalls-storage',
    'popup,width=520,height=680',
  );
  return popup ? { popup, ticket } : null;
}

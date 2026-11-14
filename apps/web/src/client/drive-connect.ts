import { type GrantPurpose, StorageConnectMessage } from '@askcalls/api-contract/routes/storage';
import { type DrivePopup, openDrivePopup } from './drive-popup';

const CHANNEL = 'askcalls-storage';

/**
 * Waits for the callback page's message: from this origin, carrying this popup's ticket.
 * Resolves null when the user closed the popup.
 */
export function waitForDrive({ popup, ticket }: DrivePopup): Promise<StorageConnectMessage | null> {
  return new Promise((resolve) => {
    let channel: BroadcastChannel | null = null;
    const finish = (m: StorageConnectMessage | null) => {
      window.removeEventListener('message', onMessage);
      channel?.close();
      clearInterval(timer);
      resolve(m);
    };
    const accept = (data: unknown) => {
      const m = StorageConnectMessage.safeParse(data);
      if (m.success && m.data.ticket === ticket) finish(m.data);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin === location.origin && e.source === popup) accept(e.data);
    };
    window.addEventListener('message', onMessage);
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (e) => accept(e.data);
    }
    const timer = setInterval(() => {
      // The callback posts before it closes; give a late message one more tick.
      if (popup.closed) setTimeout(() => finish(null), 300);
    }, 500);
  });
}

/** `openDrivePopup` then `waitForDrive`, for callers that load both anyway. Null: blocked. */
export function connectDrivePopup(
  purpose: GrantPurpose,
): Promise<StorageConnectMessage | null> | null {
  const opened = openDrivePopup(purpose);
  return opened ? waitForDrive(opened) : null;
}

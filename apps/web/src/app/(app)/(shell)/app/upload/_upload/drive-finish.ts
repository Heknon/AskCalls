import { waitForDrive } from '../../../../../../client/drive-connect';
import type { DrivePopup } from '../../../../../../client/drive-popup';
import type { BulkController } from './bulk-controller';

export type DriveNotice = 'popup' | 'denied' | 'connectFailed';

/** The consent popup's answer: connected, closed (null), or what to tell the user. */
export async function finishDriveConnect(
  opened: DrivePopup,
  controller: BulkController,
): Promise<'ok' | DriveNotice | null> {
  const m = await waitForDrive(opened);
  if (!m) return null;
  if (!m.ok) return m.error === 'failed' ? 'connectFailed' : 'denied';
  await controller.driveConnected(m);
  return 'ok';
}

'use client';

import { DRIVE_ORIGIN } from '@askcalls/client-core/bulk/drive-ref';
import { useState } from 'react';
import { openDrivePopup } from '../../../../../../client/drive-popup';
import type { BulkController } from './bulk-controller';
import type { DriveNotice } from './drive-finish';

export type { DriveNotice };

export interface DriveSource {
  /** From a click: allows Drive for this browser, connects it, then opens the picker. */
  pick: () => void;
  /** From a click: a new access token for an import that waits for Drive. */
  reconnect: () => void;
  connecting: boolean;
  notice: DriveNotice | null;
  setNotice: (n: DriveNotice | null) => void;
  picker: boolean;
  setPicker: (open: boolean) => void;
  /** "Allow Google Drive": the page's CSP doesn't let it call Drive yet. */
  enabling: boolean;
  setEnabling: (open: boolean) => void;
}

/**
 * Google Drive as a bulk-upload source (spec 8). Only what a click must do at once is here:
 * the CSP check and opening the consent popup. The rest loads with the picker.
 */
export function useDriveSource(controller: BulkController): DriveSource {
  const [picker, setPicker] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState<DriveNotice | null>(null);

  const connect = (then?: () => void) => {
    setNotice(null);
    const opened = openDrivePopup('import');
    if (!opened) return setNotice('popup');
    setConnecting(true);
    void import(/* webpackChunkName: "u2" */ './drive-finish')
      .then((m) => m.finishDriveConnect(opened, controller))
      .then((r) => {
        setConnecting(false);
        if (r === 'ok') then?.();
        else if (r) setNotice(r);
      });
  };

  return {
    pick: () => {
      // The CSP is fixed per page: Drive is reachable only if this page loaded with it allowed.
      // Read like client/runtime-config's readConnectSrc, which isn't loaded with this page.
      const allowed = document
        .querySelector('meta[name="askcalls-connect-src"]')
        ?.getAttribute('content');
      if (allowed != null && !allowed.split(/\s+/).includes(DRIVE_ORIGIN)) setEnabling(true);
      else if (controller.drive.connected()) setPicker(true);
      else connect(() => setPicker(true));
    },
    reconnect: () => connect(),
    connecting,
    notice,
    setNotice,
    picker,
    setPicker,
    enabling,
    setEnabling,
  };
}

/**
 * What a page needs to know about Google Drive as an upload source without loading the reader
 * (`./drive`): its origin and the prefix of its queue references, `gdrive:<fileId>:<path>`.
 */

export const DRIVE_ORIGIN = 'https://www.googleapis.com';
export const DRIVE_REF_PREFIX = 'gdrive:';

export const isDriveRef = (ref: string) => ref.startsWith(DRIVE_REF_PREFIX);

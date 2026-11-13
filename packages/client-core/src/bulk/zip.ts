import { DomainError } from '@askcalls/domain';
import { unzipSync } from 'fflate';
import { classifyFile, type FileRef } from './pairing';
import type { BulkFileReader } from './runner';

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  flac: 'audio/flac',
};

export const audioMimeType = (name: string) =>
  AUDIO_MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

/**
 * Unzips a dropped ZIP on the device (spec 8). Entries stay in memory for this page; the queue
 * stores `<zipRef>!<entry>` references, so after a reload the user picks the ZIP again.
 */
export function openZip(
  bytes: Uint8Array,
  zipRef: string,
): { files: FileRef[]; reader: BulkFileReader } {
  const entries = unzipSync(bytes, {
    filter: (f) =>
      !f.name.endsWith('/') && !f.name.startsWith('__MACOSX/') && classifyFile(f.name) !== 'other',
  });
  const files = Object.entries(entries).map(([name, data]) => ({
    ref: `${zipRef}!${name}`,
    name,
    size: data.length,
  }));
  const get = (file: FileRef) => {
    const data = entries[file.name];
    if (!data || file.ref !== `${zipRef}!${file.name}`) {
      throw new DomainError('not_found', 'file is not in this archive');
    }
    return data;
  };
  return {
    files,
    reader: {
      audio: async (file) => ({ bytes: get(file), mimeType: audioMimeType(file.name) }),
      bytes: async (file) => get(file),
    },
  };
}

import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { type BulkFileReader, classifyFile, type FileRef, openZip } from '@askcalls/client-core';
import { DomainError } from '@askcalls/domain';

/** Reads files by path when an item runs; the queue only ever holds the paths. */
export const fsFileReader: BulkFileReader = {
  audio: async (file) => ({ path: file.ref }),
  bytes: async (file) => new Uint8Array(await readFile(file.ref)),
};

async function walk(root: string, dir: string, out: FileRef[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(root, full, out);
    else if (entry.isFile() && classifyFile(entry.name) !== 'other') {
      out.push({
        ref: full,
        name: relative(root, full).split(sep).join('/'),
        size: (await stat(full)).size,
      });
    }
  }
}

export interface IngestSource {
  files: FileRef[];
  reader: BulkFileReader;
  /** An explicit `--manifest`, which takes precedence over a manifest.csv inside the folder. */
  manifest: FileRef | null;
}

/** A folder (recursively), a ZIP (unzipped in memory) or a single audio or transcript file. */
export async function openIngestSource(path: string, manifestPath?: string): Promise<IngestSource> {
  const abs = resolve(path);
  const info = await stat(abs).catch(() => {
    throw new DomainError('not_found', 'no such file or folder');
  });
  const manifest = manifestPath
    ? await stat(resolve(manifestPath)).then(
        (m) => ({ ref: resolve(manifestPath), name: basename(manifestPath), size: m.size }),
        () => {
          throw new DomainError('not_found', 'no such manifest file');
        },
      )
    : null;
  const withManifest = (reader: BulkFileReader): BulkFileReader =>
    manifest
      ? {
          audio: reader.audio,
          bytes: (f) => (f.ref === manifest.ref ? fsFileReader.bytes(f) : reader.bytes(f)),
        }
      : reader;

  if (info.isDirectory()) {
    const files: FileRef[] = [];
    await walk(abs, abs, files);
    return { files, reader: fsFileReader, manifest };
  }
  if (abs.toLowerCase().endsWith('.zip')) {
    const zip = openZip(new Uint8Array(await readFile(abs)), abs);
    return { files: zip.files, reader: withManifest(zip.reader), manifest };
  }
  const kind = classifyFile(abs);
  if (kind !== 'audio' && kind !== 'transcript') {
    throw new DomainError('unsupported', 'not an audio or transcript file');
  }
  return {
    files: [{ ref: abs, name: basename(abs), size: info.size }],
    reader: fsFileReader,
    manifest,
  };
}

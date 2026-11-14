'use client';

import {
  ChevronRight,
  FileArchive,
  FileAudio,
  FileSpreadsheet,
  FileText,
  Folder,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../primitives/button';
import { Checkbox } from '../primitives/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../primitives/dialog';
import { Skeleton } from '../primitives/skeleton';
import { ErrorState } from './ErrorState';

export type DrivePickerEntry = {
  id: string;
  name: string;
  kind: 'folder' | 'audio' | 'transcript' | 'manifest' | 'zip';
  /** Bytes; 0 for folders. */
  size: number;
};

export type DrivePickerPage = { entries: DrivePickerEntry[]; nextPageToken: string | null };

export type DrivePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** One page of a folder; `null` is the top of the drive. */
  load: (folderId: string | null, pageToken: string | null) => Promise<DrivePickerPage>;
  /** The picked folders and files; a folder brings everything under it. */
  onImport: (entries: DrivePickerEntry[]) => void;
  locale: string;
  labels: {
    /** "Choose calls in Google Drive". */
    title: string;
    /** "My Drive". */
    root: string;
    /** "Folder path". */
    path: string;
    /** "No recordings or transcripts in this folder." */
    empty: string;
    /** "Couldn't open this folder. Try again." */
    failed: string;
    retry: string;
    more: string;
    cancel: string;
    close: string;
    /** "Import 3 items". */
    importN: (n: number) => string;
    /** "Include {name}". */
    include: (name: string) => string;
    /** "Open {name}". */
    openFolder: (name: string) => string;
  };
};

type Listing =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; entries: DrivePickerEntry[]; next: string | null; more: boolean };

const ICONS = {
  folder: Folder,
  audio: FileAudio,
  transcript: FileText,
  manifest: FileSpreadsheet,
  zip: FileArchive,
} as const;

function formatSize(bytes: number, locale: string): string {
  const mb = bytes >= 1e6;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: mb ? 'megabyte' : 'kilobyte',
    maximumFractionDigits: mb ? 1 : 0,
  }).format(Math.max(bytes / (mb ? 1e6 : 1e3), mb ? 0 : 1));
}

/**
 * Browses the user's Google Drive inside AskCalls (no Google script): open folders, tick
 * folders and files across them, import. Picks survive moving between folders.
 */
export function DrivePicker(props: DrivePickerProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        closeLabel={props.labels.close}
        data-component="DrivePicker"
        className="sm:max-w-140"
      >
        {props.open ? <Browser {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Browser({ load, onImport, onOpenChange, locale, labels }: DrivePickerProps) {
  const [trail, setTrail] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: labels.root },
  ]);
  const [listing, setListing] = useState<Listing>({ state: 'loading' });
  const [picked, setPicked] = useState<Map<string, DrivePickerEntry>>(new Map());
  const folder = trail.at(-1)!;

  const fetchPage = useCallback(
    async (token: string | null, before: DrivePickerEntry[], stale: () => boolean) => {
      try {
        const page = await load(folder.id, token);
        if (stale()) return;
        setListing({
          state: 'ready',
          entries: [...before, ...page.entries],
          next: page.nextPageToken,
          more: false,
        });
      } catch {
        if (!stale()) setListing({ state: 'failed' });
      }
    },
    [load, folder.id],
  );

  useEffect(() => {
    let stale = false;
    setListing({ state: 'loading' });
    void fetchPage(null, [], () => stale);
    return () => {
      stale = true;
    };
  }, [fetchPage]);

  const toggle = (e: DrivePickerEntry, on: boolean) =>
    setPicked((m) => {
      const next = new Map(m);
      if (on) next.set(e.id, e);
      else next.delete(e.id);
      return next;
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{labels.title}</DialogTitle>
        <nav aria-label={labels.path}>
          <ol className="flex flex-wrap items-center gap-1 text-sm">
            {trail.map((step, i) => (
              <li key={step.id ?? 'root'} className="flex min-w-0 items-center gap-1">
                {i > 0 ? (
                  <ChevronRight className="size-3.5 shrink-0 rtl:rotate-180" aria-hidden />
                ) : null}
                {i === trail.length - 1 ? (
                  <bdi aria-current="page" className="truncate font-medium" dir="auto">
                    {step.name}
                  </bdi>
                ) : (
                  <button
                    type="button"
                    className="truncate text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setTrail(trail.slice(0, i + 1))}
                  >
                    <bdi dir="auto">{step.name}</bdi>
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </DialogHeader>
      <DialogBody className="min-h-64">
        {listing.state === 'loading' ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : listing.state === 'failed' ? (
          <div className="flex flex-col items-start gap-3">
            <ErrorState scope="inline" title={labels.failed} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setListing({ state: 'loading' });
                void fetchPage(null, [], () => false);
              }}
            >
              {labels.retry}
            </Button>
          </div>
        ) : listing.entries.length === 0 ? (
          <p className="text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="flex flex-col">
            {listing.entries.map((e) => {
              const Icon = ICONS[e.kind];
              return (
                <li
                  key={e.id}
                  className="flex min-h-10 items-center gap-3 border-b ps-1 pe-1 last:border-b-0"
                >
                  <Checkbox
                    checked={picked.has(e.id)}
                    onCheckedChange={(v) => toggle(e, v === true)}
                    aria-label={labels.include(e.name)}
                  />
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {e.kind === 'folder' ? (
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-start hover:underline"
                      aria-label={labels.openFolder(e.name)}
                      onClick={() => setTrail([...trail, { id: e.id, name: e.name }])}
                    >
                      <bdi dir="auto">{e.name}</bdi>
                    </button>
                  ) : (
                    <bdi dir="auto" className="min-w-0 flex-1 truncate">
                      {e.name}
                    </bdi>
                  )}
                  {e.kind === 'folder' ? (
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
                      aria-hidden
                    />
                  ) : (
                    <span className="tabular shrink-0 text-muted-foreground text-sm">
                      {formatSize(e.size, locale)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {listing.state === 'ready' && listing.next ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            loading={listing.more}
            onClick={() => {
              setListing({ ...listing, more: true });
              void fetchPage(listing.next, listing.entries, () => false);
            }}
          >
            {labels.more}
          </Button>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button
          variant="primary"
          disabled={picked.size === 0}
          onClick={() => {
            onImport([...picked.values()]);
            onOpenChange(false);
          }}
        >
          {labels.importN(picked.size)}
        </Button>
      </DialogFooter>
    </>
  );
}

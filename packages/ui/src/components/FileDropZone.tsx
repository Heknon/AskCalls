'use client';

import { Upload } from 'lucide-react';
import { type DragEvent, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';

export type FileDropZoneProps = {
  /** `audio+transcript`: recordings and transcript files. `manifest`: a CSV. `contacts`: VCF. */
  accept: 'audio+transcript' | 'manifest' | 'contacts';
  multiple?: boolean;
  /** Offers a folder picker too (desktop browsers). */
  directory?: boolean;
  onFiles: (files: File[]) => void;
  /**
   * Opens the browser's folder picker (File System Access) instead of the `webkitdirectory`
   * input, so the folder can be read again after a reload.
   */
  onPickFolder?: () => void;
  labels: {
    /** "Drop files, a folder or a ZIP". */
    title: string;
    /** "Choose files". */
    browse: string;
    /** "Choose a folder". */
    folder?: string;
    /** "M4A, MP3, WAV, OGG · TXT, SRT, VTT, JSON". */
    hint?: string;
  };
  disabled?: boolean;
};

const acceptTypes = {
  'audio+transcript': 'audio/*,.m4a,.mp3,.wav,.ogg,.opus,.amr,.txt,.srt,.vtt,.json,.zip',
  manifest: '.csv,text/csv',
  contacts: '.vcf,text/vcard',
};

/** Where files, folders or a ZIP are dropped or picked. The button works without dragging. */
export function FileDropZone({
  accept,
  multiple = false,
  directory = false,
  onFiles,
  onPickFolder,
  labels,
  disabled,
}: FileDropZoneProps) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) onFiles([...e.dataTransfer.files]);
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dropping is an enhancement; the buttons open the picker
    <div
      data-component="FileDropZone"
      data-over={over || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-input border-dashed bg-card px-6 py-10 text-center transition-colors duration-(--duration-fast)',
        over && 'border-primary bg-primary-subtle',
      )}
    >
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
        <Upload className="size-6" aria-hidden />
      </span>
      <p className="font-semibold text-md">{labels.title}</p>
      {labels.hint ? <p className="text-muted-foreground text-sm">{labels.hint}</p> : null}
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" disabled={disabled} onClick={() => files.current?.click()}>
          {labels.browse}
        </Button>
        {directory && labels.folder ? (
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => (onPickFolder ? onPickFolder() : folder.current?.click())}
            className="max-md:hidden"
          >
            {labels.folder}
          </Button>
        ) : null}
      </div>
      <input
        ref={files}
        type="file"
        hidden
        multiple={multiple}
        accept={acceptTypes[accept]}
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      {directory && !onPickFolder ? (
        <input
          ref={(el) => {
            folder.current = el;
            el?.setAttribute('webkitdirectory', '');
          }}
          type="file"
          hidden
          onChange={(e) => onFiles([...(e.target.files ?? [])])}
        />
      ) : null}
    </div>
  );
}

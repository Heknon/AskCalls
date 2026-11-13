'use client';

import {
  Cloud,
  Database,
  FileAudio,
  FileText,
  HardDrive,
  KeyRound,
  Languages,
  Mail,
  MessageSquareText,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Card } from '../primitives/card';
import { ToggleGroup, ToggleGroupItem } from '../primitives/toggle-group';

export type ProviderCapability =
  | 'transcription'
  | 'ask'
  | 'translation'
  | 'recordings'
  | 'database'
  | 'storage'
  | 'sign-in'
  | 'email'
  | 'provider';

export type ProviderChoice = 'managed' | 'own' | 'off' | 'local';

export type ProviderCardProps = {
  capability: ProviderCapability;
  title: string;
  /** The `HealthBadge` for this connection. */
  health?: ReactNode;
  /** Who serves it. Omit for instance ports that have no choice. */
  choice?: {
    value: ProviderChoice;
    options: { value: ProviderChoice; label: string; disabled?: boolean }[];
    onChange: (value: ProviderChoice) => void;
    label: string;
  };
  /** Fixed by the server environment: the choice is shown but can't change. */
  locked?: boolean;
  /** `instance`: the admin page's compact port cards. */
  context?: 'settings' | 'instance';
  /** DataFlowNote, fields, MaskedSecret, UsageMeter, TestConnectionResult, EnvLockedField. */
  children: ReactNode;
};

const icons = {
  transcription: FileText,
  ask: MessageSquareText,
  translation: Languages,
  recordings: FileAudio,
  database: Database,
  storage: HardDrive,
  'sign-in': KeyRound,
  email: Mail,
  provider: Cloud,
};

/** One capability or instance port and which provider serves it. */
export function ProviderCard({
  capability,
  title,
  health,
  choice,
  locked = false,
  context = 'settings',
  children,
}: ProviderCardProps) {
  const Icon = icons[capability];
  const instance = context === 'instance';
  return (
    <Card data-component="ProviderCard" data-capability={capability} className="flex flex-col">
      <div
        className={cn(
          'flex items-center gap-3 px-5',
          instance ? 'border-border border-b py-4' : 'pt-5 pb-4',
        )}
      >
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md bg-muted',
            instance ? 'size-8' : 'size-9',
          )}
        >
          <Icon className="size-4.5" aria-hidden />
        </span>
        <h2 className={cn('flex-1 font-semibold', instance ? 'text-base' : 'text-md')}>{title}</h2>
        {health}
      </div>
      <div className={cn('flex flex-1 flex-col gap-4 px-5 pb-5', instance && 'pt-4')}>
        {choice ? (
          <ToggleGroup
            type="single"
            aria-label={choice.label}
            value={choice.value}
            disabled={locked}
            onValueChange={(v) => {
              if (v) choice.onChange(v as ProviderChoice);
            }}
            className="flex w-full md:inline-flex md:w-auto md:self-start"
          >
            {choice.options.map((o) => (
              <ToggleGroupItem
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="max-md:min-w-0 max-md:whitespace-normal max-md:px-1 max-md:text-center max-md:leading-4"
              >
                {o.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
        {children}
      </div>
    </Card>
  );
}

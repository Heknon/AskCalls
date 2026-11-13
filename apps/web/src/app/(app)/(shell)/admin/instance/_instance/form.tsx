'use client';

import { type ApiClient, ApiError, type ResponseFor } from '@askcalls/api-contract';
import {
  type getInstance,
  type testInstanceConnection,
  testInstanceConnection as testRoute,
  updateInstance,
} from '@askcalls/api-contract/routes/admin';
import { EnvLockedField } from '@askcalls/ui/components/EnvLockedField';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { MaskedSecret } from '@askcalls/ui/components/MaskedSecret';
import { TestConnectionResult } from '@askcalls/ui/components/TestConnectionResult';
import { Button } from '@askcalls/ui/primitives/button';
import { Input } from '@askcalls/ui/primitives/input';
import { Label } from '@askcalls/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@askcalls/ui/primitives/select';
import { Switch } from '@askcalls/ui/primitives/switch';
import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useCallback, useContext, useId, useState } from 'react';

export type View = ResponseFor<typeof getInstance>;
export type TestResult = ResponseFor<typeof testInstanceConnection>;
export type TestPort = 'database' | 'blob' | 'transcription' | 'llm';

export function getAt(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const k of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** `{ 'llm.model': 'x' }` → `{ llm: { model: 'x' } }`. */
export function nest(flat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    const keys = path.split('.');
    let cur = out;
    for (const k of keys.slice(0, -1)) {
      cur[k] = (cur[k] as Record<string, unknown>) ?? {};
      cur = cur[k] as Record<string, unknown>;
    }
    cur[keys.at(-1)!] = value;
  }
  return out;
}

interface InstanceContext {
  view: View;
  api: ApiClient;
  apply: (next: View) => void;
}

const Ctx = createContext<InstanceContext | null>(null);

export function InstanceProvider({
  value,
  children,
}: {
  value: InstanceContext;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInstance(): InstanceContext {
  const c = useContext(Ctx);
  if (!c) throw new Error('useInstance needs InstanceProvider');
  return c;
}

const REASONS: Record<string, string> = {
  unreachable: 'unreachable',
  timeout: 'timeout',
  incomplete: 'incomplete',
  offline_blocked: 'offline_blocked',
  'invalid API key': 'invalidKey',
  'bucket not found': 'bucketNotFound',
  'access denied': 'accessDenied',
  'database unreachable': 'databaseUnreachable',
};

/** The one-line outcome of a connection test. */
export function useTestDetail() {
  const t = useTranslations('admin.test');
  return (r: TestResult): string => {
    if (r.ok) {
      if (r.postgres) {
        return r.postgres.vector
          ? t('okPostgres', { v: r.postgres.version, pv: r.postgres.vector })
          : t('noVector');
      }
      if (r.message === 'pglite' || r.message === 'memory' || r.message === 'in use') {
        return t('builtIn');
      }
      if (r.message === 'off') return t('off');
      return t('ok', { ms: r.latencyMs ?? 0 });
    }
    const key = REASONS[r.message];
    return t('failed', {
      reason: key
        ? t(`reason.${key}` as 'reason.unreachable')
        : t('reason.other', { message: r.message }),
    });
  };
}

export type Card = ReturnType<typeof useCard>;

/** One card's unsaved edits, its connection test and its save. */
export function useCard(port?: TestPort) {
  const { view, api, apply } = useInstance();
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{
    state: 'idle' | 'testing' | 'ok' | 'failed';
    result?: TestResult;
  }>({ state: 'idle' });
  const readOnly = view.hosted;
  const get = useCallback(
    (path: string) => (path in draft ? draft[path] : getAt(view.config, path)),
    [draft, view.config],
  );
  const set = (path: string, value: unknown) => {
    setDraft((d) => ({ ...d, [path]: value }));
    setError(null);
    setTest({ state: 'idle' });
  };
  const locked = (path: string) => readOnly || view.locked.includes(path);
  const secretSet = (path: string) => view.secrets.includes(path) && draft[path] !== null;
  const dirty = Object.keys(draft).length > 0;

  const run = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      return null;
    }
  };

  return {
    port,
    view,
    readOnly,
    draft,
    get,
    set,
    locked,
    secretSet,
    dirty,
    saving,
    error,
    test,
    reset: () => {
      setDraft({});
      setError(null);
      setTest({ state: 'idle' });
    },
    async save(extra: Record<string, unknown> = {}) {
      setSaving(true);
      const next = await run(() =>
        api.request(updateInstance, { body: { patch: nest({ ...draft, ...extra }) } }),
      );
      setSaving(false);
      if (next) {
        apply(next);
        setDraft({});
      }
      return next !== null;
    },
    async runTest() {
      if (!port) return;
      setTest({ state: 'testing' });
      const result = await run(() =>
        api.request(testRoute, { body: { port, patch: nest(draft) } }),
      );
      setTest(result ? { state: result.ok ? 'ok' : 'failed', result } : { state: 'idle' });
    },
  };
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
    </div>
  );
}

/** A label and a value on one line ("Driver · Postgres"). */
export function ValueRow({
  label,
  value,
  technical,
}: {
  label: string;
  value: ReactNode;
  technical?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      {technical ? (
        <bdi dir="ltr" className="truncate font-mono text-sm">
          {value}
        </bdi>
      ) : (
        <span className="text-end">{value}</span>
      )}
    </div>
  );
}

function Locked({
  card,
  path,
  label,
  value,
  technical = true,
}: {
  card: Card;
  path: string;
  label: string;
  value: string;
  technical?: boolean;
}) {
  const t = useTranslations('admin');
  return (
    <EnvLockedField
      label={label}
      value={card.view.env[path] && card.secretSet(path) ? card.view.env[path]! : value}
      caption={t('envLocked')}
      technical={technical}
    />
  );
}

export function TextSetting({
  card,
  path,
  label,
  technical = true,
  placeholder,
  numeric,
  hint,
}: {
  card: Card;
  path: string;
  label: string;
  technical?: boolean;
  placeholder?: string;
  numeric?: boolean;
  hint?: ReactNode;
}) {
  const id = useId();
  const raw = card.get(path);
  const value = raw === undefined || raw === null ? '' : String(raw);
  if (card.locked(path)) return <Locked card={card} path={path} label={label} value={value} />;
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <Input
        id={id}
        value={value}
        dir={technical ? 'ltr' : 'auto'}
        inputMode={numeric ? 'numeric' : undefined}
        placeholder={placeholder}
        className={technical ? 'ltr-island font-mono' : undefined}
        onChange={(e) => {
          const v = e.target.value;
          card.set(path, v === '' ? null : numeric && /^\d+$/.test(v) ? Number(v) : v);
        }}
      />
    </Field>
  );
}

/** A secret: masked once saved (never shown again), replaced or removed on save. */
export function SecretSetting({
  card,
  path,
  label,
  display,
}: {
  card: Card;
  path: string;
  label: string;
  /** A safe rendering of the saved value (the Postgres URL without its password). */
  display?: string;
}) {
  const t = useTranslations('admin.secret');
  const id = useId();
  const [replacing, setReplacing] = useState(false);
  if (card.locked(path)) {
    return <Locked card={card} path={path} label={label} value={display ?? '••••••••'} />;
  }
  const saved = card.secretSet(path) && !replacing && !(path in card.draft);
  if (saved) {
    return (
      <Field label={label}>
        <MaskedSecret
          prefix={display ?? ''}
          last4=""
          onReplace={() => setReplacing(true)}
          onRemove={() => card.set(path, null)}
          labels={{ masked: label, replace: t('replace'), remove: t('remove') }}
        />
      </Field>
    );
  }
  const removed = card.draft[path] === null && card.view.secrets.includes(path);
  return (
    <Field label={label} htmlFor={id} hint={removed ? t('removed') : undefined}>
      <Input
        id={id}
        type="password"
        autoComplete="off"
        dir="ltr"
        className="ltr-island font-mono"
        value={typeof card.draft[path] === 'string' ? (card.draft[path] as string) : ''}
        onChange={(e) => card.set(path, e.target.value || (replacing ? undefined : null))}
      />
    </Field>
  );
}

export function SelectSetting({
  card,
  path,
  label,
  options,
}: {
  card: Card;
  path: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  const value = String(card.get(path) ?? '');
  if (card.locked(path)) {
    return (
      <Locked
        card={card}
        path={path}
        label={label}
        value={options.find((o) => o.value === value)?.label ?? value}
        technical={false}
      />
    );
  }
  return (
    <Field label={label} htmlFor={id}>
      <Select value={value} onValueChange={(v) => card.set(path, v)}>
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function SwitchRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <label htmlFor={id}>{label}</label>
        {hint ? <span className="text-muted-foreground text-sm">{hint}</span> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

/** Test connection (when the card has a port), then Save and Discard while there are edits. */
export function CardActions({ card, note }: { card: Card; note?: ReactNode }) {
  const t = useTranslations('admin');
  const detail = useTestDetail();
  const { test } = card;
  return (
    <div className="mt-auto flex flex-col gap-3">
      {card.port && !card.readOnly ? (
        <TestConnectionResult
          state={test.state}
          detail={test.result ? detail(test.result) : undefined}
          onTest={() => void card.runTest()}
          labels={{ test: t('test.test'), testing: t('test.testing') }}
        />
      ) : null}
      {card.dirty ? (
        <>
          {note}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={card.saving}
              onClick={() => void card.save()}
            >
              {card.saving ? t('saving') : t('save')}
            </Button>
            <Button variant="ghost" size="sm" onClick={card.reset}>
              {t('discard')}
            </Button>
          </div>
        </>
      ) : null}
      {card.error ? (
        <ErrorState scope="inline" title={t('saveFailed', { reason: card.error })} />
      ) : null}
    </div>
  );
}

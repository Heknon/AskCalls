'use client';

import { ApiError, createApiClient, type ResponseFor } from '@askcalls/api-contract';
import {
  completeSetup,
  setupPasskeyOptions,
  testSetupConnection,
  verifySetup,
} from '@askcalls/api-contract/routes/setup';
import { ChoiceCard } from '@askcalls/ui/components/ChoiceCard';
import { CopyableCode } from '@askcalls/ui/components/CopyableCode';
import { EnvLockedField } from '@askcalls/ui/components/EnvLockedField';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { Logo } from '@askcalls/ui/components/Logo';
import { OfflineBlockerList } from '@askcalls/ui/components/OfflineBlockerList';
import { Stepper } from '@askcalls/ui/components/Stepper';
import { TestConnectionResult } from '@askcalls/ui/components/TestConnectionResult';
import { Alert } from '@askcalls/ui/primitives/alert';
import { Button } from '@askcalls/ui/primitives/button';
import { Input } from '@askcalls/ui/primitives/input';
import { Label } from '@askcalls/ui/primitives/label';
import { RadioGroup } from '@askcalls/ui/primitives/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@askcalls/ui/primitives/select';
import { startRegistration } from '@simplewebauthn/browser';
import { ArrowLeft, ArrowRight, CircleCheck, Info, KeyRound } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useId, useMemo, useState } from 'react';
import { type FixId, fixPatch, offlineBlockers } from '../../../../server/config/offline';
import { InstanceConfigSchema } from '../../../../server/config/schema';
import { getAt, nest } from '../../../(app)/(shell)/admin/instance/_instance/form';

type SetupState = ResponseFor<typeof verifySetup>;
type TestResult = ResponseFor<typeof testSetupConnection>;
type Port = 'database' | 'blob' | 'transcription' | 'llm';
type Json = Record<string, unknown>;

const STEPS = ['database', 'storage', 'signIn', 'ai', 'offline', 'admin'] as const;
const api = createApiClient();

function merge(base: Json, over: Json): Json {
  const out: Json = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === null) delete out[k];
    else if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      out[k] &&
      typeof out[k] === 'object'
    )
      out[k] = merge(out[k] as Json, v as Json);
    else out[k] = v;
  }
  return out;
}

function flatten(obj: Json, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v as Json, p));
    else out[p] = v;
  }
  return out;
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

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: (id: string) => ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
    </div>
  );
}

export function SetupWizard() {
  const t = useTranslations('admin');
  const ts = useTranslations('admin.setup');
  const tc = useTranslations('common');
  const tt = useTranslations('admin.test');
  const [state, setState] = useState<SetupState | null>(null);
  const [token, setToken] = useState('');
  const [tokenError, setTokenError] = useState(false);
  const [step, setStep] = useState(0);
  const [patch, setPatch] = useState<Json>({});
  const [tests, setTests] = useState<
    Partial<Record<Port, { state: 'testing' | 'ok' | 'failed'; result?: TestResult; for: string }>>
  >({});
  const [admin, setAdmin] = useState({
    email: '',
    method: 'passkey' as 'passkey' | 'password',
    password: '',
  });
  const [passkey, setPasskey] = useState<{ email: string; response: unknown } | null>(null);
  const [passkeyError, setPasskeyError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = (path: string) => state?.locked.includes(path) ?? false;
  const value = (path: string): unknown =>
    locked(path) ? getAt(state?.config, path) : getAt(patch, path);
  const set = (path: string, v: unknown) => setPatch((p) => merge(p, nest({ [path]: v })));
  const sent = useMemo(() => {
    const flat = flatten(patch);
    for (const p of Object.keys(flat)) if (state?.locked.includes(p)) delete flat[p];
    return nest(flat);
  }, [patch, state]);
  const sentKey = JSON.stringify(sent);

  const config = useMemo(() => {
    const parsed = InstanceConfigSchema.safeParse(merge((state?.config ?? {}) as Json, sent));
    return parsed.success ? parsed.data : null;
  }, [state, sent]);
  const blockers = config ? offlineBlockers(config, new Set(state?.locked ?? [])) : [];

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await api.request(verifySetup, { body: { token } });
      setState(s);
      const initial: Json = {
        db: { driver: 'pglite', pgliteDir: s.defaults.pgliteDir },
        blob: { driver: 'fs', fsDir: s.defaults.fsDir },
        auth: { providers: [], localAccounts: true },
        transcription: { provider: 'none' },
        llm: { provider: 'none' },
        offlineMode: false,
      };
      setPatch(initial);
    } catch {
      setTokenError(true);
    } finally {
      setBusy(false);
    }
  };

  const runTest = async (port: Port) => {
    setTests((x) => ({ ...x, [port]: { state: 'testing', for: sentKey } }));
    try {
      const result = await api.request(testSetupConnection, { body: { token, port, patch: sent } });
      setTests((x) => ({
        ...x,
        [port]: { state: result.ok ? 'ok' : 'failed', result, for: sentKey },
      }));
    } catch {
      setTests((x) => ({ ...x, [port]: { state: 'failed', for: sentKey } }));
    }
  };
  const passed = (port: Port) => tests[port]?.state === 'ok' && tests[port]?.for === sentKey;
  const detail = (r?: TestResult) => {
    if (!r) return tt('failed', { reason: tt('reason.unreachable') });
    if (r.ok) {
      if (r.postgres) {
        return r.postgres.vector
          ? tt('okPostgres', { v: r.postgres.version, pv: r.postgres.vector })
          : tt('noVector');
      }
      return r.message === 'off' ? tt('off') : tt('ok', { ms: r.latencyMs ?? 0 });
    }
    const key = REASONS[r.message];
    return tt('failed', {
      reason: key
        ? tt(`reason.${key}` as 'reason.unreachable')
        : tt('reason.other', { message: r.message }),
    });
  };
  const testFor = (port: Port) => (
    <TestConnectionResult
      state={tests[port]?.for === sentKey ? (tests[port]?.state ?? 'idle') : 'idle'}
      detail={tests[port]?.for === sentKey ? detail(tests[port]?.result) : undefined}
      onTest={() => void runTest(port)}
      labels={{ test: tt('test'), testing: tt('testing') }}
    />
  );

  const providers = (value('auth.providers') as string[] | undefined) ?? [];
  const localAccounts = value('auth.localAccounts') === true;
  const offline = value('offlineMode') === true;
  const textInput = (
    path: string,
    label: string,
    opts: { placeholder?: string; secret?: boolean; technical?: boolean } = {},
  ) =>
    locked(path) ? (
      <EnvLockedField
        key={path}
        label={label}
        value={state?.env[path] ?? String(value(path) ?? '')}
        caption={t('envLocked')}
      />
    ) : (
      <Field key={path} label={label}>
        {(id) => (
          <Input
            id={id}
            type={opts.secret ? 'password' : 'text'}
            autoComplete="off"
            dir={opts.technical === false ? 'auto' : 'ltr'}
            className={opts.technical === false ? undefined : 'ltr-island font-mono'}
            placeholder={opts.placeholder}
            value={String(value(path) ?? '')}
            onChange={(e) => set(path, e.target.value || null)}
          />
        )}
      </Field>
    );
  const filled = (...paths: string[]) => paths.every((p) => locked(p) || Boolean(value(p)));

  const canContinue = (() => {
    switch (STEPS[step]) {
      case 'database':
        return value('db.driver') !== 'postgres' || passed('database');
      case 'storage':
        return value('blob.driver') === 's3' ? passed('blob') : filled('blob.fsDir');
      case 'signIn':
        return (
          (localAccounts || providers.length > 0) &&
          (!providers.includes('google') || filled('auth.google.id', 'auth.google.secret')) &&
          (!providers.includes('github') || filled('auth.github.id', 'auth.github.secret')) &&
          (!providers.includes('email') || filled('auth.email.server', 'auth.email.from'))
        );
      case 'ai': {
        const tx = String(value('transcription.provider'));
        const llm = String(value('llm.provider'));
        const txOk =
          tx === 'none' ||
          (tx === 'openai-compatible'
            ? filled('transcription.baseUrl')
            : filled(`transcription.keys.${tx}`));
        const llmOk =
          llm === 'none' ||
          (llm === 'openai-compatible' ? filled('llm.baseUrl', 'llm.model') : filled('llm.apiKey'));
        return txOk && llmOk;
      }
      case 'offline':
        return !offline || (blockers.length === 0 && localAccounts);
      default:
        return false;
    }
  })();

  const createPasskey = async () => {
    setPasskeyError(false);
    try {
      const { options } = await api.request(setupPasskeyOptions, {
        body: { token, email: admin.email },
      });
      const response = await startRegistration(
        options as unknown as Parameters<typeof startRegistration>[0],
      );
      setPasskey({ email: admin.email.trim().toLowerCase(), response });
    } catch {
      setPasskeyError(true);
    }
  };

  const adminReady =
    /^[^@\s]+@[^@\s]+$/.test(admin.email.trim()) &&
    (admin.method === 'password'
      ? admin.password.length >= 12
      : passkey?.email === admin.email.trim().toLowerCase());

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const { claim } = await api.request(completeSetup, {
        body: {
          token,
          patch: sent,
          admin: {
            email: admin.email,
            ...(admin.method === 'password'
              ? { password: admin.password }
              : { passkey: passkey!.response as Record<string, unknown> }),
          },
        },
      });
      await signIn('setup-claim', { claim, redirect: false });
      window.location.assign('/app/welcome');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setBusy(false);
    }
  };

  const stepper = (orientation: 'vertical' | 'horizontal') => (
    <Stepper
      orientation={orientation}
      label={ts('label')}
      current={state ? step : 0}
      steps={STEPS.map((key) => ({ key, label: ts(`steps.${key}`) }))}
    />
  );

  const txProvider = String(value('transcription.provider'));
  const llmProvider = String(value('llm.provider'));
  const choiceGroup = (
    path: string,
    label: string,
    options: { value: string; title: string; description: string; details?: ReactNode }[],
    current: string,
    onChange: (v: string) => void = (v) => set(path, v),
  ) =>
    locked(path) ? (
      <EnvLockedField
        label={label}
        value={options.find((o) => o.value === current)?.title ?? current}
        caption={t('envLocked')}
        technical={false}
      />
    ) : (
      <RadioGroup
        aria-label={label}
        value={current}
        onValueChange={onChange}
        className="flex flex-col gap-3"
      >
        {options.map((o) => (
          <ChoiceCard
            key={o.value}
            value={o.value}
            title={o.title}
            description={o.description}
            details={o.details}
          />
        ))}
      </RadioGroup>
    );
  const cloudKind = (provider: string, local: string) =>
    provider === 'none' ? 'none' : provider === local ? 'local' : 'cloud';

  const content = (() => {
    if (!state) {
      return (
        <form onSubmit={verify} className="flex flex-col gap-6" noValidate>
          <h1 className="font-semibold text-3xl tracking-tight">{ts('token.title')}</h1>
          <p className="text-muted-foreground">{ts('token.body')}</p>
          <Field label={ts('token.label')}>
            {(id) => (
              <Input
                id={id}
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                className="ltr-island font-mono uppercase"
                value={token}
                aria-invalid={tokenError || undefined}
                onChange={(e) => {
                  setToken(e.target.value);
                  setTokenError(false);
                }}
              />
            )}
          </Field>
          {tokenError ? <ErrorState scope="inline" title={ts('token.wrong')} /> : null}
          <div className="flex justify-end border-border border-t pt-6">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={busy}
              disabled={!token.trim()}
            >
              {ts('token.submit')}
              <ArrowRight className="icon-directional size-4" aria-hidden />
            </Button>
          </div>
        </form>
      );
    }
    switch (STEPS[step]) {
      case 'database':
        return (
          <>
            <h1 className="font-semibold text-3xl tracking-tight">{ts('db.title')}</h1>
            {choiceGroup(
              'db.driver',
              ts('db.title'),
              [
                {
                  value: 'pglite',
                  title: ts('db.builtin'),
                  description: ts('db.builtinBody', {
                    path: String(value('db.pgliteDir') ?? state.defaults.pgliteDir),
                  }),
                },
                {
                  value: 'postgres',
                  title: ts('db.external'),
                  description: ts('db.externalBody'),
                  details: (
                    <div className="flex flex-col gap-3">
                      {textInput('db.url', t('field.postgresUrl'), {
                        placeholder: 'postgres://askcalls:…@db:5432/askcalls',
                      })}
                      {testFor('database')}
                    </div>
                  ),
                },
              ],
              String(value('db.driver')),
            )}
          </>
        );
      case 'storage':
        return (
          <>
            <h1 className="font-semibold text-3xl tracking-tight">{ts('storage.title')}</h1>
            {choiceGroup(
              'blob.driver',
              ts('storage.title'),
              [
                {
                  value: 'fs',
                  title: ts('storage.fs'),
                  description: ts('storage.fsBody'),
                  details: textInput('blob.fsDir', t('field.folder')),
                },
                {
                  value: 's3',
                  title: ts('storage.s3'),
                  description: ts('storage.s3Body'),
                  details: (
                    <div className="flex flex-col gap-3">
                      {textInput('blob.s3.endpoint', t('field.endpoint'), {
                        placeholder: 'http://minio:9000',
                      })}
                      <div className="grid gap-3 md:grid-cols-2">
                        {textInput('blob.s3.bucket', t('field.bucket'))}
                        {textInput('blob.s3.region', t('field.region'))}
                      </div>
                      {textInput('blob.s3.accessKeyId', t('field.accessKeyId'))}
                      {textInput('blob.s3.secretAccessKey', t('field.secretKey'), { secret: true })}
                      {testFor('blob')}
                      {tests.blob?.result?.cors &&
                      tests.blob.result.cors.status !== 'ok' &&
                      tests.blob.result.cors.fixJson ? (
                        <div className="flex flex-col gap-2">
                          <p className="text-sm">{t('cors.missing')}</p>
                          <CopyableCode
                            language="json"
                            code={tests.blob.result.cors.fixJson}
                            labels={{ copy: tc('copy'), copied: tc('copied') }}
                          />
                        </div>
                      ) : tests.blob?.result?.cors?.status === 'ok' ? (
                        <p className="text-muted-foreground text-sm">{t('cors.ok')}</p>
                      ) : null}
                    </div>
                  ),
                },
              ],
              String(value('blob.driver')),
            )}
          </>
        );
      case 'signIn': {
        const callback = (id: string) => new URL(`/api/auth/callback/${id}`, state.appUrl).href;
        const toggle = (id: string, on: boolean) =>
          set('auth.providers', on ? [...providers, id] : providers.filter((p) => p !== id));
        const methods: {
          id: string;
          title: string;
          body: string;
          on: boolean;
          onChange: (on: boolean) => void;
          fields?: ReactNode;
        }[] = [
          {
            id: 'local',
            title: t('signIn.local'),
            body: ts('signIn.localBody'),
            on: localAccounts,
            onChange: (on) => set('auth.localAccounts', on),
          },
          ...(['google', 'github'] as const).map((id) => ({
            id,
            title: t(`signIn.${id}`),
            body: ts(`signIn.${id}Body`),
            on: providers.includes(id),
            onChange: (on: boolean) => toggle(id, on),
            fields: (
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  {textInput(`auth.${id}.id`, t('field.clientId'))}
                  {textInput(`auth.${id}.secret`, t('field.clientSecret'), { secret: true })}
                </div>
                <EnvLockedField label={ts('signIn.callback')} value={callback(id)} caption="" />
              </div>
            ),
          })),
          {
            id: 'email',
            title: t('signIn.email'),
            body: ts('signIn.emailBody'),
            on: providers.includes('email'),
            onChange: (on) => toggle('email', on),
            fields: (
              <div className="grid gap-3 md:grid-cols-2">
                {textInput('auth.email.server', t('field.smtp'), {
                  placeholder: 'smtp://user:pass@mail:587',
                  secret: true,
                })}
                {textInput('auth.email.from', t('field.from'), { technical: false })}
              </div>
            ),
          },
        ];
        return (
          <>
            <h1 className="font-semibold text-3xl tracking-tight">{ts('signIn.title')}</h1>
            {locked('auth.providers') ? (
              <EnvLockedField
                label={t('cards.signIn')}
                value={providers.join(', ') || '—'}
                caption={t('envLocked')}
              />
            ) : null}
            <div className="flex flex-col gap-3">
              {methods
                .filter((m) => !(m.id !== 'local' && locked('auth.providers')))
                .map((m) => (
                  <ChoiceCard
                    key={m.id}
                    value={m.id}
                    title={m.title}
                    description={m.body}
                    checkbox={{ checked: m.on, onCheckedChange: m.onChange }}
                    disabled={m.id === 'local' && locked('auth.localAccounts')}
                    details={m.fields}
                  />
                ))}
            </div>
            {!localAccounts && providers.length === 0 ? (
              <p className="text-muted-foreground text-sm">{ts('signIn.none')}</p>
            ) : null}
          </>
        );
      }
      case 'ai':
        return (
          <>
            <h1 className="font-semibold text-3xl tracking-tight">{ts('ai.title')}</h1>
            <h2 className="font-semibold text-lg">{ts('ai.transcription')}</h2>
            {choiceGroup(
              'transcription.provider',
              ts('ai.transcription'),
              [
                { value: 'none', title: ts('ai.off'), description: ts('ai.transcriptionOffBody') },
                {
                  value: 'cloud',
                  title: ts('ai.cloud'),
                  description: ts('ai.cloudBody'),
                  details: (
                    <div className="flex flex-col gap-3">
                      <ProviderSelect
                        label={t('field.provider')}
                        value={
                          ['elevenlabs', 'openai', 'deepgram', 'soniox'].includes(txProvider)
                            ? txProvider
                            : 'elevenlabs'
                        }
                        options={['elevenlabs', 'openai', 'deepgram', 'soniox']}
                        onChange={(v) => set('transcription.provider', v)}
                      />
                      {textInput(
                        `transcription.keys.${['elevenlabs', 'openai', 'deepgram', 'soniox'].includes(txProvider) ? txProvider : 'elevenlabs'}`,
                        t('field.apiKey'),
                        { secret: true },
                      )}
                      {testFor('transcription')}
                    </div>
                  ),
                },
                {
                  value: 'openai-compatible',
                  title: ts('ai.local'),
                  description: ts('ai.transcriptionLocalBody'),
                  details: (
                    <div className="flex flex-col gap-3">
                      {textInput('transcription.baseUrl', t('field.baseUrl'), {
                        placeholder: 'http://whisper:8000/v1',
                      })}
                      {testFor('transcription')}
                    </div>
                  ),
                },
              ],
              cloudKind(txProvider, 'openai-compatible') === 'cloud' ? 'cloud' : txProvider,
              (v) => set('transcription.provider', v === 'cloud' ? 'elevenlabs' : v),
            )}
            <h2 className="font-semibold text-lg">{ts('ai.llm')}</h2>
            {choiceGroup(
              'llm.provider',
              ts('ai.llm'),
              [
                { value: 'none', title: ts('ai.off'), description: ts('ai.llmOffBody') },
                {
                  value: 'cloud',
                  title: ts('ai.cloud'),
                  description: ts('ai.cloudBody'),
                  details: (
                    <div className="flex flex-col gap-3">
                      <ProviderSelect
                        label={t('field.provider')}
                        value={
                          ['anthropic', 'openai', 'google'].includes(llmProvider)
                            ? llmProvider
                            : 'anthropic'
                        }
                        options={['anthropic', 'openai', 'google']}
                        onChange={(v) => set('llm.provider', v)}
                      />
                      {textInput('llm.apiKey', t('field.apiKey'), { secret: true })}
                      {testFor('llm')}
                    </div>
                  ),
                },
                {
                  value: 'openai-compatible',
                  title: ts('ai.local'),
                  description: ts('ai.llmLocalBody'),
                  details: (
                    <div className="flex flex-col gap-3">
                      {textInput('llm.baseUrl', t('field.baseUrl'), {
                        placeholder: 'http://ollama:11434/v1',
                      })}
                      {textInput('llm.model', t('field.model'), { placeholder: 'llama3.2' })}
                      {testFor('llm')}
                    </div>
                  ),
                },
              ],
              cloudKind(llmProvider, 'openai-compatible') === 'cloud' ? 'cloud' : llmProvider,
              (v) => set('llm.provider', v === 'cloud' ? 'anthropic' : v),
            )}
          </>
        );
      case 'offline':
        return (
          <>
            <h1 className="font-semibold text-3xl tracking-tight">{ts('offline.title')}</h1>
            <p className="text-muted-foreground">{ts('offline.body')}</p>
            {locked('offlineMode') ? (
              <EnvLockedField
                label={ts('offline.switch')}
                value={offline ? t('value.on') : t('value.off')}
                caption={t('envLocked')}
                technical={false}
              />
            ) : (
              <OfflineBlockerList
                title={ts('offline.switch')}
                summary={
                  blockers.length
                    ? t('offline.blockers', { n: blockers.length })
                    : t('offline.clear')
                }
                enabled={offline}
                onEnabledChange={(on) => set('offlineMode', on)}
                blockers={blockers.map((b) => ({
                  key: b.id,
                  what: t(`offline.what.${b.id}` as 'offline.what.llm', { adapter: b.adapter }),
                  host: b.host,
                  fixes: b.fixes.map((fix) => ({
                    label: t(
                      `offline.fix.${fix === 'off' && b.id.startsWith('sign-in-') ? b.id : fix}` as 'offline.fix.off',
                    ),
                    onFix: () => {
                      const p = config ? fixPatch(config, b.id, fix as FixId) : null;
                      if (p) setPatch((cur) => merge(cur, p));
                    },
                  })),
                }))}
              />
            )}
          </>
        );
      case 'admin':
        return (
          <>
            <h1 className="font-semibold text-3xl tracking-tight">{ts('admin.title')}</h1>
            <Field label={ts('admin.email')}>
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  value={admin.email}
                  onChange={(e) => setAdmin((a) => ({ ...a, email: e.target.value }))}
                />
              )}
            </Field>
            <RadioGroup
              aria-label={ts('admin.title')}
              value={admin.method}
              onValueChange={(v) =>
                setAdmin((a) => ({ ...a, method: v as 'passkey' | 'password' }))
              }
              className="flex flex-col gap-3"
            >
              <ChoiceCard
                value="passkey"
                title={ts('admin.passkey')}
                description={ts('admin.passkeyBody')}
                details={
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void createPasskey()}
                      disabled={!/^[^@\s]+@[^@\s]+$/.test(admin.email.trim())}
                    >
                      <KeyRound className="size-4" aria-hidden />
                      {ts('admin.createPasskey')}
                    </Button>
                    {passkey?.email === admin.email.trim().toLowerCase() ? (
                      <span
                        role="status"
                        className="inline-flex items-center gap-1.5 text-sm text-success"
                      >
                        <CircleCheck className="size-4" aria-hidden />
                        {ts('admin.passkeyReady')}
                      </span>
                    ) : passkeyError ? (
                      <ErrorState scope="inline" title={ts('admin.passkeyFailed')} />
                    ) : null}
                  </div>
                }
              />
              <ChoiceCard
                value="password"
                title={ts('admin.password')}
                description={ts('admin.passwordBody')}
                disabled={!localAccounts}
                details={
                  <Field
                    label={ts('admin.password')}
                    hint={
                      admin.password && admin.password.length < 12
                        ? ts('admin.passwordShort')
                        : undefined
                    }
                  >
                    {(id) => (
                      <Input
                        id={id}
                        type="password"
                        autoComplete="new-password"
                        value={admin.password}
                        onChange={(e) => setAdmin((a) => ({ ...a, password: e.target.value }))}
                      />
                    )}
                  </Field>
                }
              />
            </RadioGroup>
            {error ? (
              <ErrorState scope="inline" title={ts('admin.failed', { reason: error })} />
            ) : null}
          </>
        );
    }
  })();

  const last = step === STEPS.length - 1;
  return (
    <div className="min-h-dvh bg-background md:grid md:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-10 border-border border-e bg-sidebar px-8 py-9 max-md:hidden">
        <Logo name={tc('brand')} />
        {stepper('vertical')}
      </aside>
      <div className="flex flex-col gap-4 border-border border-b px-4 py-4 md:hidden">
        <Logo name={tc('brand')} size="sm" />
        {stepper('horizontal')}
      </div>
      <main id="main" className="px-4 py-6 md:px-12 md:py-12">
        <div className="flex max-w-152 flex-col gap-6">
          {state && step === 0 ? (
            <Alert tone="info" role="note">
              <Info aria-hidden />
              <p>{ts('noAdmin')}</p>
            </Alert>
          ) : null}
          {content}
          {state ? (
            <>
              {step === 0 ? (
                <p className="text-muted-foreground text-sm">{ts('changeLater')}</p>
              ) : null}
              {!canContinue && STEPS[step] === 'database' ? (
                <p className="text-muted-foreground text-sm">{ts('testRequired')}</p>
              ) : null}
              {STEPS[step] === 'offline' && offline && !localAccounts ? (
                <ErrorState scope="inline" title={ts('offline.needsLocal')} />
              ) : null}
              <div className="flex items-center justify-between gap-3 border-border border-t pt-6">
                {step > 0 ? (
                  <Button variant="ghost" size="lg" onClick={() => setStep((s) => s - 1)}>
                    <ArrowLeft className="icon-directional size-4" aria-hidden />
                    {tc('back')}
                  </Button>
                ) : (
                  <span />
                )}
                {last ? (
                  <Button
                    variant="primary"
                    size="lg"
                    loading={busy}
                    disabled={!adminReady}
                    onClick={() => void finish()}
                  >
                    {busy ? ts('admin.finishing') : ts('admin.finish')}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={!canContinue}
                    onClick={() => setStep((s) => s + 1)}
                  >
                    {tc('continue')}
                    <ArrowRight className="icon-directional size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function ProviderSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const t = useTranslations('admin.provider');
  return (
    <Field label={label}>
      {(id) => (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {t(o as 'none')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}

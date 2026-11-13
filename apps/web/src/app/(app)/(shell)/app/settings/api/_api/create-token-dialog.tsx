'use client';

import { ApiScopeSchema, createToken } from '@askcalls/api-contract/routes/tokens';
import { CopyableCode } from '@askcalls/ui/components/CopyableCode';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { Alert } from '@askcalls/ui/primitives/alert';
import { Button } from '@askcalls/ui/primitives/button';
import { Checkbox } from '@askcalls/ui/primitives/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@askcalls/ui/primitives/dialog';
import { Input } from '@askcalls/ui/primitives/input';
import { Label } from '@askcalls/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@askcalls/ui/primitives/select';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { useUnlocked } from '../../../../../../../client/session/session';

type Scope = (typeof ApiScopeSchema.options)[number];
const SCOPES = ApiScopeSchema.options;
const EXPIRY = ['30', '90', '365', 'never'] as const;

/** S4 Create token: name, scopes, expiry; then the token once with copy. */
export function CreateTokenDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations('settings.api.dialog');
  const ta = useTranslations('settings.api');
  const tc = useTranslations('common');
  const { client } = useUnlocked();
  const id = useId();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Scope[]>(['read', 'write', 'ask', 'keys']);
  const [expiry, setExpiry] = useState<(typeof EXPIRY)[number]>('90');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'noName' | 'noScope' | 'failed' | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const change = (o: boolean) => {
    if (!o) {
      setName('');
      setScopes(['read', 'write', 'ask', 'keys']);
      setExpiry('90');
      setError(null);
      setToken(null);
    }
    onOpenChange(o);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('noName');
    if (scopes.length === 0) return setError('noScope');
    setBusy(true);
    setError(null);
    try {
      const r = await client.api.request(createToken, {
        body: {
          name: name.trim(),
          scopes,
          expiresInDays: expiry === 'never' ? null : Number(expiry),
        },
      });
      setToken(r.token);
      onCreated();
    } catch {
      setError('failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent closeLabel={tc('close')} aria-describedby={undefined}>
        {token ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('createdTitle')}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <CopyableCode
                language="text"
                code={token}
                labels={{ copy: tc('copy'), copied: tc('copied') }}
              />
              <Alert tone="warning">
                <TriangleAlert aria-hidden />
                <p>{t('once')}</p>
              </Alert>
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={() => change(false)}>
                {t('done')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col">
            <DialogHeader>
              <DialogTitle>{t('title')}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-name`}>{t('name')}</Label>
                <Input
                  id={`${id}-name`}
                  dir="auto"
                  maxLength={100}
                  placeholder={t('namePlaceholder')}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  aria-invalid={error === 'noName' || undefined}
                />
                {error === 'noName' ? (
                  <p role="alert" className="text-destructive text-sm">
                    {t('noName')}
                  </p>
                ) : null}
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 font-medium text-sm">{t('scopes')}</legend>
                {SCOPES.map((s) => (
                  <div key={s} className="flex items-center gap-2.5">
                    <Checkbox
                      id={`${id}-${s}`}
                      checked={scopes.includes(s)}
                      onCheckedChange={(on) => {
                        setError(null);
                        setScopes((cur) =>
                          on
                            ? SCOPES.filter((x) => x === s || cur.includes(x))
                            : cur.filter((x) => x !== s),
                        );
                      }}
                    />
                    <Label htmlFor={`${id}-${s}`} className="font-normal">
                      <code dir="ltr" className="font-medium">
                        {s}
                      </code>
                      : {ta(`scope.${s}`)}
                    </Label>
                  </div>
                ))}
                {error === 'noScope' ? (
                  <p role="alert" className="text-destructive text-sm">
                    {t('noScope')}
                  </p>
                ) : null}
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-expiry`}>{t('expiry')}</Label>
                <Select value={expiry} onValueChange={(v) => setExpiry(v as typeof expiry)}>
                  <SelectTrigger id={`${id}-expiry`} className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY.map((x) => (
                      <SelectItem key={x} value={x}>
                        {ta(`expiryOption.${x}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {error === 'failed' ? <ErrorState scope="inline" title={t('failed')} /> : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" disabled={busy} onClick={() => change(false)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                {busy ? t('creating') : t('create')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

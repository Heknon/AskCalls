'use client';

import { revokeKeyring } from '@askcalls/api-contract/routes/keyring';
import { addUnlockMethod } from '@askcalls/client-core/keys';
import { estimatePassphraseStrength, isCryptoError } from '@askcalls/crypto';
import { ConfirmDialog } from '@askcalls/ui/components/ConfirmDialog';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { PassphraseField } from '@askcalls/ui/components/PassphraseField';
import { Button } from '@askcalls/ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@askcalls/ui/primitives/dialog';
import { RectangleEllipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useNotify } from '../../../../../../../client/notices/notices';
import { useUnlocked } from '../../../../../../../client/session/session';

/**
 * Set or change the passphrase. Changing adds the new entry first and then revokes the old
 * ones, so there is never a moment without it.
 */
export function PassphraseDialog({
  open,
  onOpenChange,
  existingIds,
  onDone,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingIds: string[];
  onDone: () => void;
  /** Changing only: closes this dialog and asks to remove the passphrase. */
  onRemove: () => void;
}) {
  const t = useTranslations('settings.sec.pass');
  const tc = useTranslations('common');
  const { client } = useUnlocked();
  const notify = useNotify();
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<'short' | 'mismatch' | 'failed' | null>(null);
  const [saving, setSaving] = useState(false);
  const changing = existingIds.length > 0;

  const close = (o: boolean) => {
    if (!o) {
      setPass('');
      setAgain('');
      setError(null);
    }
    onOpenChange(o);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!estimatePassphraseStrength(pass).acceptable) return setError('short');
    if (pass !== again) return setError('mismatch');
    setSaving(true);
    try {
      await addUnlockMethod(
        { api: client.api, session: client.session },
        { method: 'passphrase', passphrase: pass, label: t('title') },
      );
      for (const id of existingIds) {
        await client.api.request(revokeKeyring, { params: { id } });
      }
      notify({ kind: 'event', icon: RectangleEllipsis, title: t('saved') });
      close(false);
      onDone();
    } catch (err) {
      setError(isCryptoError(err, 'weak_passphrase') ? 'short' : 'failed');
    } finally {
      setSaving(false);
    }
  };

  const { score } = estimatePassphraseStrength(pass);
  const word = score <= 1 ? 'weak' : score === 2 ? 'fair' : 'strong';
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent closeLabel={tc('close')}>
        <form onSubmit={submit} noValidate className="flex flex-col">
          <DialogHeader>
            <DialogTitle>{changing ? t('changeTitle') : t('setTitle')}</DialogTitle>
            <DialogDescription>{t('body')}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <PassphraseField
              mode="create"
              label={t('label')}
              value={pass}
              onChange={(v) => {
                setPass(v);
                setError(null);
              }}
              hint={t('hint')}
              strength={pass ? { score, label: t(`strength.${word}`) } : undefined}
              error={error === 'short' ? t('short') : undefined}
              labels={{ show: tc('show'), hide: tc('hide') }}
            />
            <PassphraseField
              mode="enter"
              label={t('again')}
              value={again}
              onChange={(v) => {
                setAgain(v);
                setError(null);
              }}
              error={error === 'mismatch' ? t('mismatch') : undefined}
              labels={{ show: tc('show'), hide: tc('hide') }}
            />
            {error === 'failed' ? <ErrorState scope="inline" title={t('failed')} /> : null}
          </DialogBody>
          <DialogFooter>
            {changing ? (
              <Button
                variant="ghost"
                className="me-auto"
                disabled={saving}
                onClick={() => {
                  close(false);
                  onRemove();
                }}
              >
                {t('remove')}
              </Button>
            ) : null}
            <Button variant="ghost" disabled={saving} onClick={() => close(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {saving ? t('creating') : changing ? t('change') : t('set')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemovePassphrase({
  open,
  onOpenChange,
  ids,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: string[];
  onDone: (ok: boolean) => void;
}) {
  const t = useTranslations('settings.sec.pass');
  const tc = useTranslations('common');
  const { client } = useUnlocked();
  const notify = useNotify();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('removeTitle')}
      description={t('removeBody')}
      confirmLabel={t('remove')}
      cancelLabel={tc('cancel')}
      onConfirm={async () => {
        try {
          for (const id of ids) await client.api.request(revokeKeyring, { params: { id } });
          notify({ kind: 'event', icon: RectangleEllipsis, title: t('removed') });
          onDone(true);
        } catch {
          onDone(false);
        }
      }}
    />
  );
}

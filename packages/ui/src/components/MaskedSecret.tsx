import { Button } from '../primitives/button';
import { Input } from '../primitives/input';

export type MaskedSecretProps = {
  /** "sk-ant-". */
  prefix: string;
  last4: string;
  onReplace: () => void;
  onRemove?: () => void;
  labels: { masked: string; replace: string; remove: string };
};

/** Shows that a secret is saved without revealing it. */
export function MaskedSecret({ prefix, last4, onReplace, onRemove, labels }: MaskedSecretProps) {
  return (
    <div data-component="MaskedSecret" className="flex items-center gap-2">
      <Input
        readOnly
        dir="ltr"
        aria-label={labels.masked}
        value={`${prefix}••••••••${last4}`}
        className="ltr-island flex-1 font-mono"
      />
      <Button variant="outline" size="sm" onClick={onReplace}>
        {labels.replace}
      </Button>
      {onRemove ? (
        <Button variant="ghost" size="sm" onClick={onRemove}>
          {labels.remove}
        </Button>
      ) : null}
    </div>
  );
}

'use client';

import { MessageSquareText } from 'lucide-react';
import { useId, useRef } from 'react';
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
import { Label } from '../primitives/label';
import { DataFlowNote, type DataFlowNoteProps } from './DataFlowNote';

export type ConsentSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Send this call to Anthropic?" */
  title: string;
  route: Extract<DataFlowNoteProps['route'], 'managed' | 'direct' | 'passthrough'>;
  /** The `dataFlow.ask.*` sentence for this route, provider and model. */
  dataFlow: string;
  nodes: DataFlowNoteProps['nodes'];
  /** Scope, names included, and the provider's retention terms. */
  facts: string[];
  remember: boolean;
  onRememberChange: (remember: boolean) => void;
  onSend: () => void;
  labels: { remember: string; change: string; cancel: string; send: string };
};

/**
 * Consent before one call's plaintext goes to an LLM provider, naming who receives it. A dialog on
 * desktop, a bottom sheet on phones. Focus starts on "Send and ask"; Cancel returns it to the input.
 */
export function ConsentSheet({
  open,
  onOpenChange,
  title,
  route,
  dataFlow,
  nodes,
  facts,
  remember,
  onRememberChange,
  onSend,
  labels,
}: ConsentSheetProps) {
  const sendRef = useRef<HTMLButtonElement>(null);
  const checkId = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-component="ConsentSheet"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          sendRef.current?.focus();
        }}
      >
        <DialogHeader className="flex-row items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
            <MessageSquareText className="size-5" aria-hidden />
          </span>
          <DialogTitle className="self-center">{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DataFlowNote route={route} nodes={nodes}>
            {dataFlow}
          </DataFlowNote>
          <ul className="flex list-disc flex-col gap-2 ps-4.5 text-sm">
            {facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Checkbox
              id={checkId}
              checked={remember}
              onCheckedChange={(v) => onRememberChange(v === true)}
            />
            <Label htmlFor={checkId} className="font-normal">
              {labels.remember}
            </Label>
          </div>
          <p className="text-muted-foreground text-sm">{labels.change}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
          <Button ref={sendRef} variant="primary" onClick={onSend}>
            {labels.send}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

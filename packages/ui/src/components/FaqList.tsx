'use client';

import type { ReactNode } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../primitives/accordion';

export type FaqListProps = {
  items: { key: string; question: string; answer: ReactNode }[];
};

/** Questions and answers. */
export function FaqList({ items }: FaqListProps) {
  return (
    <Accordion
      data-component="FaqList"
      type="multiple"
      className="max-w-3xl border-border border-t"
    >
      {items.map((it) => (
        <AccordionItem key={it.key} value={it.key}>
          <AccordionTrigger className="font-semibold">{it.question}</AccordionTrigger>
          <AccordionContent className="max-w-176">{it.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

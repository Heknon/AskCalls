const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LTR = /[A-Za-zÀ-ɏͰ-ԯ]/;

/** The direction of the first strong character, like `dir="auto"` decides it. */
export function firstStrongDir(text: string): 'ltr' | 'rtl' {
  for (const ch of text) {
    if (RTL.test(ch)) return 'rtl';
    if (LTR.test(ch)) return 'ltr';
  }
  return 'ltr';
}

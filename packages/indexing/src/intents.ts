import { z } from 'zod';
import { EMBEDDING_PASSAGE_PREFIX } from './constants';

/**
 * Zero-shot intent tags (spec 7.10). An intent's prototype is the normalized mean of its example
 * embeddings; a call gets the intent when some chunk is closer to the prototype than to everyday
 * chatter (`NEUTRAL_EXAMPLES` in neutral.ts) by the margin. Examples are embedded with the `passage: ` prefix,
 * like chunks, so both sides of the comparison are the same kind of vector.
 */
export type EmbedFn = (texts: string[]) => Promise<Float32Array[]>;

export const DEFAULT_INTENT_THRESHOLD = 0.82;

/**
 * How much closer to an intent than to small talk a chunk must be. The model scores most text
 * between 0.7 and 0.9, so a long call always has some chunk near every prototype; the margin over
 * `NEUTRAL_EXAMPLES` is what separates a request from chatter (`bun run models:calibrate-intents`).
 */
export const DEFAULT_INTENT_MARGIN = 0.01;

/**
 * A matching chunk must also be at least this similar to the intent: the pinned model scores
 * every intent above it for the chunks that carry one, and it keeps vectors that carry no meaning
 * from passing on the margin alone.
 */
export const MIN_INTENT_SIMILARITY = 0.75;

/**
 * The margin for a strictness setting (the 0 to 1 "threshold" users and custom intents store):
 * the default setting gives `DEFAULT_INTENT_MARGIN`, and each 0.05 step moves it by 0.005.
 */
export function intentMargin(threshold: number): number {
  return DEFAULT_INTENT_MARGIN + (threshold - DEFAULT_INTENT_THRESHOLD) * 0.1;
}

export const IntentDefinitionSchema = z.object({
  id: z.string().min(1).max(64),
  /** Display label for user-defined intents; built-ins use message-file keys keyed by id. */
  label: z.string().max(100).optional(),
  examples: z.array(z.string().min(1).max(500)).min(1).max(50),
  /** Overrides the global threshold for this intent. */
  threshold: z.number().min(0).max(1).optional(),
});
export type IntentDefinition = z.infer<typeof IntentDefinitionSchema>;

export interface IntentPrototype {
  id: string;
  /** L2-normalized mean of the example embeddings. */
  vector: Float32Array;
  /** The small-talk prototype every intent is measured against (shared by all intents). */
  neutral: Float32Array;
  threshold?: number;
}

export interface IntentMatch {
  id: string;
  /** Highest margin of any chunk: its similarity to the prototype minus to small talk. */
  score: number;
  /** Ord of the chunk with that score. */
  chunkOrd: number;
}

export type BuiltInIntentId =
  | 'purchase_interest'
  | 'price_question'
  | 'complaint'
  | 'service_request'
  | 'scheduling'
  | 'legal'
  | 'follow_up';

/** Six Hebrew and six English examples each. */
export const BUILT_IN_INTENTS: readonly (IntentDefinition & { id: BuiltInIntentId })[] = [
  {
    id: 'purchase_interest',
    examples: [
      'אני מעוניין לקנות את המוצר',
      'אני רוצה להזמין שתי יחידות',
      'אפשר לסגור את העסקה היום?',
      'זה בדיוק מה שחיפשתי, בוא נתקדם',
      'אני רוצה להצטרף למסלול השנתי',
      'תשלח לי הצעה ואני חותם',
      "I'd like to buy this",
      'We want to place an order for ten units',
      'Can we sign the contract this week?',
      'I am interested in upgrading to the premium plan',
      "Let's go ahead with the purchase",
      'How do I order it online?',
    ],
  },
  {
    id: 'price_question',
    examples: [
      'כמה זה עולה?',
      'מה המחיר של השירות?',
      'יש הנחה אם משלמים מראש?',
      'המחיר כולל מע״מ?',
      'כמה עולה המשלוח?',
      'אפשר לפרוס לתשלומים?',
      'How much does it cost?',
      "What's the price per month?",
      'Is there a discount for annual billing?',
      'Does the quote include VAT?',
      'What are the shipping fees?',
      'Can I pay in installments?',
    ],
  },
  {
    id: 'complaint',
    examples: [
      'אני מאוד לא מרוצה מהשירות',
      'זו כבר הפעם השלישית שאני מתקשר בנושא הזה',
      'המוצר הגיע שבור',
      'חייבו אותי פעמיים החודש',
      'אף אחד לא חזר אליי',
      'זה פשוט לא מקובל עליי',
      'I am very unhappy with the service',
      'This is the third time I am calling about this',
      'The product arrived broken',
      'I was charged twice this month',
      'Nobody ever called me back',
      'This is completely unacceptable',
    ],
  },
  {
    id: 'service_request',
    examples: [
      'צריך טכנאי שיבוא לתקן את המזגן',
      'האינטרנט לא עובד מאתמול',
      'אני צריך עזרה בהגדרת החשבון',
      'אפשר לפתוח קריאת שירות?',
      'המכשיר לא נדלק',
      'אני רוצה להחליף את הסיסמה',
      'I need a technician to fix the air conditioner',
      'The internet has been down since yesterday',
      'I need help setting up my account',
      'Can you open a support ticket?',
      "The device won't turn on",
      'I want to reset my password',
    ],
  },
  {
    id: 'scheduling',
    examples: [
      'אפשר לקבוע פגישה ליום שלישי?',
      'מתי נוח לך להיפגש?',
      'בוא נקבע לשבוע הבא בעשר בבוקר',
      'אני צריך להזיז את התור',
      'יש לכם תור פנוי מחר?',
      'נתאם שיחה ביום ראשון',
      'Can we schedule a meeting for Tuesday?',
      'When are you available to meet?',
      "Let's set it for next week at ten",
      'I need to reschedule my appointment',
      'Do you have an opening tomorrow?',
      "Let's book a call on Sunday",
    ],
  },
  {
    id: 'legal',
    examples: [
      'אני אפנה לעורך דין',
      'נגיש תביעה אם זה לא ייפתר',
      'לפי החוזה מגיע לי החזר',
      'אני רוצה לבדוק את הסעיף בהסכם',
      'קיבלתי מכתב התראה',
      'זה עניין לבית משפט',
      'I will talk to my lawyer',
      'We are going to file a lawsuit',
      'According to the contract I am entitled to a refund',
      'I want to review the clause in the agreement',
      'I received a legal notice',
      'This will end up in court',
    ],
  },
  {
    id: 'follow_up',
    examples: [
      'אני אחזור אליך עד מחר',
      'תשלח לי את זה במייל ונדבר',
      'נדבר שוב בשבוע הבא',
      'אני אבדוק ואעדכן אותך',
      'תזכיר לי להתקשר אליך ביום חמישי',
      'מחכה לתשובה שלך',
      "I'll get back to you by tomorrow",
      "Send it to me by email and we'll talk",
      "Let's talk again next week",
      "I'll check and let you know",
      'Remind me to call you on Thursday',
      'Waiting for your answer',
    ],
  },
];

export function l2normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const norm = Math.sqrt(sum);
  const out = new Float32Array(v.length);
  if (norm === 0) return out;
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / norm;
  return out;
}

/** Cosine similarity; vectors need not be normalized. Returns 0 for a zero vector. */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new RangeError('Vector dimensions differ');
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export function meanVector(vectors: readonly Float32Array[]): Float32Array {
  if (vectors.length === 0) throw new RangeError('No vectors');
  const dim = vectors[0]!.length;
  const sum = new Float32Array(dim);
  for (const v of vectors) {
    if (v.length !== dim) throw new RangeError('Vector dimensions differ');
    // Normalize each example first so no single example dominates the mean.
    const u = l2normalize(v);
    for (let i = 0; i < dim; i++) sum[i]! += u[i]!;
  }
  return l2normalize(sum);
}

/**
 * Embeds every example in one batch and returns one prototype per intent. Run once per session
 * (and again when the user edits their intents), not per call.
 */
export async function buildIntentPrototypes(
  intents: readonly IntentDefinition[],
  embed: EmbedFn,
): Promise<IntentPrototype[]> {
  const texts = intents.flatMap((i) => i.examples.map((e) => EMBEDDING_PASSAGE_PREFIX + e));
  if (texts.length === 0) return [];
  // Loaded here, not at startup: the sentences are only needed when prototypes are built.
  const { NEUTRAL_EXAMPLES } = await import('./neutral');
  texts.push(...NEUTRAL_EXAMPLES.map((e) => EMBEDDING_PASSAGE_PREFIX + e));
  const vectors = await embed(texts);
  if (vectors.length !== texts.length) throw new RangeError('Embedder returned a different count');
  const neutral = meanVector(vectors.slice(texts.length - NEUTRAL_EXAMPLES.length));
  let offset = 0;
  return intents.map((intent) => {
    const own = vectors.slice(offset, offset + intent.examples.length);
    offset += intent.examples.length;
    const proto: IntentPrototype = { id: intent.id, vector: meanVector(own), neutral };
    if (intent.threshold !== undefined) proto.threshold = intent.threshold;
    return proto;
  });
}

/** Intents whose best chunk beats small talk by the margin for its strictness, best first. */
export function classifyIntents(
  chunkVectors: readonly Float32Array[],
  prototypes: readonly IntentPrototype[],
  opts: { threshold?: number; minSimilarity?: number } = {},
): IntentMatch[] {
  const threshold = opts.threshold ?? DEFAULT_INTENT_THRESHOLD;
  const floor = opts.minSimilarity ?? MIN_INTENT_SIMILARITY;
  const out: IntentMatch[] = [];
  const neutral = prototypes[0]?.neutral;
  const base = neutral ? chunkVectors.map((v) => cosine(v, neutral)) : [];
  for (const p of prototypes) {
    let best = Number.NEGATIVE_INFINITY;
    let ord = -1;
    chunkVectors.forEach((v, i) => {
      const sim = cosine(v, p.vector);
      const s = sim < floor ? Number.NEGATIVE_INFINITY : sim - base[i]!;
      if (s > best) {
        best = s;
        ord = i;
      }
    });
    if (ord >= 0 && best >= intentMargin(p.threshold ?? threshold))
      out.push({ id: p.id, score: best, chunkOrd: ord });
  }
  return out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}

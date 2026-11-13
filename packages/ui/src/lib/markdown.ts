/**
 * A small Markdown subset for LLM answers, parsed to a tree that React renders as elements.
 * Answers are untrusted, so nothing becomes HTML and links stay plain text.
 *
 * Text is passed with citation slots (`slot(i)`) in place of non-text parts, so a citation
 * can sit anywhere inside a heading, list item or bold run.
 */

export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'slot'; index: number }
  | { type: 'break' }
  | { type: 'code'; text: string }
  | { type: 'strong' | 'em' | 'del'; children: MdInline[] };

export type MdBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: MdInline[] }
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'list'; ordered: boolean; start: number; items: MdBlock[][] }
  | { type: 'quote'; children: MdBlock[] }
  | { type: 'code'; text: string }
  | { type: 'rule' };

const SLOT_OPEN = '';
const SLOT_CLOSE = '';

export function slot(index: number): string {
  return `${SLOT_OPEN}${index}${SLOT_CLOSE}`;
}

const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const ITEM = /^( {0,3})(?:([-*+])|(\d{1,9})[.)])(?:\s+(.*)|$)/;

export function parseMarkdown(source: string): MdBlock[] {
  return parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'));
}

function parseBlocks(lines: string[]): MdBlock[] {
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1] ?? '```';
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').trimStart().startsWith(marker)) {
        body.push(lines[i] ?? '');
        i++;
      }
      i++;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const level = (heading[1] ?? '#').length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ type: 'heading', level, children: parseInline(heading[2] ?? '') });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length) {
        const q = QUOTE.exec(lines[i] ?? '');
        if (!q) break;
        body.push(q[1] ?? '');
        i++;
      }
      blocks.push({ type: 'quote', children: parseBlocks(body) });
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      i = parseList(lines, i, blocks);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? '';
      if (
        l.trim() === '' ||
        (para.length > 0 &&
          (FENCE.test(l) || HEADING.test(l) || RULE.test(l) || QUOTE.test(l) || ITEM.test(l)))
      ) {
        break;
      }
      para.push(l.trim());
      i++;
    }
    blocks.push({ type: 'paragraph', children: joinLines(para) });
  }
  return blocks;
}

function parseList(lines: string[], from: number, out: MdBlock[]): number {
  const first = ITEM.exec(lines[from] ?? '');
  const ordered = first?.[3] !== undefined;
  const start = ordered ? Number(first?.[3]) : 1;
  const items: string[][] = [];
  let i = from;
  while (i < lines.length) {
    const l = lines[i] ?? '';
    const m = ITEM.exec(l);
    if (m && (m[3] !== undefined) === ordered && (m[1] ?? '').length < 2) {
      items.push([m[4] ?? '']);
      i++;
      continue;
    }
    if (l.trim() === '') {
      const next = lines[i + 1] ?? '';
      const nm = ITEM.exec(next);
      if (
        (nm && (nm[3] !== undefined) === ordered && (nm[1] ?? '').length < 2) ||
        /^\s{2,}\S/.test(next)
      ) {
        i++;
        continue;
      }
      break;
    }
    if (/^\s{2,}\S/.test(l) || (!m && !FENCE.test(l) && !HEADING.test(l) && !QUOTE.test(l))) {
      items[items.length - 1]?.push(l.replace(/^\s{1,4}/, ''));
      i++;
      continue;
    }
    break;
  }
  out.push({ type: 'list', ordered, start, items: items.map((body) => parseBlocks(body)) });
  return i;
}

function joinLines(lines: string[]): MdInline[] {
  const out: MdInline[] = [];
  lines.forEach((l, n) => {
    if (n > 0) out.push({ type: 'break' });
    out.push(...parseInline(l));
  });
  return out;
}

const INLINE =
  /`([^`\n]+)`|\*\*(?=\S)(.+?)\*\*|__(?=\S)(.+?)__|~~(?=\S)(.+?)~~|\*(?=[^\s*])(.+?)\*|(?<![\p{L}\p{N}])_(?=[^\s_])(.+?)_(?![\p{L}\p{N}])|(\d+)/u;

export function parseInline(text: string): MdInline[] {
  const out: MdInline[] = [];
  let rest = text;
  while (rest !== '') {
    const m = INLINE.exec(rest);
    if (!m) {
      pushText(out, rest);
      break;
    }
    if (m.index > 0) pushText(out, rest.slice(0, m.index));
    const [whole, code, strongA, strongB, del, emA, emB, slotIndex] = m;
    if (code !== undefined) out.push({ type: 'code', text: code });
    else if (strongA !== undefined || strongB !== undefined)
      out.push({ type: 'strong', children: parseInline(strongA ?? strongB ?? '') });
    else if (del !== undefined) out.push({ type: 'del', children: parseInline(del) });
    else if (emA !== undefined || emB !== undefined)
      out.push({ type: 'em', children: parseInline(emA ?? emB ?? '') });
    else out.push({ type: 'slot', index: Number(slotIndex) });
    rest = rest.slice(m.index + whole.length);
  }
  return out;
}

function pushText(out: MdInline[], text: string) {
  const prev = out[out.length - 1];
  if (prev?.type === 'text') prev.text += text;
  else out.push({ type: 'text', text });
}

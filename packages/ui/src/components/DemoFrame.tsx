'use client';

import { useEffect, useRef } from 'react';

export type DemoRow = {
  name: string;
  phone: string;
  /** "Today, 14:32 · 8 min", in the page language. */
  when: string;
  /** The snippet's own direction; Hebrew rows resolve right to left. */
  dir: 'ltr' | 'rtl';
  before: string;
  hit: string;
  after: string;
};

export type DemoQuery = { query: string; rows: DemoRow[] };

export type DemoFrameProps = {
  /** The first query is the static end state (server render, reduced motion, paused). */
  queries: DemoQuery[];
  /** What the demo shows, for screen readers. */
  description: string;
  labels: {
    meaning: string;
    pause: string;
    play: string;
    matched: string;
    /** "decrypted on this device · {ms} ms" */
    decrypted: string;
  };
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const msFor = (i: number) => 31 + i * 7;

function cipher(n: number): string {
  const r = globalThis.crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (const b of r) s += B64[b & 63];
  return s;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids);
  return e;
}

function enc(dir: 'ltr' | 'rtl', length: number, ...plain: (Node | string)[]) {
  const pt = el('span', 'pt', ...plain);
  pt.dir = dir;
  const e = el('span', 'enc', pt, el('span', 'ct', cipher(length)));
  e.dataset.dir = dir;
  return e;
}

/** "decrypted on this device · 31 ms", with the number and unit kept LTR in RTL text. */
function statusParts(template: string, ms: number): [string, string] {
  const [before = '', after = ''] = template.split('{ms}');
  return [before, `${ms}${after}`];
}

function rowNode(r: DemoRow, i: number, labels: DemoFrameProps['labels']): HTMLLIElement {
  const snippet = `${r.before}${r.hit}${r.after}`;
  return el(
    'li',
    'r',
    el('div', 'who', enc(r.dir, 28, r.name), el('bdi', 'num', r.phone)),
    el('div', 'when tab', r.when),
    el(
      'div',
      'snip',
      enc(r.dir, Math.round(snippet.length * 2.4), r.before, el('mark', '', r.hit), r.after),
    ),
    el(
      'div',
      'st',
      el('i'),
      el('span', 'm1', `${labels.matched} ·`),
      el(
        'span',
        'b',
        statusParts(labels.decrypted, msFor(i))[0],
        el('bdi', '', statusParts(labels.decrypted, msFor(i))[1]),
      ),
    ),
  );
}

/**
 * The hero's live encrypted search (docs/design/marketing.md 2.4): the query types itself, the
 * Meaning switch turns on, and three results resolve from ciphertext into the real snippet.
 * The server renders the end state; the loop starts after hydration unless the visitor prefers
 * reduced motion. `data-phase` on the root reports `static`, `typing`, `resolving`, `hold` or
 * `paused`. The ciphertext glyphs are decoration; the diagram below the fold shows real bytes.
 */
export function DemoFrame({ queries, description, labels }: DemoFrameProps) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const demo = root.current;
    if (!demo) return;
    const res = demo.querySelector<HTMLOListElement>('.res')!;
    const qtext = demo.querySelector<HTMLSpanElement>('.qtext')!;
    const mean = demo.querySelector<HTMLSpanElement>('.mean')!;
    const pause = demo.querySelector<HTMLButtonElement>('.pause')!;
    const pauseLabel = pause.querySelector('span')!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timers: number[] = [];
    let scramble = 0;
    let index = 0;
    let paused = false;

    const phase = (p: string) => {
      demo.dataset.phase = p;
    };
    const later = (f: () => void, ms: number) => {
      timers.push(window.setTimeout(f, ms));
    };
    const stop = () => {
      for (const t of timers) window.clearTimeout(t);
      timers = [];
      window.clearInterval(scramble);
    };
    const build = (q: DemoQuery) => {
      res.replaceChildren(...q.rows.map((r, i) => rowNode(r, i, labels)));
    };
    const endState = (q: DemoQuery) => {
      build(q);
      qtext.textContent = q.query;
      mean.classList.add('on');
      for (const r of res.children) r.classList.add('in', 'done');
    };

    const play = () => {
      stop();
      const q = queries[index % queries.length]!;
      build(q);
      qtext.textContent = '';
      mean.classList.remove('on');
      phase('typing');
      let t = 500;
      for (const c of Array.from(q.query)) {
        t += 45 + Math.round(Math.random() * 55);
        later(() => {
          qtext.textContent += c;
        }, t);
      }
      t += 260;
      later(() => mean.classList.add('on'), t);
      const rows = Array.from(res.children);
      rows.forEach((r, i) => {
        later(() => r.classList.add('in'), t + 200 + i * 120);
      });
      t += 650;
      later(() => {
        phase('resolving');
        scramble = window.setInterval(() => {
          for (const c of res.querySelectorAll('.r:not(.done) .ct'))
            c.textContent = cipher(c.textContent?.length ?? 0);
        }, 70);
      }, t);
      rows.forEach((r, i) => {
        later(
          () => {
            r.classList.add('go');
            r.addEventListener('animationend', () => r.classList.add('done'), { once: true });
          },
          t + i * 260,
        );
      });
      t += 1250 + rows.length * 260;
      later(() => {
        window.clearInterval(scramble);
        for (const r of rows) r.classList.add('done');
        phase('hold');
      }, t);
      t += 4800;
      later(() => {
        for (const r of rows) r.classList.remove('in');
      }, t);
      later(() => {
        index++;
        play();
      }, t + 600);
    };

    const start = () => {
      stop();
      if (reduce.matches) {
        pause.hidden = true;
        endState(queries[0]!);
        phase('static');
        return;
      }
      pause.hidden = false;
      if (paused) return;
      // After the page's load, so the loop never competes with the first paint.
      if (document.readyState === 'complete') later(play, 600);
      else window.addEventListener('load', () => later(play, 600), { once: true });
    };
    const toggle = () => {
      paused = !paused;
      pause.setAttribute('aria-pressed', String(paused));
      pauseLabel.textContent = paused ? labels.play : labels.pause;
      if (paused) {
        stop();
        endState(queries[index % queries.length]!);
        phase('paused');
      } else {
        index++;
        play();
      }
    };

    pause.addEventListener('click', toggle);
    reduce.addEventListener('change', start);
    start();
    return () => {
      stop();
      pause.removeEventListener('click', toggle);
      reduce.removeEventListener('change', start);
    };
  }, [queries, labels]);

  const first = queries[0]!;
  return (
    <div ref={root} data-component="DemoFrame" data-phase="static" className="demo">
      <div role="img" aria-label={description}>
        <div className="sbar" aria-hidden>
          <svg
            className="ic"
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <div className="q" dir="auto">
            <span className="qtext">{first.query}</span>
            <span className="caret" />
          </div>
          <span className="mean on">
            <span className="lbl">{labels.meaning}</span>
            <span className="sw" />
          </span>
        </div>
        <ol className="res" aria-hidden>
          {first.rows.map((r, i) => (
            <li key={r.phone} className="r in done">
              <div className="who">
                <span className="enc" data-dir={r.dir}>
                  <span className="pt" dir={r.dir}>
                    {r.name}
                  </span>
                </span>
                <bdi className="num">{r.phone}</bdi>
              </div>
              <div className="when tab">{r.when}</div>
              <div className="snip">
                <span className="enc" data-dir={r.dir}>
                  <span className="pt" dir={r.dir}>
                    {r.before}
                    <mark>{r.hit}</mark>
                    {r.after}
                  </span>
                </span>
              </div>
              <div className="st">
                <i />
                <span className="m1">{labels.matched} ·</span>
                <span className="b">
                  {statusParts(labels.decrypted, msFor(i))[0]}
                  <bdi>{statusParts(labels.decrypted, msFor(i))[1]}</bdi>
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <button type="button" className="pause" aria-pressed="false" hidden>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <rect x="1" y="1" width="3" height="8" fill="currentColor" />
          <rect x="6" y="1" width="3" height="8" fill="currentColor" />
        </svg>
        <span>{labels.pause}</span>
      </button>
    </div>
  );
}

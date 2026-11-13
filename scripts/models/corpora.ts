/**
 * Text samples the keep-set is derived from (see README.md). Each file is pinned by URL, byte
 * range and SHA-256, so the counts are reproducible. The samples are read locally and never
 * redistributed.
 *
 * - Leipzig Corpora Collection (CC BY 4.0): 100K-sentence Wikipedia and news samples per language.
 * - OPUS OpenSubtitles v2018 monolingual: the first 16 MiB of each language's gzip stream,
 *   for conversational, spoken-style text closest to call transcripts.
 */
import { createHash } from 'node:crypto';
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { constants, gunzipSync } from 'node:zlib';

export type Language = 'he' | 'en' | 'ar' | 'ru';
export const LANGUAGES: readonly Language[] = ['he', 'en', 'ar', 'ru'];

export interface Corpus {
  name: string;
  language: Language;
  url: string;
  sha256: string;
  format: 'leipzig' | 'lines-gzip-prefix';
  /** Inclusive byte range requested (gzip prefix only). */
  bytes?: [number, number];
  /** Lines used from the file. */
  lines: number;
}

const LEIPZIG = 'https://downloads.wortschatz-leipzig.de/corpora';
const OPUS = 'https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2018/mono';
const PREFIX: [number, number] = [0, 16 * 1024 * 1024 - 1];

const leipzig = (name: string, language: Language, sha256: string): Corpus => ({
  name,
  language,
  url: `${LEIPZIG}/${name}.tar.gz`,
  sha256,
  format: 'leipzig',
  lines: 100_000,
});

const subtitles = (language: Language, sha256: string): Corpus => ({
  name: `opensubtitles_2018_${language}`,
  language,
  url: `${OPUS}/${language}.txt.gz`,
  sha256,
  format: 'lines-gzip-prefix',
  bytes: PREFIX,
  lines: 200_000,
});

export const CORPORA: readonly Corpus[] = [
  leipzig(
    'heb_wikipedia_2021_100K',
    'he',
    'ceeb63560a31278ba80d1380180c09012e003176dffb5b31ff886d40545706b2',
  ),
  leipzig(
    'heb_news_2020_100K',
    'he',
    '569b8bf4fbb104235d0eae34a42801e36bebd7c1bd00e513e5033d5c2826bf10',
  ),
  subtitles('he', 'b63159e9b7d07b30cb4ee9b24c8c3b9fcfb9a12ae3d7d602545d7a9ff857f788'),
  leipzig(
    'eng_wikipedia_2016_100K',
    'en',
    '04aa301072a612e0368f1a0abe5f6b011ab03df84961c29b80bd126883a5a6f0',
  ),
  leipzig(
    'eng_news_2023_100K',
    'en',
    '8e65ed5b9c96687d293374335c14dfb9db4c150877bcc208a21bcb2f86b43484',
  ),
  subtitles('en', 'ab3fb769662eaf703bd80c0f83bddac176b3d66f01f0914d31c159172ca5185f'),
  leipzig(
    'ara_wikipedia_2021_100K',
    'ar',
    '63248254c627e95409edc26e5be681372f8bdcde58bed33812f21bbf84527902',
  ),
  leipzig(
    'ara_news_2022_100K',
    'ar',
    '96b2fe73d7fd0749ff35c2a93062aac4792b62b487bb6024f9350ae5973e75c2',
  ),
  subtitles('ar', '51be4baf6b2f4dd7b67d998b8bfbdddc9aeabe7001df907be36742854e5569db'),
  leipzig(
    'rus_wikipedia_2021_100K',
    'ru',
    '7a67e6b3c756c19fde530847d6b6cc77c235f1ccd883776fe4c06fd37ba78297',
  ),
  leipzig(
    'rus_news_2023_100K',
    'ru',
    '2c69a5561d86954cd9c582e837a0482611161da16ec2944e5fd856facd3ad040',
  ),
  subtitles('ru', '4a172f003279d0d47260cc75e87d28abb96e668e39f25c037b58d3f38db109c1'),
];

async function download(c: Corpus, target: string): Promise<void> {
  const headers: Record<string, string> = c.bytes
    ? { Range: `bytes=${c.bytes[0]}-${c.bytes[1]}` }
    : {};
  const res = await fetch(c.url, { headers });
  if (!res.ok) throw new Error(`GET ${c.url}: HTTP ${res.status}`);
  const body = new Uint8Array(await res.arrayBuffer());
  const digest = createHash('sha256').update(body).digest('hex');
  if (digest !== c.sha256) throw new Error(`${c.name}: sha256 ${digest}, expected ${c.sha256}`);
  await Bun.write(`${target}.part`, body);
  await rename(`${target}.part`, target);
}

/** The `*-sentences.txt` member of a Leipzig archive: `<id>\t<sentence>` per line. */
function leipzigSentences(gz: Uint8Array): string[] {
  const tar = gunzipSync(gz);
  for (let off = 0; off + 512 <= tar.length; ) {
    const name = tar
      .subarray(off, off + 100)
      .toString('utf8')
      .replace(/\0.*$/s, '');
    const size = Number.parseInt(
      tar
        .subarray(off + 124, off + 136)
        .toString('utf8')
        .trim(),
      8,
    );
    if (!name) break;
    const start = off + 512;
    if (name.endsWith('-sentences.txt')) {
      return tar
        .subarray(start, start + size)
        .toString('utf8')
        .split('\n')
        .map((l) => l.slice(l.indexOf('\t') + 1));
    }
    off = start + Math.ceil(size / 512) * 512;
  }
  throw new Error('no sentences file in archive');
}

function gzipPrefixLines(gz: Uint8Array): string[] {
  const text = gunzipSync(gz, { finishFlush: constants.Z_SYNC_FLUSH }).toString('utf8');
  const lines = text.split('\n');
  lines.pop();
  return lines;
}

/** Downloads (once, into `cacheDir`) and returns a corpus's lines, trimmed and non-empty. */
export async function corpusLines(c: Corpus, cacheDir: string): Promise<string[]> {
  await mkdir(cacheDir, { recursive: true });
  const file = join(cacheDir, `${c.name}.${c.sha256.slice(0, 12)}.gz`);
  if (!(await Bun.file(file).exists())) await download(c, file);
  const gz = new Uint8Array(await Bun.file(file).arrayBuffer());
  const raw = c.format === 'leipzig' ? leipzigSentences(gz) : gzipPrefixLines(gz);
  return raw
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, c.lines);
}

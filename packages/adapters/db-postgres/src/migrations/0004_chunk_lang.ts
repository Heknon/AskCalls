/**
 * 0004: chunk language (translation milestone). Every call is chunked and embedded in its
 * original language and in each translation; the column records which one a chunk came from.
 * Nullable, so rows written before translations (and the release still serving) stay valid.
 */
export const sql = /* sql */ `
ALTER TABLE "CallChunk" ADD COLUMN "lang" text CHECK ("lang" ~ '^[a-z]{2}$');
`;

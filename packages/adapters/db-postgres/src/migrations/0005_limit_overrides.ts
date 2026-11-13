/**
 * 0005: per-account limit overrides (admin accounts screen). A JSON object of `Limits` fields
 * to whole numbers; `{}` uses the instance limits. Numbers only, never content. The default
 * keeps rows written by the release still serving valid.
 */
export const sql = /* sql */ `
ALTER TABLE "User" ADD COLUMN "limitOverrides" jsonb NOT NULL DEFAULT '{}'
  CHECK (jsonb_typeof("limitOverrides") = 'object');
`;

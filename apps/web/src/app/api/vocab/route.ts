import { listVocab, writeVocab } from '@askcalls/api-contract/routes/vocab';
import { appendVocab, compactVocab, listVocab as list } from '@askcalls/domain/use-cases/vocab';
import { route } from '../../../server/http/handler';

export const GET = route(listVocab, ({ ports, actor, query }) =>
  list(ports, actor, query.since ?? 0),
);

export const POST = route(
  writeVocab,
  ({ ports, actor, body }) =>
    body.op === 'append'
      ? appendVocab(ports, actor, body.ct)
      : compactVocab(ports, actor, body.upToSeq, body.ct),
  { maxBodyBytes: 4 * 1024 * 1024 + 1024 },
);

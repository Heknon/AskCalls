import { createCall, listCalls } from '@askcalls/api-contract/routes/calls';
import { createCall as create, listCalls as list } from '@askcalls/domain/use-cases/calls';
import { route } from '../../../server/http/handler';

export const GET = route(listCalls, ({ ports, actor, query }) =>
  list(ports, actor, {
    ...(query.day_from !== undefined && { dayFrom: query.day_from }),
    ...(query.day_to !== undefined && { dayTo: query.day_to }),
    ...(query.tag && { tagToks: query.tag }),
    ...(query.star_tok !== undefined && { starTok: query.star_tok }),
    ...(query.starred !== undefined && { starredOnly: query.starred }),
    ...(query.audio_tok !== undefined && { audioTok: query.audio_tok }),
    ...(query.content_tok !== undefined && { contentTok: query.content_tok }),
    ...(query.cursor !== undefined && { cursor: query.cursor }),
    ...(query.limit !== undefined && { limit: query.limit }),
  }),
);

export const POST = route(createCall, ({ ports, actor, body }) => create(ports, actor, body), {
  maxBodyBytes: 8 * 1024 * 1024,
});

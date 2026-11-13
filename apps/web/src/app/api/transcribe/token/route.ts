import { transcribeToken } from '@askcalls/api-contract/routes/providers';
import { mintTranscriptionToken } from '@askcalls/domain/use-cases/providers';
import { route } from '../../../../server/http/handler';

export const POST = route(
  transcribeToken,
  async ({ ports, actor, body }) => {
    const { token, usage } = await mintTranscriptionToken(ports, actor, body);
    return { ...token, usage };
  },
  { rateLimit: { name: 'transcribe-token', limit: 30, windowMs: 60_000 } },
);

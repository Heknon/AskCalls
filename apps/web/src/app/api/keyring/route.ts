import { addKeyring, listKeyring } from '@askcalls/api-contract/routes/keyring';
import {
  addKeyringEntry,
  listKeyring as listKeyringUseCase,
  putUserKeys,
  registerDevice,
} from '@askcalls/domain/use-cases/keyring';
import { route } from '../../../server/http/handler';

export const GET = route(listKeyring, ({ ports, actor }) => listKeyringUseCase(ports, actor));

export const POST = route(addKeyring, async ({ ports, actor, body }) => {
  switch (body.type) {
    case 'entry': {
      const { type: _t, ...input } = body;
      return { type: 'entry' as const, entry: await addKeyringEntry(ports, actor, input) };
    }
    case 'userKeys': {
      const { type: _t, ...keys } = body;
      await putUserKeys(ports, actor, keys);
      return { type: 'userKeys' as const, keyVersion: keys.keyVersion };
    }
    case 'device': {
      const { type: _t, ...input } = body;
      return { type: 'device' as const, device: await registerDevice(ports, actor, input) };
    }
  }
});

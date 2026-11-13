import { DomainError } from '@askcalls/domain';
import { auditInstanceUpdate, requireAdmin } from '@askcalls/domain/use-cases/admin';
import type { Actor } from '@askcalls/domain/use-cases/context';
import { applyConfig, type Container, getConfigService } from '../container';
import { configProblem, guardPatch, instanceView } from './instance';

function paths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const p = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' && !Array.isArray(v)
      ? paths(v as Record<string, unknown>, p)
      : [p];
  });
}

/** Saves an admin's config change: guards, validates, hot-reloads, audits (paths only). */
export async function applyAdminPatch(
  container: Container,
  actor: Actor,
  patch: Record<string, unknown>,
) {
  await requireAdmin(container.ports, actor);
  const configService = await getConfigService();
  if (configService.get().config.hosted) {
    throw new DomainError('forbidden', 'the hosted instance is configured by its environment');
  }
  const before = await instanceView(container, configService, actor);
  let next: Container;
  try {
    guardPatch(patch, before, configService);
    next = await applyConfig(patch);
  } catch (e) {
    return configProblem(e);
  }
  await auditInstanceUpdate(next.ports, actor, paths(patch));
  return instanceView(next, configService, actor, { freshHealth: true });
}

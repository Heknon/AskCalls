import { describeRowLevelSecurity } from './rls-suite';
import { openTestDatabase } from './test-support';

describeRowLevelSecurity('pglite', () => openTestDatabase({ driver: 'pglite' }));

/**
 * Architecture boundaries (spec 3.1, 3.4).
 * - domain imports nothing but zod.
 * - isomorphic packages run in the browser and Node: no node: builtins, no adapters, no apps.
 * - adapters never import other adapters or apps.
 * - nothing under packages/ imports apps/.
 */
const ISOMORPHIC = '^packages/(crypto|indexing|transcript-formats|client-core|api-contract)/';

module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment: 'packages/domain may only import its own files and zod.',
      from: { path: '^packages/domain/src/' },
      to: { pathNot: ['^packages/domain/', 'node_modules/zod/'] },
    },
    {
      name: 'isomorphic-no-node-builtins',
      severity: 'error',
      comment: 'Isomorphic packages must run unchanged in the browser.',
      from: { path: `${ISOMORPHIC}src/`, pathNot: '\\.test\\.ts$' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'isomorphic-no-adapters',
      severity: 'error',
      from: { path: ISOMORPHIC },
      to: { path: '^packages/adapters/' },
    },
    {
      name: 'adapters-are-independent',
      severity: 'error',
      comment: 'An adapter implements one port; it must not depend on another adapter.',
      from: { path: '^packages/adapters/([^/]+)/', pathNot: '^packages/adapters/mocks/' },
      to: { path: '^packages/adapters/', pathNot: ['^packages/adapters/$1/'] },
    },
    {
      name: 'packages-never-import-apps',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['\\.next/', 'dist/', 'node_modules/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};

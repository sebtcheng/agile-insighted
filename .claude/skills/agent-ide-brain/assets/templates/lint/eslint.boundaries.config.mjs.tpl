import boundaries from 'eslint-plugin-boundaries';

export default [
  {
    files: ['{{backendDir}}/src/**/*.{ts,tsx,js,jsx}'],
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'feature', pattern: '{{backendDir}}/src/features/*/*' },
        { type: 'platform', pattern: '{{backendDir}}/src/platform/*' },
        { type: 'db', pattern: '{{backendDir}}/src/db/*' },
        { type: 'shared', pattern: '{{sharedDir}}/src/*' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            {
              from: 'feature',
              allow: ['platform', 'db', 'shared'],
            },
            {
              from: 'platform',
              allow: ['shared', 'db'],
            },
            {
              from: 'db',
              allow: ['shared'],
            },
          ],
        },
      ],
      'boundaries/entry-point': [
        'error',
        {
          default: 'disallow',
          rules: [
            {
              target: ['feature'],
              allow: 'index.ts',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['{{frontendDir}}/src/**/*.{ts,tsx,js,jsx}'],
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: '{{frontendDir}}/src/app/*' },
        { type: 'pages', pattern: '{{frontendDir}}/src/pages/*/*' },
        { type: 'widgets', pattern: '{{frontendDir}}/src/widgets/*/*' },
        { type: 'features', pattern: '{{frontendDir}}/src/features/*/*' },
        { type: 'entities', pattern: '{{frontendDir}}/src/entities/*/*' },
        { type: 'shared', pattern: '{{frontendDir}}/src/shared/*' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'app', allow: ['pages', 'widgets', 'features', 'entities', 'shared'] },
            { from: 'pages', allow: ['widgets', 'features', 'entities', 'shared'] },
            { from: 'widgets', allow: ['features', 'entities', 'shared'] },
            { from: 'features', allow: ['entities', 'shared'] },
            { from: 'entities', allow: ['shared'] },
            { from: 'shared', allow: [] },
          ],
        },
      ],
      'boundaries/entry-point': [
        'error',
        {
          default: 'disallow',
          rules: [
            {
              target: ['features', 'entities', 'widgets', 'pages'],
              allow: 'index.ts',
            },
          ],
        },
      ],
    },
  },
];

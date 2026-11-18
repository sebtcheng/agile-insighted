{
  "name": "{{repoName}}",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "lint:fast": "oxlint",
    "lint": "oxlint && eslint .",
    "typecheck": "tsc -b",
    "test:unit": "vitest run --reporter=dot",
    "build": "tsc -b"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}

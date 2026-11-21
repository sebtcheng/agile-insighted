// ESLint covers what oxlint can't: type-aware rules and React hooks.
// eslint-plugin-oxlint turns off rules oxlint already runs, so nothing is checked twice.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import oxlint from "eslint-plugin-oxlint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/drizzle/**",
      "**/*.config.cjs",
      "**/playwright-report/**",
      ".claude/**",
      ".agents/**",
      ".agent/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["apps/frontend/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  // ---- Architecture boundaries (see AGENTS.md "Layout"). Import cycles are blocked by oxlint's import/no-cycle.
  {
    // The shared package is pure: zod schemas and types only, no server code, no app code.
    files: ["packages/shared/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@myapp/backend", "@myapp/frontend", "**/apps/**"],
              message: "Shared must not import app code.",
            },
            {
              group: ["express", "drizzle-orm", "drizzle-orm/*", "pg"],
              message: "Shared must stay free of server code.",
            },
          ],
        },
      ],
    },
  },
  {
    // Backend direction: routes -> services -> db. Routes never query the database directly.
    files: ["apps/backend/src/routes/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@myapp/frontend", "**/frontend/**"],
              message: "Backend and frontend share only @myapp/shared.",
            },
            {
              group: ["../db/*", "../db"],
              message: "Routes call services; only services and db/ touch Drizzle.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/backend/src/services/**/*.ts", "apps/backend/src/db/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@myapp/frontend", "**/frontend/**"],
              message: "Backend and frontend share only @myapp/shared.",
            },
            {
              group: ["../routes", "../routes/*"],
              message: "Services and db must not depend on routes.",
            },
          ],
        },
      ],
    },
  },
  {
    // Frontend layers: pages -> components -> api/lib. Lower layers never import higher ones.
    files: [
      "apps/frontend/src/components/**/*.{ts,tsx}",
      "apps/frontend/src/api/**/*.ts",
      "apps/frontend/src/lib/**/*.ts",
    ],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@myapp/backend", "**/backend/**"],
              message: "Backend and frontend share only @myapp/shared.",
            },
            {
              group: ["../pages", "../pages/*"],
              message: "Components, api and lib must not import pages; move shared types down.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/frontend/src/api/**/*.ts", "apps/frontend/src/lib/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@myapp/backend", "**/backend/**"],
              message: "Backend and frontend share only @myapp/shared.",
            },
            {
              group: ["../pages", "../pages/*", "../components", "../components/*"],
              message: "api and lib sit below components and pages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.config.{js,ts}", "tools/dev-diagnostics/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Plain Node scripts (the dev runner and the log digest): give them the Node globals they use.
    files: ["tools/dev-diagnostics/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
      },
    },
  },
  ...oxlint.configs["flat/recommended"], // keep last
);

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

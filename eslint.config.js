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
  { files: ["**/*.config.{js,ts}"], ...tseslint.configs.disableTypeChecked },
  ...oxlint.configs["flat/recommended"], // keep last
);

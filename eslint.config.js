import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-case-declarations": "off",
      "no-useless-assignment": "off",
      "prefer-const": "off",
      "no-useless-escape": "off",
      "@typescript-eslint/only-throw-error": "off",
      "no-control-regex": "off",
      "preserve-caught-error": "off"
    },
  }
);

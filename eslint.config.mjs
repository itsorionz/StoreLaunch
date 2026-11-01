import { defineConfig, globalIgnores } from "eslint/config";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...tseslint.configs.recommended,
  {
    ...react.configs.flat.recommended,
    ...react.configs.flat["jsx-runtime"],
    ...reactHooks.configs.flat.recommended,
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      ...react.configs.flat.recommended.plugins,
      ...reactHooks.configs.flat.recommended.plugins,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs.flat.recommended.rules,
      "react/prop-types": "off",
    },
  },
  globalIgnores([".next/**", ".next-screen-test/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;

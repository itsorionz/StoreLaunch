import { defineConfig, globalIgnores } from "eslint/config";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Layer boundaries for the clean-architecture layout (docs/clean-architecture-plan.md).
// The dependency rule: UI -> application layer (actions/lib) -> ORM. The ORM
// (db, prisma-client, generated client at runtime) must never be imported by UI
// code, and the backend must never reach up into UI or route code.
const ORM_FROM_UI =
  "The ORM belongs to the backend. Import an application-layer query from backend/lib instead.";
const GENERATED_FROM_UI =
  "The generated Prisma client must not be imported by UI code at runtime. Re-export a view type from backend/lib, or use a type-only import if unavoidable.";
const GENERATED_OUTSIDE_LIB =
  "Runtime use of the generated Prisma client is banned outside backend/lib (test harnesses exempt). Import a value re-exported by backend/lib, or use a type-only import.";
const BACKEND_REACHES_UP =
  "backend/lib must not import server actions, UI components, or route code. Dependencies point inward only.";
const BACKEND_REACHES_UI =
  "Backend code must never import UI components or route code. Dependencies point inward only.";

// Import specifiers that reach up/out of the backend layer (R3/R4).
const UI_REACH_PATTERNS = [
  "@frontend/**",
  "frontend/**",
  "../frontend/**",
  "../../frontend/**",
  "**/frontend/**",
  "@/**",
  "../src/**",
  "../../src/**",
  "**/src/**",
];
// Import specifiers that reach the server-action layer (R3, backend/lib only).
const ACTIONS_REACH_PATTERNS = [
  "@backend/actions/**",
  "backend/actions/**",
  "../actions/**",
  "**/actions/**",
];
// Import specifiers into the generated Prisma client (R2, type-only outside lib).
const GENERATED_PATTERNS = ["@backend/generated/**", "backend/generated/**", "**/generated/**"];

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
  // UI layer: storefront/admin/rider components and all route code (pages,
  // layouts, route handlers, middleware). No ORM access here.
  {
    files: ["frontend/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@backend/lib/db",
              message: ORM_FROM_UI,
            },
            {
              name: "@backend/lib/prisma-client",
              message: ORM_FROM_UI,
            },
          ],
          patterns: [
            {
              group: [
                "@backend/generated/**",
                "@backend/prisma/**",
                "backend/generated/**",
                "backend/prisma/**",
              ],
              allowTypeImports: true,
              message: GENERATED_FROM_UI,
            },
            {
              group: ["**/backend/generated/prisma/client", "**/backend/generated/prisma/*"],
              allowTypeImports: true,
              message: GENERATED_FROM_UI,
            },
          ],
        },
      ],
    },
  },
  // R3 + R4 — application/domain layer: backend/lib must not import server
  // actions, UI components, or route code.
  {
    files: ["backend/lib/**/*.{ts,tsx,mjs,js}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ACTIONS_REACH_PATTERNS,
              message: BACKEND_REACHES_UP,
            },
            {
              group: UI_REACH_PATTERNS,
              message: BACKEND_REACHES_UP,
            },
          ],
        },
      ],
    },
  },
  // R4 — test harnesses may construct the ORM client, but still never reach
  // into UI or route code.
  {
    files: ["backend/tests/**/*.{ts,tsx,mjs,js}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: UI_REACH_PATTERNS,
              message: BACKEND_REACHES_UI,
            },
          ],
        },
      ],
    },
  },
  // R2 + R4 — the rest of the backend (actions, scripts, prisma): the
  // generated client is type-only here; no reaching up into UI or src.
  // Runtime generated use lives only in backend/lib (and test harnesses).
  {
    files: ["backend/**/*.{ts,tsx,mjs,js}"],
    ignores: ["backend/lib/**", "backend/tests/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: GENERATED_PATTERNS,
              allowTypeImports: true,
              message: GENERATED_OUTSIDE_LIB,
            },
            {
              group: UI_REACH_PATTERNS,
              message: BACKEND_REACHES_UI,
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", ".next-screen-test/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;

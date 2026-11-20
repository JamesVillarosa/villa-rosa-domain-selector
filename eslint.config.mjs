import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/**",
    ".smoke/**",
    "data/**",
  ]),
  {
    rules: {
      // React 19 introduced a strict warning against setState-in-effect, but the
      // localStorage-hydration and fetch-on-mount patterns we use here are
      // standard and correct (alternatives like useSyncExternalStore add more
      // complexity than they save for a single-user internal tool). Downgrade
      // to a warning so the build still passes.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;

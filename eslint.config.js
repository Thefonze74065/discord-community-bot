const js = require("@eslint/js");

const nodeGlobals = {
  require: "readonly",
  module: "writable",
  exports: "writable",
  __dirname: "readonly",
  __filename: "readonly",
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setImmediate: "readonly",
  clearImmediate: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  fetch: "readonly",
  AbortController: "readonly",
  TextEncoder: "readonly",
  TextDecoder: "readonly",
  structuredClone: "readonly",
};

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "dashboard/public/**",
      "prisma/**",
      "test/**/*.skip.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: nodeGlobals,
    },
    rules: {
      // Existing code has many unused catch bindings and placeholder args;
      // keep these as warnings so the baseline passes without refactoring.
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      // Used intentionally to strip control characters from user input.
      "no-control-regex": "off",
      // Catches `const x` used above its declaration in the same scope (TDZ crash on start); uses inside later-run callbacks are fine.
      "no-use-before-define": [
        "error",
        { functions: false, classes: false, variables: false },
      ],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: nodeGlobals,
    },
  },
];

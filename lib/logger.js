/**
 * Shared logger. Thin wrapper over the console so output stays identical
 * (no added prefix or timestamp), while giving the codebase a single place
 * to change how logging works. Console methods are resolved at call time so
 * they can be stubbed in tests.
 */
const logger = {
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  table: (...args) => console.table(...args),
};

module.exports = logger;

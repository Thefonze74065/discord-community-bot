const logger = require("../lib/logger");
// Shared 500 handling for the dashboard routes.

// Log a caught route error and send the standard 500 JSON response.
function handleRouteError(
  res,
  logMessage,
  error,
  publicMessage = "Internal server error",
) {
  logger.error(logMessage, error);
  res.status(500).json({ error: publicMessage });
}

// Express error-handling middleware; must be registered after all routes.
function globalErrorHandler(err, req, res, next) {
  logger.error("[EXPRESS ERROR]", err.stack || err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({
    error: "Internal server error",
    details:
      process.env.NODE_ENV === "production" ? undefined : err.message || err,
  });
}

module.exports = { handleRouteError, globalErrorHandler };

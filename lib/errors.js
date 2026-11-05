const logger = require("./logger");
/**
 * Standardized error handling utilities
 */

/**
 * Log an error with consistent formatting
 * @param {string} context - Context where the error occurred (e.g., "ban command", "voice state update")
 * @param {Error} error - The error object
 * @param {Object} metadata - Optional additional context
 */
function logError(context, error, metadata = {}) {
  const timestamp = new Date().toISOString();
  const errorMessage = error?.message || String(error);
  const errorStack = error?.stack || "";

  logger.error(`[ERROR] ${timestamp} | ${context}`);
  logger.error(`Message: ${errorMessage}`);

  if (Object.keys(metadata).length > 0) {
    logger.error(`Context:`, metadata);
  }

  if (errorStack) {
    logger.error(`Stack: ${errorStack}`);
  }
}

/**
 * Handle command execution errors with user feedback
 * @param {import("discord.js").CommandInteraction} interaction
 * @param {Error} error
 * @param {string} userMessage - Message to show the user
 * @param {string} logContext - Context for logging
 */
async function handleCommandError(interaction, error, userMessage, logContext) {
  logError(logContext, error, {
    command: interaction.commandName,
    guildId: interaction.guild?.id,
    userId: interaction.user.id,
  });

  const replyOptions = {
    content: `❌ ${userMessage}`,
    ephemeral: true,
  };

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyOptions);
    } else {
      await interaction.reply(replyOptions);
    }
  } catch (replyError) {
    logError("Failed to send error message to user", replyError);
  }
}

/**
 * Handle event errors (no user interaction to respond to)
 * @param {string} eventName
 * @param {Error} error
 * @param {Object} metadata
 */
function handleEventError(eventName, error, metadata = {}) {
  logError(`Event: ${eventName}`, error, metadata);
}

/**
 * Safe async wrapper that catches and logs errors
 * @param {Function} fn - Async function to wrap
 * @param {string} context - Error context
 * @returns {Function} Wrapped function
 */
function wrapAsync(fn, context) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(context, error);
      throw error;
    }
  };
}

/**
 * Safe promise wrapper that won't throw
 * @param {Promise} promise
 * @param {any} defaultValue - Value to return on error
 * @returns {Promise} Promise that resolves to [error, result]
 */
async function safePromise(promise, defaultValue = null) {
  try {
    const result = await promise;
    return [null, result];
  } catch (error) {
    return [error, defaultValue];
  }
}

module.exports = {
  logError,
  handleCommandError,
  handleEventError,
  wrapAsync,
  safePromise,
};

const logger = require("./logger");

function createExecute(deferOptions, handler) {
  return async function execute(interaction) {
    if (deferOptions !== null) {
      await interaction.deferReply(deferOptions);
    }
    return handler(interaction);
  };
}

async function guard(interaction, { logMessage, errorReply }, fn) {
  try {
    return await fn();
  } catch (error) {
    logger.error(logMessage, error);
    const payload =
      typeof errorReply === "function" ? errorReply(error) : errorReply;
    if (payload) {
      return interaction.editReply(payload);
    }
  }
}

module.exports = { createExecute, guard };

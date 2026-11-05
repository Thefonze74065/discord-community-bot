const logger = require("../lib/logger");
// Helper function to reload scheduler reminders
function reloadSchedulerReminders(botClient) {
  if (botClient) {
    try {
      const { reloadCustomReminders } = require("../lib/scheduler");
      if (typeof reloadCustomReminders === "function") {
        reloadCustomReminders(botClient);
        logger.info("[DASHBOARD] Reloaded custom reminders in scheduler");
      }
    } catch (error) {
      logger.error("[DASHBOARD] Failed to reload reminders:", error.message);
    }
  }
}

module.exports = { reloadSchedulerReminders };

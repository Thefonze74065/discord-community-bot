const { SlashCommandBuilder } = require("discord.js");
const { flushAllXp } = require("../lib/leveling");
const { refundOpenBets } = require("../lib/economy");
const db = require("../lib/database");
const { stopVoiceTracking } = require("../events/voiceStateUpdate");
const { leaveAllChannels } = require("../lib/tts");
const { hasStaffAccess } = require("../lib/permissions");
const logger = require("../lib/logger");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shutdown")
    .setDescription("Gracefully shuts down the bot (Admin only)")
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildConfig = getGuildStmt.get(interaction.guild.id);
    const hasPermission = hasStaffAccess(interaction.member, guildConfig, { roles: ["admin"] });
    if (!hasPermission) {
      return interaction.editReply({ content: "You do not have permission to use this command.", ephemeral: true });
    }

    await interaction.editReply({ content: "🛑 **Shutdown Initiated!**\nSaving data and stopping process...", ephemeral: true });

    await flushAllXp();
    logger.info("[SHUTDOWN] XP Flushed.");

    await refundOpenBets();

    leaveAllChannels();

    if (stopVoiceTracking) await stopVoiceTracking();

    db.close();

    logger.info("[SHUTDOWN] Exiting process...");
    await interaction.followUp({ content: "✅ **Shutdown Complete!**\nBot is stopping.", ephemeral: true });
    process.exit(0);
  },
};

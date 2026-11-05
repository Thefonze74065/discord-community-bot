const { createExecute } = require("../lib/commandWrapper");
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const db = require("../lib/database");
const { hasStaffAccess } = require("../lib/permissions");
const logger = require("../lib/logger");
const { withTimeout } = require("../lib/timers");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong and shows bot latency!")
    .setDMPermission(false),
  execute: createExecute(
    { flags: MessageFlags.Ephemeral },
    async (interaction) => {
      const guildId = interaction.guild.id;
      let guildConfig = null;

      try {
        guildConfig = await withTimeout(getGuildStmt.get(guildId), 2000, () => {
          throw new Error("DB Timeout");
        });
      } catch (error) {
        logger.error("[ERROR] DB Error in ping:", error);
      }

      const hasPermission = hasStaffAccess(interaction.member, guildConfig);
      if (!hasPermission) {
        return interaction.editReply({ content: "You do not have permission to use this command." });
      }

      const latency = Date.now() - interaction.createdTimestamp;
      const apiLatency = Math.round(interaction.client.ws.ping);
      const apiLatencyDisplay = apiLatency < 0 ? "N/A" : `${apiLatency}ms`;

      await interaction.editReply({
        content: `🏓 Pong!\nLatency: ${latency}ms\nAPI Latency: ${apiLatencyDisplay}`,
      });
    },
  ),
};

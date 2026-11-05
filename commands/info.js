const { createExecute } = require("../lib/commandWrapper");
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const db = require("../lib/database");
const { hasStaffAccess } = require("../lib/permissions");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("Displays information about the bot")
    .setDMPermission(false),
  execute: createExecute(
    { flags: MessageFlags.Ephemeral },
    async (interaction) => {
      if (!interaction.guild) {
        return interaction.editReply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
      }

      const guildConfig = getGuildStmt.get(interaction.guild.id);
      const hasPermission = hasStaffAccess(interaction.member, guildConfig);

      if (!hasPermission) {
        return interaction.editReply({ content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral });
      }

      const uptime = process.uptime();
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor(uptime / 3600) % 24;
      const minutes = Math.floor(uptime / 60) % 60;
      const seconds = Math.floor(uptime % 60);
      const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

      await interaction.editReply({
        content: `**Bot Information**\nBot Name: ${interaction.client.user.tag}\nServers: ${interaction.client.guilds.cache.size}\nUptime: ${uptimeString}\nDiscord.js Version: ${require("discord.js").version}`,
        flags: MessageFlags.Ephemeral,
      });
    },
  ),
};

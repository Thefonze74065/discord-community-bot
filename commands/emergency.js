const { createExecute, guard } = require("../lib/commandWrapper");
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../lib/database");

const upsertGuildStmt = db.prepare(
  `INSERT INTO guilds (id, created_at, updated_at) VALUES (@id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
   ON CONFLICT(id) DO NOTHING`,
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("emergency")
    .setDescription("Emergency controls to disable/enable bot modules.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Disable a specific module")
        .addStringOption((option) =>
          option
            .setName("module")
            .setDescription("The module to disable")
            .setRequired(true)
            .addChoices(
              { name: "Leveling System", value: "leveling" },
              { name: "Temp Voice Channels", value: "tempvc" },
              { name: "Reminders", value: "reminders" },
              { name: "Logging", value: "logging" },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("enable")
        .setDescription("Enable a specific module")
        .addStringOption((option) =>
          option
            .setName("module")
            .setDescription("The module to enable")
            .setRequired(true)
            .addChoices(
              { name: "Leveling System", value: "leveling" },
              { name: "Temp Voice Channels", value: "tempvc" },
              { name: "Reminders", value: "reminders" },
              { name: "Logging", value: "logging" },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("Check the status of all modules"),
    ),
  execute: createExecute({ ephemeral: true }, async (interaction) => {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    upsertGuildStmt.run({ id: guildId });
    const guildConfig = db.prepare("SELECT * FROM guilds WHERE id = ?").get(guildId);

    if (subcommand === "status") {
      const statusMessage = [
        "**🚨 System Module Status**",
        `• **Leveling System:** ${guildConfig.module_leveling_enabled ? "✅ Enabled" : "❌ DISABLED"}`,
        `• **Temp Voice Channels:** ${guildConfig.module_temp_vc_enabled ? "✅ Enabled" : "❌ DISABLED"}`,
        `• **Reminders:** ${guildConfig.module_reminders_enabled ? "✅ Enabled" : "❌ DISABLED"}`,
        `• **Logging:** ${guildConfig.module_logging_enabled ? "✅ Enabled" : "❌ DISABLED"}`,
      ].join("\n");
      return interaction.editReply({ content: statusMessage });
    }

    const module = interaction.options.getString("module");
    const isEnable = subcommand === "enable";
    const columnMap = {
      leveling: "module_leveling_enabled",
      tempvc: "module_temp_vc_enabled",
      reminders: "module_reminders_enabled",
      logging: "module_logging_enabled",
    };
    const column = columnMap[module];

    await guard(
      interaction,
      {
        logMessage: "Error updating module status:",
        errorReply: { content: "Failed to update module status. Please check the logs.", ephemeral: true },
      },
      async () => {
        db.prepare(`UPDATE guilds SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(isEnable ? 1 : 0, guildId);

        const action = isEnable ? "enabled" : "disabled";
        const emoji = isEnable ? "✅" : "❌";
        await interaction.editReply({ content: `${emoji} **${module.toUpperCase()}** module has been **${action}** for this server.`, ephemeral: true });
      },
    );
  }),
};

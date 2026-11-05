const { createExecute } = require("../lib/commandWrapper");
const { SlashCommandBuilder } = require("discord.js");
const db = require("../lib/database");
const { handleLevelUp, setXp } = require("../lib/leveling");
const { hasStaffAccess } = require("../lib/permissions");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");
const getUserLevelStmt = db.prepare("SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setxp")
    .setDescription("Set a user's XP amount")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName("user").setDescription("The user to modify").setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("The new XP amount").setRequired(true).setMinValue(0),
    ),
  execute: createExecute({ ephemeral: true }, async (interaction) => {
    const targetUser = interaction.options.getUser("user");
    const xpAmount = interaction.options.getInteger("amount");
    const guildId = interaction.guild.id;

    const guildConfig = getGuildStmt.get(guildId);
    const hasPermission = hasStaffAccess(interaction.member, guildConfig, { administrator: false, roles: ["admin"] });
    if (!hasPermission) {
      return interaction.editReply({ content: "You do not have permission to use this command.", ephemeral: true });
    }

    const currentUserLevel = getUserLevelStmt.get(targetUser.id, guildId);
    const oldLevel = currentUserLevel ? currentUserLevel.level : 0;

    const { newLevel } = setXp(targetUser.id, guildId, xpAmount);

    await interaction.editReply({ content: `Successfully set XP for ${targetUser} to ${xpAmount} (Level ${newLevel}).`, ephemeral: true });

    if (newLevel > oldLevel) {
      const member = await interaction.guild.members.fetch(targetUser.id);
      if (member) await handleLevelUp(member, newLevel, guildId);
    }
  }),
};

const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags,
} = require("discord.js");
const db = require("../lib/database");
const { canModerate, hasStaffAccess } = require("../lib/permissions");
const { logModeratorAction } = require("../lib/modActions");
const { sendLog } = require("../lib/logging");
const logger = require("../lib/logger");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");
const createWarningStmt = db.prepare(
  "INSERT INTO warnings (guild_id, user_id, moderator_id, reason, created_at) VALUES (@guild_id, @user_id, @moderator_id, @reason, CURRENT_TIMESTAMP)",
);
const getWarningsStmt = db.prepare(
  "SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC",
);
const getWarningStmt = db.prepare("SELECT * FROM warnings WHERE id = ?");
const deleteWarningStmt = db.prepare("DELETE FROM warnings WHERE id = ?");
const deleteWarningsStmt = db.prepare("DELETE FROM warnings WHERE guild_id = ? AND user_id = ?");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Manage user warnings")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Issue a warning to a user")
        .addUserOption((option) => option.setName("target").setDescription("The user to warn").setRequired(true))
        .addStringOption((option) => option.setName("reason").setDescription("The reason for the warning").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List warnings for a user")
        .addUserOption((option) => option.setName("target").setDescription("The user").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a specific warning")
        .addStringOption((option) => option.setName("id").setDescription("The warning ID").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear")
        .setDescription("Clear all warnings for a user")
        .addUserOption((option) => option.setName("target").setDescription("The user").setRequired(true)),
    ),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildConfig = getGuildStmt.get(interaction.guild.id);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const targetUser = interaction.options.getUser("target");
      const reason = interaction.options.getString("reason");

      const hasPermission = hasStaffAccess(interaction.member, guildConfig, { permission: PermissionFlagsBits.ModerateMembers });
      if (!hasPermission) {
        return interaction.editReply({ content: "You do not have permission to use this command." });
      }

      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (targetMember && !canModerate(interaction.member, targetMember, guildConfig)) {
        return interaction.editReply({ content: "You cannot warn this user because they have a higher or equal rank to you." });
      }

      try {
        createWarningStmt.run({
          guild_id: interaction.guild.id, user_id: targetUser.id,
          moderator_id: interaction.user.id, reason,
        });

        await logModeratorAction({
          guildId: interaction.guild.id, moderatorId: interaction.user.id, action: "warn",
          targetId: targetUser.id, targetTag: targetUser.tag, reason,
        });

        let dmSent = false;
        try {
          const dmEmbed = new EmbedBuilder()
            .setTitle(`You have been warned in ${interaction.guild.name}`)
            .setColor("#FFA500")
            .addFields({ name: "Reason", value: reason }, { name: "Moderator", value: interaction.user.tag })
            .setTimestamp();
          await targetUser.send({ embeds: [dmEmbed] });
          dmSent = true;
        } catch (err) {
          // DM failed, continue
        }

        await interaction.editReply({ content: `✅ Warned **${targetUser.tag}**.\nReason: ${reason}\n(DM Sent: ${dmSent ? "Yes" : "No"})` });

        const embed = new EmbedBuilder()
          .setTitle("⚠️ User Warned")
          .setColor("#FFA500")
          .setDescription(`${targetUser} has been issued a warning.`)
          .addFields(
            { name: "User", value: `${targetUser.tag}\n<@${targetUser.id}>`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag}\n<@${interaction.user.id}>`, inline: true },
            { name: "\u200b", value: "\u200b", inline: true },
            { name: "User ID", value: targetUser.id, inline: true },
            { name: "Moderator ID", value: interaction.user.id, inline: true },
            { name: "Reason", value: reason, inline: false },
            { name: "DM Sent", value: dmSent ? "✅ Yes" : "❌ No", inline: true },
          )
          .setThumbnail(targetUser.displayAvatarURL())
          .setFooter({ text: `Action by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
          .setTimestamp();

        await sendLog(interaction.guild, "moderation", embed, [], interaction.channelId);
      } catch (error) {
        logger.error("Error warning user:", error);
        return interaction.editReply({ content: "Failed to warn the user. An error occurred.", ephemeral: true });
      }
    } else if (subcommand === "list") {
      const targetUser = interaction.options.getUser("target");

      const hasPermission = hasStaffAccess(interaction.member, guildConfig, { permission: PermissionFlagsBits.ModerateMembers });
      if (!hasPermission) {
        return interaction.editReply({ content: "You do not have permission to use this command.", ephemeral: true });
      }

      try {
        const warnings = getWarningsStmt.all(interaction.guild.id, targetUser.id);
        if (warnings.length === 0) {
          return interaction.editReply({ content: `No warnings found for **${targetUser.tag}**.`, ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle(`Warnings for ${targetUser.tag}`)
          .setColor("#FFA500")
          .setTimestamp();

        const recentWarnings = warnings.slice(0, 10);
        for (const warn of recentWarnings) {
          const moderator = await interaction.guild.members.fetch(warn.moderator_id).then((m) => m.user.tag).catch(() => "Unknown Mod");
          const date = new Date(warn.created_at).toLocaleDateString();
          embed.addFields({ name: `ID: ${warn.id} | ${date} | Mod: ${moderator}`, value: warn.reason.substring(0, 1024) });
        }

        if (warnings.length > 10) {
          embed.setFooter({ text: `Showing 10 of ${warnings.length} warnings.` });
        }

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error("Error listing warnings:", error);
        await interaction.editReply({ content: "Failed to list warnings.", ephemeral: true });
      }
    } else if (subcommand === "delete") {
      const isAdmin = hasStaffAccess(interaction.member, guildConfig, { roles: ["admin"] });
      if (!isAdmin) {
        return interaction.editReply({ content: "You do not have permission to delete warnings. Admin access required.", ephemeral: true });
      }

      const warningId = interaction.options.getString("id");
      try {
        const warning = getWarningStmt.get(warningId);
        if (!warning || warning.guild_id !== interaction.guild.id) {
          return interaction.editReply({ content: "Warning not found.", ephemeral: true });
        }

        deleteWarningStmt.run(warningId);
        await interaction.editReply({ content: `✅ Warning \`${warningId}\` removed.`, ephemeral: true });

        const targetUser = await interaction.client.users.fetch(warning.user_id).catch(() => ({ tag: "Unknown", id: warning.user_id }));

        const embed = new EmbedBuilder()
          .setTitle("Warning Removed")
          .setColor("#00FF00")
          .addFields(
            { name: "User", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
            { name: "Warning ID", value: warningId, inline: true },
            { name: "Original Reason", value: warning.reason },
          )
          .setTimestamp();
        await sendLog(interaction.guild, "moderation", embed, [], interaction.channelId);
      } catch (error) {
        logger.error("Error removing warning:", error);
        await interaction.editReply({ content: "Failed to remove warning.", ephemeral: true });
      }
    } else if (subcommand === "clear") {
      const isAdmin = hasStaffAccess(interaction.member, guildConfig, { roles: ["admin"] });
      if (!isAdmin) {
        return interaction.editReply({ content: "You do not have permission to clear warnings. Admin access required.", ephemeral: true });
      }

      const targetUser = interaction.options.getUser("target");
      try {
        const result = deleteWarningsStmt.run(interaction.guild.id, targetUser.id);
        await interaction.editReply({ content: `✅ Cleared ${result.changes} warnings for **${targetUser.tag}**.`, ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle("Warnings Cleared")
          .setColor("#00FF00")
          .addFields(
            { name: "User", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
            { name: "Count", value: `${result.changes} warnings deleted` },
          )
          .setTimestamp();
        await sendLog(interaction.guild, "moderation", embed, [], interaction.channelId);
      } catch (error) {
        logger.error("Error clearing warnings:", error);
        await interaction.editReply({ content: "Failed to clear warnings.", ephemeral: true });
      }
    }
  },
};

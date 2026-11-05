const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags,
} = require("discord.js");
const { createExecute, guard } = require("../lib/commandWrapper");
const db = require("../lib/database");
const { canModerate, hasStaffAccess } = require("../lib/permissions");
const { logModeratorAction } = require("../lib/modActions");
const { sendLog } = require("../lib/logging");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");

function parseDuration(input) {
  const regex = /(\d+)\s*(s|sec|second|m|min|minute|h|hour|d|day)s?/gi;
  let totalMs = 0;
  let match;
  while ((match = regex.exec(input)) !== null) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith("s")) totalMs += value * 1000;
    else if (unit.startsWith("m")) totalMs += value * 60 * 1000;
    else if (unit.startsWith("h")) totalMs += value * 60 * 60 * 1000;
    else if (unit.startsWith("d")) totalMs += value * 24 * 60 * 60 * 1000;
  }
  return totalMs;
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const parts = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
  if (hours % 24 > 0) parts.push(`${hours % 24} hour${hours % 24 !== 1 ? "s" : ""}`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60} minute${minutes % 60 !== 1 ? "s" : ""}`);
  if (seconds % 60 > 0 && parts.length === 0) parts.push(`${seconds % 60} second${seconds % 60 !== 1 ? "s" : ""}`);
  return parts.length > 0 ? parts.join(", ") : "0 seconds";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a user")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName("target").setDescription("The user to timeout").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration (e.g., 30s, 15m, 2h, 1d, or combinations like 1h30m)")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("The reason for the timeout").setRequired(false),
    ),
  execute: createExecute(
    { flags: MessageFlags.Ephemeral },
    async (interaction) => {
      const targetUser = interaction.options.getUser("target");
      const durationInput = interaction.options.getString("duration");
      const reason = interaction.options.getString("reason") || "No reason provided";

      const duration = parseDuration(durationInput);
      if (!duration || duration < 1000) {
        return interaction.editReply({
          content: "Invalid duration format. Use formats like: `30s`, `15m`, `2h`, `1d`, or combinations like `1h30m`.\nMinimum: 1 second.",
        });
      }

      const maxDuration = 28 * 24 * 60 * 60 * 1000;
      if (duration > maxDuration) {
        return interaction.editReply({ content: "Duration cannot exceed 28 days (Discord limitation)." });
      }

      const guildConfig = getGuildStmt.get(interaction.guild.id);
      const hasPermission = hasStaffAccess(interaction.member, guildConfig, { permission: PermissionFlagsBits.ModerateMembers });
      if (!hasPermission) {
        return interaction.editReply({ content: "You do not have permission to use this command." });
      }

      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) {
        return interaction.editReply({ content: "Could not find that user in this server." });
      }

      if (!canModerate(interaction.member, targetMember, guildConfig)) {
        return interaction.editReply({ content: "You cannot timeout this user because they have a higher or equal rank to you." });
      }

      if (!targetMember.moderatable) {
        return interaction.editReply({ content: "I cannot timeout this user. They might have a higher role than me." });
      }

      await guard(
        interaction,
        {
          logMessage: "Error timing out user:",
          errorReply: { content: "Failed to timeout the user. An error occurred." },
        },
        async () => {
          await targetMember.timeout(duration, `${reason} (Timed out by ${interaction.user.tag})`);
          const durationText = formatDuration(duration);

          await logModeratorAction({
            guildId: interaction.guild.id, moderatorId: interaction.user.id, action: "timeout",
            targetId: targetUser.id, targetTag: targetUser.tag, reason,
            details: { durationMs: duration, durationText },
          });

          await interaction.editReply({ content: `✅ Successfully timed out **${targetUser.tag}** for **${durationText}**.\nReason: ${reason}` });

          const embed = new EmbedBuilder()
            .setTitle("⏰ User Timed Out")
            .setColor("#FFFF00")
            .setDescription(`${targetUser} has been timed out.`)
            .addFields(
              { name: "User", value: `${targetUser.tag}\n<@${targetUser.id}>`, inline: true },
              { name: "Moderator", value: `${interaction.user.tag}\n<@${interaction.user.id}>`, inline: true },
              { name: "Duration", value: durationText, inline: true },
              { name: "User ID", value: targetUser.id, inline: true },
              { name: "Moderator ID", value: interaction.user.id, inline: true },
              { name: "\u200b", value: "\u200b", inline: true },
              { name: "Reason", value: reason, inline: false },
            )
            .setThumbnail(targetUser.displayAvatarURL())
            .setFooter({ text: `Action by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

          await sendLog(interaction.guild, "moderation", embed, [], interaction.channelId);
        },
      );
    },
  ),
};

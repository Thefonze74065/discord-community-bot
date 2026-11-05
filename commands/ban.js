const {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
} = require("discord.js");
const { createExecute, guard } = require("../lib/commandWrapper");
const db = require("../lib/database");
const { canModerate, hasStaffAccess } = require("../lib/permissions");
const { logModeratorAction } = require("../lib/modActions");
const { sendLog } = require("../lib/logging");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName("target").setDescription("The user to ban (in server)").setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("user_id").setDescription("The user ID to ban (if not in server)").setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("The reason for the ban").setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName("delete_messages")
        .setDescription("How much message history to delete")
        .setRequired(false)
        .addChoices(
          { name: "Don't Delete", value: 0 },
          { name: "Previous Hour", value: 3600 },
          { name: "Previous 6 Hours", value: 21600 },
          { name: "Previous 12 Hours", value: 43200 },
          { name: "Previous 24 Hours", value: 86400 },
          { name: "Previous 3 Days", value: 259200 },
          { name: "Previous 7 Days", value: 604800 },
        ),
    ),
  execute: createExecute(
    { flags: MessageFlags.Ephemeral },
    async (interaction) => {
      const targetUser = interaction.options.getUser("target");
      const targetId = interaction.options.getString("user_id");
      const reason = interaction.options.getString("reason") || "No reason provided";
      const deleteSeconds = interaction.options.getInteger("delete_messages") || 0;

      if (!targetUser && !targetId) {
        return interaction.editReply({ content: "You must provide either a target user or a user ID." });
      }

      let banTarget = targetUser;
      let banTargetTag = targetUser ? targetUser.tag : targetId;
      let banTargetId = targetUser ? targetUser.id : targetId;

      if (!banTarget && targetId) {
        try {
          banTarget = await interaction.client.users.fetch(targetId);
          banTargetTag = banTarget.tag;
          banTargetId = banTarget.id;
        } catch (e) {
          banTarget = targetId;
        }
      }

      const guildConfig = getGuildStmt.get(interaction.guild.id);
      const hasPermission = hasStaffAccess(interaction.member, guildConfig, { administrator: false, roles: ["admin"] });
      if (!hasPermission) {
        return interaction.editReply({ content: "You do not have permission to use this command. Admin access required." });
      }

      const targetMember = await interaction.guild.members.fetch(banTargetId).catch(() => null);
      if (targetMember) {
        if (!canModerate(interaction.member, targetMember, guildConfig)) {
          return interaction.editReply({ content: "You cannot ban this user because they have a higher or equal rank to you." });
        }
        if (!targetMember.bannable) {
          return interaction.editReply({ content: "I cannot ban this user. They might have a higher role than me." });
        }
      }

      await guard(
        interaction,
        {
          logMessage: "Error banning user:",
          errorReply: { content: "Failed to ban the user. Please check my permissions." },
        },
        async () => {
          await interaction.guild.members.ban(banTarget, {
            reason: `${reason} (Banned by ${interaction.user.tag})`,
            deleteMessageSeconds: deleteSeconds,
          });

          await logModeratorAction({
            guildId: interaction.guild.id, moderatorId: interaction.user.id, action: "ban",
            targetId: banTargetId, targetTag: banTargetTag, reason,
            details: { deleteMessageSeconds: deleteSeconds },
          });

          await interaction.editReply({
            content: `✅ Successfully banned **${banTargetTag}**.\nReason: ${reason}\nDeleted History: ${deleteSeconds} seconds`,
          });

          const deleteMap = { 0: "None", 3600: "1 Hour", 21600: "6 Hours", 43200: "12 Hours", 86400: "1 Day", 259200: "3 Days", 604800: "7 Days" };
          const deleteText = deleteMap[deleteSeconds] || `${deleteSeconds} seconds`;

          const embed = new EmbedBuilder()
            .setTitle("🔨 User Banned")
            .setColor("#8B0000")
            .setDescription(`${banTargetTag} has been banned from the server.`)
            .addFields(
              { name: "User", value: banTarget && banTarget.tag ? `${banTarget.tag}\n<@${banTargetId}>` : `User ID: ${banTargetId}`, inline: true },
              { name: "Moderator", value: `${interaction.user.tag}\n<@${interaction.user.id}>`, inline: true },
              { name: "\u200b", value: "\u200b", inline: true },
              { name: "User ID", value: banTargetId, inline: true },
              { name: "Moderator ID", value: interaction.user.id, inline: true },
              { name: "Messages Deleted", value: deleteText, inline: true },
              { name: "Reason", value: reason, inline: false },
            )
            .setFooter({ text: `Action by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

          if (banTarget && banTarget.displayAvatarURL) embed.setThumbnail(banTarget.displayAvatarURL());

          await sendLog(interaction.guild, "moderation", embed, [], interaction.channelId);
        },
      );
    },
  ),
};

const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags,
} = require("discord.js");
const { createExecute, guard } = require("../lib/commandWrapper");
const db = require("../lib/database");
const { canModerate, hasStaffAccess } = require("../lib/permissions");
const { logModeratorAction } = require("../lib/modActions");
const { sendLog } = require("../lib/logging");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Unmute a user by removing the configured Mute role")
    .setDMPermission(false)
    .addUserOption((option) => option.setName("target").setDescription("The user to unmute").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("The reason for the unmute").setRequired(false)),
  execute: createExecute(
    { flags: MessageFlags.Ephemeral },
    async (interaction) => {
      const targetUser = interaction.options.getUser("target");
      const reason = interaction.options.getString("reason") || "No reason provided";

      const guildConfig = getGuildStmt.get(interaction.guild.id);
      if (!guildConfig || (!guildConfig.mute_role_id && !guildConfig.new_account_guard_mute_role_id)) {
        return interaction.editReply({
          content: "Neither the Mute Role nor the New Account Guard Mute Role is configured for this server. Please ask an admin to set one up in the dashboard.",
        });
      }

      const hasPermission = hasStaffAccess(interaction.member, guildConfig, { permission: PermissionFlagsBits.ModerateMembers });
      if (!hasPermission) {
        return interaction.editReply({ content: "You do not have permission to use this command." });
      }

      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) {
        return interaction.editReply({ content: "Could not find that user in this server." });
      }

      if (!canModerate(interaction.member, targetMember, guildConfig)) {
        return interaction.editReply({ content: "You cannot unmute this user because they have a higher or equal rank to you." });
      }

      const muteRoleIds = [...new Set([guildConfig.mute_role_id, guildConfig.new_account_guard_mute_role_id].filter(Boolean))];
      const appliedMuteRoleIds = muteRoleIds.filter((roleId) => targetMember.roles.cache.has(roleId));

      if (appliedMuteRoleIds.length === 0) {
        return interaction.editReply({ content: "This user is not muted." });
      }

      await guard(
        interaction,
        {
          logMessage: "Error unmuting user:",
          errorReply: { content: "Failed to unmute the user. Please check my role hierarchy and permissions." },
        },
        async () => {
          await targetMember.roles.remove(appliedMuteRoleIds, `${reason} (Unmuted by ${interaction.user.tag})`);

          await logModeratorAction({
            guildId: interaction.guild.id, moderatorId: interaction.user.id, action: "unmute",
            targetId: targetUser.id, targetTag: targetUser.tag, reason,
          });

          await interaction.editReply({ content: `✅ Successfully unmuted **${targetUser.tag}**.\nReason: ${reason}` });

          const embed = new EmbedBuilder()
            .setTitle("🔊 User Unmuted")
            .setColor("#00FF00")
            .setDescription(`${targetUser} has been unmuted.`)
            .addFields(
              { name: "User", value: `${targetUser.tag}\n<@${targetUser.id}>`, inline: true },
              { name: "Moderator", value: `${interaction.user.tag}\n<@${interaction.user.id}>`, inline: true },
              { name: "\u200b", value: "\u200b", inline: true },
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

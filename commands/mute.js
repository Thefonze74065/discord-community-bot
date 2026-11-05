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
    .setName("mute")
    .setDescription("Mute a user by assigning the configured Mute role")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("target").setDescription("The user to mute").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("The reason for the mute").setRequired(false)),
  execute: createExecute(
    { flags: MessageFlags.Ephemeral },
    async (interaction) => {
      const targetUser = interaction.options.getUser("target");
      const reason = interaction.options.getString("reason") || "No reason provided";

      const guildConfig = getGuildStmt.get(interaction.guild.id);
      if (!guildConfig || !guildConfig.mute_role_id) {
        return interaction.editReply({
          content: "The Mute Role is not configured for this server. Please ask an admin to set it up in the dashboard.",
        });
      }

      const hasPermission = hasStaffAccess(interaction.member, guildConfig, {
        permission: PermissionFlagsBits.ModerateMembers,
        roles: ["admin", "moderator"],
      });
      if (!hasPermission) {
        return interaction.editReply({ content: "You do not have permission to use this command." });
      }

      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) {
        return interaction.editReply({ content: "Could not find that user in this server." });
      }

      if (!canModerate(interaction.member, targetMember, guildConfig)) {
        return interaction.editReply({ content: "You cannot mute this user because they have a higher or equal rank to you." });
      }

      if (targetMember.roles.cache.has(guildConfig.mute_role_id)) {
        return interaction.editReply({ content: "This user is already muted." });
      }

      await guard(
        interaction,
        {
          logMessage: "Error muting user:",
          errorReply: { content: "Failed to mute the user. Please check my role hierarchy and permissions." },
        },
        async () => {
          await targetMember.roles.add(guildConfig.mute_role_id, `${reason} (Muted by ${interaction.user.tag})`);

          await logModeratorAction({
            guildId: interaction.guild.id, moderatorId: interaction.user.id, action: "mute",
            targetId: targetUser.id, targetTag: targetUser.tag, reason,
          });

          await interaction.editReply({ content: `✅ Successfully muted **${targetUser.tag}**.\nReason: ${reason}` });

          const embed = new EmbedBuilder()
            .setTitle("🔇 User Muted")
            .setColor("#FFA500")
            .setDescription(`${targetUser} has been muted.`)
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

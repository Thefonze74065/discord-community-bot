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
    .setName("untimeout")
    .setDescription("Remove timeout from a user")
    .setDMPermission(false)
    .addUserOption((option) => option.setName("target").setDescription("The user to untimeout").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("The reason for removing the timeout").setRequired(false)),
  execute: createExecute(
    { flags: MessageFlags.Ephemeral },
    async (interaction) => {
      const targetUser = interaction.options.getUser("target");
      const reason = interaction.options.getString("reason") || "No reason provided";

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
        return interaction.editReply({ content: "You cannot remove timeout from this user because they have a higher or equal rank to you." });
      }

      if (!targetMember.isCommunicationDisabled()) {
        return interaction.editReply({ content: "This user is not currently timed out." });
      }

      await guard(
        interaction,
        {
          logMessage: "Error removing timeout:",
          errorReply: { content: "Failed to remove timeout. An error occurred." },
        },
        async () => {
          await targetMember.timeout(null, `${reason} (Timeout removed by ${interaction.user.tag})`);

          await logModeratorAction({
            guildId: interaction.guild.id, moderatorId: interaction.user.id, action: "untimeout",
            targetId: targetUser.id, targetTag: targetUser.tag, reason,
          });

          await interaction.editReply({ content: `✅ Successfully removed timeout from **${targetUser.tag}**.\nReason: ${reason}` });

          const embed = new EmbedBuilder()
            .setTitle("✅ User Timeout Removed")
            .setColor("#00FF00")
            .setDescription(`Timeout has been removed from ${targetUser}.`)
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

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
    .setName("kick")
    .setDescription("Kick a user from the server")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) => option.setName("target").setDescription("The user to kick").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("The reason for the kick").setRequired(false)),
  execute: createExecute(
    { flags: MessageFlags.Ephemeral },
    async (interaction) => {
      const targetUser = interaction.options.getUser("target");
      const reason = interaction.options.getString("reason") || "No reason provided";

      const guildConfig = getGuildStmt.get(interaction.guild.id);
      const hasPermission = hasStaffAccess(interaction.member, guildConfig, { permission: PermissionFlagsBits.KickMembers });
      if (!hasPermission) {
        return interaction.editReply({ content: "You do not have permission to use this command." });
      }

      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) {
        return interaction.editReply({ content: "Could not find that user in this server." });
      }

      if (!canModerate(interaction.member, targetMember, guildConfig)) {
        return interaction.editReply({ content: "You cannot kick this user because they have a higher or equal rank to you." });
      }
      if (!targetMember.kickable) {
        return interaction.editReply({ content: "I cannot kick this user. They might have a higher role than me." });
      }

      await guard(
        interaction,
        {
          logMessage: "Error kicking user:",
          errorReply: { content: "Failed to kick the user. An error occurred." },
        },
        async () => {
          await targetMember.kick(`${reason} (Kicked by ${interaction.user.tag})`);

          await logModeratorAction({
            guildId: interaction.guild.id, moderatorId: interaction.user.id, action: "kick",
            targetId: targetUser.id, targetTag: targetUser.tag, reason,
          });

          await interaction.editReply({ content: `✅ Successfully kicked **${targetUser.tag}**.\nReason: ${reason}` });

          const embed = new EmbedBuilder()
            .setTitle("👢 User Kicked")
            .setColor("#FF0000")
            .setDescription(`${targetUser.tag} has been kicked from the server.`)
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

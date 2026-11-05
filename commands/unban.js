const {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
} = require("discord.js");
const { createExecute, guard } = require("../lib/commandWrapper");
const db = require("../lib/database");
const { logModeratorAction } = require("../lib/modActions");
const { sendLog } = require("../lib/logging");
const { hasStaffAccess } = require("../lib/permissions");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user from the server")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName("target").setDescription("The user to unban (User ID)").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("The reason for the unban").setRequired(false),
    ),
  execute: createExecute(
    { flags: MessageFlags.Ephemeral },
    async (interaction) => {
      const targetUser = interaction.options.getUser("target");
      const reason = interaction.options.getString("reason") || "No reason provided";

      const guildConfig = getGuildStmt.get(interaction.guild.id);
      const hasPermission = hasStaffAccess(interaction.member, guildConfig, { administrator: false, roles: ["admin"] });
      if (!hasPermission) {
        return interaction.editReply({ content: "You do not have permission to use this command. Admin access required." });
      }

      await guard(
        interaction,
        {
          logMessage: "Error unbanning user:",
          errorReply: (error) =>
            error.code === 10026
              ? { content: "This user is not banned." }
              : { content: "Failed to unban the user. Please check if the ID is correct and they are actually banned." },
        },
        async () => {
          await interaction.guild.members.unban(targetUser, `${reason} (Unbanned by ${interaction.user.tag})`);

          await logModeratorAction({
            guildId: interaction.guild.id, moderatorId: interaction.user.id, action: "unban",
            targetId: targetUser.id, targetTag: targetUser.tag, reason,
          });

          await interaction.editReply({ content: `✅ Successfully unbanned **${targetUser.tag}**.\nReason: ${reason}` });

          const embed = new EmbedBuilder()
            .setTitle("✅ User Unbanned")
            .setColor("#00AA00")
            .setDescription(`${targetUser.tag} has been unbanned from the server.`)
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

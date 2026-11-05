const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags,
} = require("discord.js");
const db = require("../lib/database");
const { logModeratorAction } = require("../lib/modActions");
const { sendLog } = require("../lib/logging");
const { hasStaffAccess } = require("../lib/permissions");
const logger = require("../lib/logger");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");
const createUserNoteStmt = db.prepare(
  `INSERT INTO user_notes (guild_id, user_id, moderator_id, content, created_at)
   VALUES (@guild_id, @user_id, @moderator_id, @content, CURRENT_TIMESTAMP)`,
);
const getUserNotesStmt = db.prepare(
  "SELECT * FROM user_notes WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC",
);
const getUserNoteStmt = db.prepare("SELECT * FROM user_notes WHERE id = ?");
const deleteUserNoteStmt = db.prepare("DELETE FROM user_notes WHERE id = ?");
const deleteUserNotesStmt = db.prepare(
  "DELETE FROM user_notes WHERE guild_id = ? AND user_id = ?",
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("Manage user notes")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a note to a user")
        .addUserOption((option) => option.setName("target").setDescription("The user").setRequired(true))
        .addStringOption((option) => option.setName("content").setDescription("The note content").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List notes for a user")
        .addUserOption((option) => option.setName("target").setDescription("The user").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a specific note")
        .addStringOption((option) => option.setName("id").setDescription("The note ID").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear")
        .setDescription("Clear all notes for a user")
        .addUserOption((option) => option.setName("target").setDescription("The user").setRequired(true)),
    ),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildConfig = getGuildStmt.get(interaction.guild.id);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const targetUser = interaction.options.getUser("target");
      const content = interaction.options.getString("content");

      const hasPermission = hasStaffAccess(interaction.member, guildConfig, {
        permission: PermissionFlagsBits.ModerateMembers,
      });
      if (!hasPermission) {
        return interaction.editReply({ content: "You do not have permission to use this command." });
      }

      try {
        createUserNoteStmt.run({
          guild_id: interaction.guild.id, user_id: targetUser.id,
          moderator_id: interaction.user.id, content,
        });

        await logModeratorAction({
          guildId: interaction.guild.id, moderatorId: interaction.user.id, action: "note",
          targetId: targetUser.id, targetTag: targetUser.tag, reason: content,
        });

        await interaction.editReply({ content: `✅ Note added for **${targetUser.tag}**.` });

        const embed = new EmbedBuilder()
          .setTitle("User Note Added")
          .setColor("#00AAFF")
          .addFields(
            { name: "User", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
            { name: "Content", value: content },
          )
          .setTimestamp();
        await sendLog(interaction.guild, "moderation", embed, [], interaction.channelId);
      } catch (error) {
        logger.error("Error adding note:", error);
        await interaction.editReply({ content: "Failed to add note." });
      }
    } else if (subcommand === "list") {
      const targetUser = interaction.options.getUser("target");

      const hasPermission = hasStaffAccess(interaction.member, guildConfig, {
        permission: PermissionFlagsBits.ModerateMembers,
      });
      if (!hasPermission) {
        return interaction.editReply({ content: "You do not have permission to use this command.", ephemeral: true });
      }

      try {
        const notes = getUserNotesStmt.all(interaction.guild.id, targetUser.id);
        if (notes.length === 0) {
          return interaction.editReply({ content: `No notes found for **${targetUser.tag}**.`, ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle(`Notes for ${targetUser.tag}`)
          .setColor("#00AAFF")
          .setTimestamp();

        const recentNotes = notes.slice(0, 10);
        for (const note of recentNotes) {
          const moderator = await interaction.guild.members
            .fetch(note.moderator_id)
            .then((m) => m.user.tag)
            .catch(() => "Unknown Mod");
          const date = new Date(note.created_at).toLocaleDateString();
          embed.addFields({
            name: `ID: ${note.id} | ${date} | Mod: ${moderator}`,
            value: note.content.substring(0, 1024),
          });
        }

        if (notes.length > 10) {
          embed.setFooter({ text: `Showing 10 of ${notes.length} notes.` });
        }

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error("Error listing notes:", error);
        await interaction.editReply({ content: "Failed to list notes.", ephemeral: true });
      }
    } else if (subcommand === "delete") {
      const isAdmin = hasStaffAccess(interaction.member, guildConfig, { roles: ["admin"] });
      if (!isAdmin) {
        return interaction.editReply({
          content: "You do not have permission to delete notes. Admin access required.",
          ephemeral: true,
        });
      }

      const noteId = interaction.options.getString("id");
      try {
        const note = getUserNoteStmt.get(noteId);
        if (!note || note.guild_id !== interaction.guild.id) {
          return interaction.editReply({ content: "Note not found.", ephemeral: true });
        }

        deleteUserNoteStmt.run(noteId);
        await interaction.editReply({ content: `✅ Note \`${noteId}\` deleted.`, ephemeral: true });

        const targetUser = await interaction.client.users.fetch(note.user_id).catch(() => ({ tag: "Unknown", id: note.user_id }));

        const embed = new EmbedBuilder()
          .setTitle("User Note Deleted")
          .setColor("#FF0000")
          .addFields(
            { name: "User", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
            { name: "Note ID", value: noteId, inline: true },
            { name: "Original Content", value: note.content },
          )
          .setTimestamp();
        await sendLog(interaction.guild, "moderation", embed, [], interaction.channelId);
      } catch (error) {
        logger.error("Error deleting note:", error);
        await interaction.editReply({ content: "Failed to delete note.", ephemeral: true });
      }
    } else if (subcommand === "clear") {
      const isAdmin = hasStaffAccess(interaction.member, guildConfig, { roles: ["admin"] });
      if (!isAdmin) {
        return interaction.editReply({
          content: "You do not have permission to clear notes. Admin access required.",
          ephemeral: true,
        });
      }

      const targetUser = interaction.options.getUser("target");
      try {
        const result = deleteUserNotesStmt.run(interaction.guild.id, targetUser.id);
        await interaction.editReply({ content: `✅ Cleared ${result.changes} notes for **${targetUser.tag}**.`, ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle("User Notes Cleared")
          .setColor("#FF0000")
          .addFields(
            { name: "User", value: `${targetUser.tag} (${targetUser.id})`, inline: true },
            { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
            { name: "Count", value: `${result.changes} notes deleted` },
          )
          .setTimestamp();
        await sendLog(interaction.guild, "moderation", embed, [], interaction.channelId);
      } catch (error) {
        logger.error("Error clearing notes:", error);
        await interaction.editReply({ content: "Failed to clear notes.", ephemeral: true });
      }
    }
  },
};

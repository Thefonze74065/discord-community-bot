const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../lib/database");
const { getMemberRank } = require("../lib/permissions");
const { sendLog } = require("../lib/logging");
const logger = require("../lib/logger");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");
const getWatchedUserStmt = db.prepare(
  "SELECT * FROM watched_users WHERE guild_id = ? AND user_id = ?",
);
const upsertWatchedUserStmt = db.prepare(
  `INSERT INTO watched_users (guild_id, user_id, moderator_id, reason, expires_at, created_at)
   VALUES (@guild_id, @user_id, @moderator_id, @reason, @expires_at, CURRENT_TIMESTAMP)
   ON CONFLICT(guild_id, user_id) DO UPDATE SET reason = COALESCE(excluded.reason, watched_users.reason),
     expires_at = excluded.expires_at, moderator_id = excluded.moderator_id`,
);
const deleteWatchedUserStmt = db.prepare(
  "DELETE FROM watched_users WHERE guild_id = ? AND user_id = ?",
);
const getWatchedUsersStmt = db.prepare(
  "SELECT * FROM watched_users WHERE guild_id = ? ORDER BY created_at DESC",
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("watch")
    .setDescription("Monitor specific users and get notified of their activities")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a user to the watch list")
        .addUserOption((option) => option.setName("user").setDescription("The user to watch").setRequired(true))
        .addStringOption((option) => option.setName("reason").setDescription("Reason for watching this user").setRequired(false))
        .addIntegerOption((option) =>
          option.setName("duration").setDescription("How long to watch (in hours, leave empty for forever)").setRequired(false).setMinValue(1),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("remove").setDescription("Remove a user from the watch list")
        .addUserOption((option) => option.setName("user").setDescription("The user to stop watching").setRequired(true)),
    )
    .addSubcommand((subcommand) => subcommand.setName("list").setDescription("Display all watched users")),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildConfig = getGuildStmt.get(interaction.guild.id);
    const memberRank = getMemberRank(interaction.member, guildConfig);
    if (memberRank < 1) {
      return interaction.editReply({ content: "You need to be a Moderator or higher to use this command." });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const targetUser = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");
      const durationHours = interaction.options.getInteger("duration");
      const expiresAt = durationHours ? new Date(Date.now() + durationHours * 60 * 60 * 1000) : null;

      try {
        const existing = getWatchedUserStmt.get(interaction.guild.id, targetUser.id);
        if (existing) {
          upsertWatchedUserStmt.run({
            guild_id: interaction.guild.id, user_id: targetUser.id,
            reason: reason || existing.reason, expires_at: expiresAt ? expiresAt.toISOString() : null,
            moderator_id: interaction.user.id,
          });

          const embed = new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle("👁️ Watch Updated")
            .setDescription(`Updated watch on ${targetUser.tag}`)
            .addFields(
              { name: "User", value: `${targetUser} (${targetUser.id})`, inline: false },
              { name: "Reason", value: reason || existing.reason || "No reason provided", inline: false },
              { name: "Duration", value: durationHours ? `${durationHours} hours` : "Forever", inline: false },
              { name: "Updated by", value: `${interaction.user}`, inline: false },
            )
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        }

        upsertWatchedUserStmt.run({
          guild_id: interaction.guild.id, user_id: targetUser.id,
          reason, expires_at: expiresAt ? expiresAt.toISOString() : null,
          moderator_id: interaction.user.id,
        });

        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("👁️ User Added to Watch List")
          .setDescription(`Now watching ${targetUser.tag}`)
          .addFields(
            { name: "User", value: `${targetUser} (${targetUser.id})`, inline: false },
            { name: "Reason", value: reason || "No reason provided", inline: false },
            { name: "Duration", value: durationHours ? `${durationHours} hours` : "Forever", inline: false },
            { name: "Added by", value: `${interaction.user}`, inline: false },
          )
          .setFooter({ text: "Staff will be notified when this user joins/leaves, sends messages, or uses voice channels." })
          .setTimestamp();

        await sendLog(interaction.guild, "moderation", embed, [], interaction.channelId);
        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error("[ERROR] Failed to add user to watch list:", error);
        return interaction.editReply({ content: "Failed to add user to watch list. Check logs for details." });
      }
    } else if (subcommand === "remove") {
      const targetUser = interaction.options.getUser("user");

      try {
        const watchEntry = getWatchedUserStmt.get(interaction.guild.id, targetUser.id);
        if (!watchEntry) {
          return interaction.editReply({ content: `${targetUser.tag} is not on the watch list.` });
        }

        deleteWatchedUserStmt.run(interaction.guild.id, targetUser.id);

        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("👁️ User Removed from Watch List")
          .setDescription(`No longer watching ${targetUser.tag}`)
          .addFields(
            { name: "User", value: `${targetUser} (${targetUser.id})`, inline: false },
            { name: "Removed by", value: `${interaction.user}`, inline: false },
          )
          .setTimestamp();

        await sendLog(interaction.guild, "moderation", embed, [], interaction.channelId);
        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error("[ERROR] Failed to remove user from watch list:", error);
        return interaction.editReply({ content: "Failed to remove user from watch list. Check logs for details." });
      }
    } else if (subcommand === "list") {
      try {
        const watchedUsers = getWatchedUsersStmt.all(interaction.guild.id);
        if (watchedUsers.length === 0) {
          return interaction.editReply({ content: "No users are currently being watched." });
        }

        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle("👁️ Watched Users")
          .setDescription(`Total: ${watchedUsers.length} user(s)`)
          .setTimestamp();

        for (const watch of watchedUsers.slice(0, 10)) {
          const user = await interaction.client.users.fetch(watch.user_id).catch(() => null);
          const moderator = await interaction.client.users.fetch(watch.moderator_id).catch(() => null);

          const expiryInfo = watch.expires_at
            ? `Expires: <t:${Math.floor(new Date(watch.expires_at).getTime() / 1000)}:R>`
            : "Duration: Forever";

          embed.addFields({
            name: `${user ? user.tag : `User ${watch.user_id}`}`,
            value: [
              `**User ID:** ${watch.user_id}`,
              `**Added by:** ${moderator ? moderator.tag : `User ${watch.moderator_id}`}`,
              `**Reason:** ${watch.reason || "No reason provided"}`,
              expiryInfo,
              `**Added:** <t:${Math.floor(new Date(watch.created_at).getTime() / 1000)}:R>`,
            ].join("\n"),
            inline: false,
          });
        }

        if (watchedUsers.length > 10) {
          embed.setFooter({ text: `Showing 10 of ${watchedUsers.length} watched users` });
        }

        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error("[ERROR] Failed to list watched users:", error);
        return interaction.editReply({ content: "Failed to retrieve watch list. Check logs for details." });
      }
    }
  },
};

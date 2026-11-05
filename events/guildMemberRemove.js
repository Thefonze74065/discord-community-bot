const { Events, EmbedBuilder, AuditLogEvent } = require("discord.js");
const { sendLog } = require("../lib/logging");
const db = require("../lib/database");
const logger = require("../lib/logger");

const getWatchedUserStmt = db.prepare(
  "SELECT * FROM watched_users WHERE guild_id = ? AND user_id = ?",
);
const deleteWatchedUserStmt = db.prepare("DELETE FROM watched_users WHERE id = ?");
const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    const guild = member.guild;

    let isKick = false;
    let executor = null;
    let reason = null;

    try {
      const fetchedLogs = await guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MemberKick,
      });
      const log = fetchedLogs.entries.first();
      if (
        log &&
        log.target.id === member.id &&
        log.createdTimestamp > Date.now() - 5000
      ) {
        isKick = true;
        executor = log.executor;
        reason = log.reason;
      }
    } catch (e) {
      /* ignore */
    }

    if (isKick) {
      const kickEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setAuthor({
          name: member.user.tag,
          iconURL: member.user.displayAvatarURL(),
        })
        .setTitle("Member Kicked")
        .addFields(
          {
            name: "User",
            value: `<@${member.id}> (${member.id})`,
            inline: true,
          },
          {
            name: "Reason",
            value: reason || "No reason provided",
            inline: true,
          },
        )
        .setTimestamp();

      if (executor) {
        kickEmbed.addFields({ name: "Moderator", value: executor.tag });
      }

      await sendLog(guild, "moderation", kickEmbed);
    } else {
      const leaveEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setAuthor({
          name: member.user.tag,
          iconURL: member.user.displayAvatarURL(),
        })
        .setTitle("Member Left")
        .setDescription(`<@${member.id}> has left the server.`)
        .setTimestamp();

      await sendLog(guild, "joinLeave", leaveEmbed);
    }

    try {
      const watchEntry = getWatchedUserStmt(guild.id, member.id);

      if (watchEntry) {
        if (
          watchEntry.expires_at &&
          new Date(watchEntry.expires_at) < new Date()
        ) {
          deleteWatchedUserStmt.run(watchEntry.id);
          return;
        }

        const guildConfig = getGuildStmt.get(guild.id);

        if (guildConfig) {
          const watchEmbed = new EmbedBuilder()
            .setColor(0xff4500)
            .setTitle("👁️ Watched User Alert: Member Left")
            .setDescription(
              `${member.user.tag} has ${isKick ? "been kicked from" : "left"} the server.`,
            )
            .addFields(
              {
                name: "User",
                value: `${member.user.tag} (${member.id})`,
                inline: false,
              },
              {
                name: "Watch Reason",
                value: watchEntry.reason || "No reason provided",
                inline: false,
              },
            )
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();

          if (isKick && executor) {
            watchEmbed.addFields(
              { name: "Kicked By", value: `${executor.tag}`, inline: true },
              {
                name: "Kick Reason",
                value: reason || "No reason provided",
                inline: true,
              },
            );
          }

          const pings = [
            guildConfig.admin_role_id ? `<@&${guildConfig.admin_role_id}>` : null,
            guildConfig.moderator_role_id
              ? `<@&${guildConfig.moderator_role_id}>`
              : null,
          ]
            .filter(Boolean)
            .join(" ");

          await sendLog(
            guild,
            "joinLeave",
            watchEmbed,
            [],
            null,
            pings || undefined,
          );
        }
      }
    } catch (error) {
      logger.error(
        "[ERROR] Failed to check watch list on member remove:",
        error,
      );
    }
  },
};

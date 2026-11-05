const { EmbedBuilder } = require("discord.js");
const db = require("./database");
const { sendLog } = require("./logging");
const { buildStaffPings } = require("./voiceHelpers");
const logger = require("./logger");
const { config, guildValue } = require("./config");

function isWatchExpired(watchEntry, now = new Date()) {
  return Boolean(watchEntry.expires_at && new Date(watchEntry.expires_at) < now);
}

function messageAlertDue(watchEntry, now = new Date(), guildConfig = null) {
  const cooldownMs = guildValue(
    guildConfig,
    "watch_message_alert_cooldown_minutes",
    config.watchMessageAlertCooldownMs,
    60 * 1000,
  );
  const cutoff = new Date(now.getTime() - cooldownMs);
  return (
    !watchEntry.last_message_alert_at ||
    new Date(watchEntry.last_message_alert_at) < cutoff
  );
}

function findWatchEntry(guildId, userId) {
  return db.prepare("SELECT * FROM watched_users WHERE guild_id = ? AND user_id = ?").get(guildId, userId);
}

async function handleWatchedVoiceEvent(
  { guild, member, channel, channelId, action },
  guildConfig,
) {
  const joined = action === "joined";
  try {
    const watchEntry = findWatchEntry(guild.id, member.id);

    if (watchEntry) {
      if (isWatchExpired(watchEntry)) {
        db.prepare("DELETE FROM watched_users WHERE id = ?").run(watchEntry.id);
      } else if (guildConfig) {
        const watchEmbed = new EmbedBuilder()
          .setColor(joined ? 0x00ff88 : 0xff8800)
          .setTitle(`👁️ Watched User Alert: ${joined ? "Joined" : "Left"} Voice Channel`)
          .setDescription(`${member} ${action} ${channel}`)
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
            {
              name: "Voice Channel",
              value: `${channel}`,
              inline: true,
            },
          )
          .setThumbnail(member.user.displayAvatarURL())
          .setTimestamp();

        await sendLog(
          guild,
          "moderation",
          watchEmbed,
          [],
          channelId,
          buildStaffPings(guildConfig),
        );
      }
    }
  } catch (error) {
    logger.error(
      `[ERROR] Failed to check watch list on VC ${joined ? "join" : "leave"}:`,
      error,
    );
  }
}

async function handleWatchedMessage(message, guildConfig) {
  try {
    const watchEntry = findWatchEntry(message.guild.id, message.author.id);

    if (watchEntry) {
      if (isWatchExpired(watchEntry)) {
        db.prepare("DELETE FROM watched_users WHERE id = ?").run(watchEntry.id);
      } else {
        const now = new Date();

        if (messageAlertDue(watchEntry, now, guildConfig)) {
          const watchEmbed = new EmbedBuilder()
            .setColor(0xffff00)
            .setTitle("👁️ Watched User Alert: Message Sent")
            .setDescription(`${message.author} sent a message in ${message.channel}`)
            .addFields(
              {
                name: "User",
                value: `${message.author.tag} (${message.author.id})`,
                inline: false,
              },
              {
                name: "Watch Reason",
                value: (watchEntry.reason || "No reason provided").slice(0, 1024),
                inline: false,
              },
              {
                name: "Channel",
                value: `${message.channel}`,
                inline: true,
              },
              {
                name: "Message",
                value:
                  (message.content || "*No text content*").slice(0, 1020) +
                  (message.content.length > 1020 ? "..." : ""),
                inline: false,
              },
              {
                name: "Link",
                value: `[Jump to Message](${message.url})`,
                inline: false,
              },
            )
            .setThumbnail(message.author.displayAvatarURL())
            .setFooter({ text: "Next alert available in 30 minutes" })
            .setTimestamp();

          await sendLog(
            message.guild,
            "moderation",
            watchEmbed,
            [],
            message.channel.id,
            buildStaffPings(guildConfig),
          );

          db.prepare(
            "UPDATE watched_users SET last_message_alert_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(watchEntry.id);
        }
      }
    }
  } catch (error) {
    logger.error("[ERROR] Failed to check watch list on message:", error);
  }
}

module.exports = {
  isWatchExpired,
  messageAlertDue,
  handleWatchedVoiceEvent,
  handleWatchedMessage,
};

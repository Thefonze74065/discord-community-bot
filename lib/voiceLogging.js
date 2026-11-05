const { EmbedBuilder } = require("discord.js");
const db = require("./database");
const { sendLog } = require("./logging");
const { leaveChannel } = require("./tts");
const { handleWatchedVoiceEvent } = require("./watchAlerts");
const logger = require("./logger");

async function handleTtsAutoLeave(oldState) {
  if (
    oldState.channelId &&
    oldState.member.id !== oldState.guild.members.me.id
  ) {
    const channel = oldState.channel;
    if (channel.guild.members.me.voice.channelId === channel.id) {
      const nonBotMembers = channel.members.filter((m) => !m.user.bot);

      if (nonBotMembers.size === 0) {
        logger.info(
          `[TTS] Auto-leaving ${channel.name} in ${channel.guild.name} because it's empty.`,
        );
        const success = leaveChannel(channel.guild.id);
        if (success) {
          db.prepare(
            "UPDATE guilds SET tts_channel_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(channel.guild.id).catch((err) =>
            logger.error("[TTS] Failed to clear DB state on auto-leave:", err),
          );
        }
      }
    }
  }
}

function voiceLogEmbed(member, color, title, description) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: member.user.tag,
      iconURL: member.user.displayAvatarURL(),
    })
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

async function logVoiceStateChange(oldState, newState) {
  const guild = newState.guild;
  const member = newState.member;

  if (!member || member.user.bot) return;

  const guildConfig = db.prepare("SELECT * FROM guilds WHERE id = ?").get(guild.id);
  const ignored = guildConfig?.logging_ignore_channel_ids
    ? JSON.parse(guildConfig.logging_ignore_channel_ids)
    : [];

  if (!oldState.channelId && newState.channelId) {
    if (!ignored.includes(newState.channelId)) {
      await sendLog(
        guild,
        "message",
        voiceLogEmbed(
          member,
          0x00ff00,
          "Joined Voice Channel",
          `<@${member.id}> joined <#${newState.channelId}>`,
        ),
      );
    }

    await handleWatchedVoiceEvent(
      {
        guild,
        member,
        channel: newState.channel,
        channelId: newState.channelId,
        action: "joined",
      },
      guildConfig,
    );
  }

  if (oldState.channelId && !newState.channelId) {
    if (!ignored.includes(oldState.channelId)) {
      await sendLog(
        guild,
        "message",
        voiceLogEmbed(
          member,
          0xff0000,
          "Left Voice Channel",
          `<@${member.id}> left <#${oldState.channelId}>`,
        ),
      );
    }

    await handleWatchedVoiceEvent(
      {
        guild,
        member,
        channel: oldState.channel,
        channelId: oldState.channelId,
        action: "left",
      },
      guildConfig,
    );
  }

  if (
    oldState.channelId &&
    newState.channelId &&
    oldState.channelId !== newState.channelId
  ) {
    const oldExcluded = ignored.includes(oldState.channelId);
    const newExcluded = ignored.includes(newState.channelId);

    if (!oldExcluded || !newExcluded) {
      await sendLog(
        guild,
        "message",
        voiceLogEmbed(
          member,
          0x0099ff,
          "Moved Voice Channel",
          `<@${member.id}> moved from <#${oldState.channelId}> to <#${newState.channelId}>`,
        ),
      );
    }
  }
}

module.exports = { handleTtsAutoLeave, logVoiceStateChange };

const { EmbedBuilder } = require("discord.js");
const db = require("./database");
const { handleEventError } = require("./errors");

const getGuildStmt = db.prepare(
  "SELECT moderation_logs_channel_id, message_logs_channel_id, join_leave_logs_channel_id, image_logs_channel_id, vc_transcript_channel_id, modmail_logs_channel_id, module_logging_enabled, logging_ignore_channel_ids FROM guilds WHERE id = ?",
);

const LOG_CHANNEL_FIELDS = {
  moderation: "moderation_logs_channel_id",
  message: "message_logs_channel_id",
  joinLeave: "join_leave_logs_channel_id",
  image: "image_logs_channel_id",
  vcTranscript: "vc_transcript_channel_id",
  modmail: "modmail_logs_channel_id",
};

function sendLog(guild, type, embed = null, files = [], sourceChannelId = null, content) {
  try {
    const configField = LOG_CHANNEL_FIELDS[type];
    if (!configField) throw new Error(`Unsupported log type: ${type}`);

    const config = getGuildStmt.get(guild.id);
    if (!config || !config.module_logging_enabled) return;

    const ignoredChannelIds = config.logging_ignore_channel_ids
      ? JSON.parse(config.logging_ignore_channel_ids)
      : [];
    if (sourceChannelId && ignoredChannelIds.includes(sourceChannelId)) return;

    const channelId = config[configField];
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) return;

    const payload = { files: Array.isArray(files) ? files : [] };
    if (embed) payload.embeds = [embed];
    if (content !== undefined) payload.content = content;
    channel.send(payload);
  } catch (error) {
    handleEventError("Process log", error, { guildId: guild.id, type });
  }
}

function logCommandUsage(interaction, logType = "moderation") {
  const logEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Command Executed")
    .setAuthor({
      name: interaction.user.tag,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .addFields(
      { name: "Command", value: `/${interaction.commandName}`, inline: true },
      { name: "Channel", value: `<#${interaction.channel.id}>`, inline: true },
      { name: "User ID", value: interaction.user.id, inline: true },
    )
    .setTimestamp();

  if (interaction.options && interaction.options.data.length > 0) {
    const options = interaction.options.data
      .map((opt) => {
        if (opt.type === 1) {
          return `${opt.name} ${opt.options ? opt.options.map((o) => `${o.name}:${o.value}`).join(" ") : ""}`;
        }
        return `${opt.name}:${opt.value}`;
      })
      .join(", ");
    logEmbed.addFields({ name: "Options", value: options || "None" });
  }

  sendLog(interaction.guild, logType, logEmbed, [], interaction.channelId);
}

module.exports = { logCommandUsage, sendLog };

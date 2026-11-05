const { AttachmentBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { sendLog } = require("./logging");
const { hasGifUrl, hasGifEmbed, chunkUrls } = require("./messageHelpers");
const logger = require("./logger");
const { runAfter } = require("./timers");

async function processVoiceMessageLogging(message) {
  const files = [];

  const audioAttachment = message.attachments.first();
  if (audioAttachment) {
    files.push(
      new AttachmentBuilder(audioAttachment.url, {
        name: audioAttachment.name,
      }),
    );
  }

  const logEmbed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setAuthor({
      name: message.author.tag,
      iconURL: message.author.displayAvatarURL(),
    })
    .setDescription(
      `**Voice message sent in** <#${message.channel.id}>\n[Jump to Message](${message.url})`,
    )
    .addFields({
      name: "Duration",
      value: audioAttachment?.duration
        ? `${Math.floor(audioAttachment.duration)}s`
        : "Unknown",
      inline: true,
    })
    .setFooter({ text: `User ID: ${message.author.id}` })
    .setTimestamp();

  await sendLog(message.guild, "image", logEmbed, files, message.channel.id);
}

async function processImageLogging(message) {
  const files = [];
  let embedUrls = [];

  const imageAttachments = message.attachments.filter(
    (att) => att.contentType && att.contentType.startsWith("image/"),
  );
  for (const att of imageAttachments.values()) {
    files.push(new AttachmentBuilder(att.url, { name: att.name }));
  }

  for (const embed of message.embeds) {
    if (embed.type === "gifv" || embed.video?.url || embed.thumbnail?.url) {
      const gifUrl = embed.url;
      if (gifUrl) {
        embedUrls.push(gifUrl);
      }
    }
  }

  const logEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setAuthor({
      name: message.author.tag,
      iconURL: message.author.displayAvatarURL(),
    })
    .setDescription(
      `**Image/GIF sent in** <#${message.channel.id}>\n[Jump to Message](${message.url})`,
    )
    .setFooter({ text: `User ID: ${message.author.id}` })
    .setTimestamp();

  if (files.length > 0) {
    logEmbed.addFields({
      name: "Attachments",
      value: `${files.length} image(s) (re-uploaded above)`,
    });
  }

  if (embedUrls.length > 0) {
    for (const chunk of chunkUrls(embedUrls)) {
      await sendLog(
        message.guild,
        "image",
        null,
        [],
        message.channel.id,
        chunk,
      );
    }
  }

  await sendLog(message.guild, "image", logEmbed, files, message.channel.id);
}

async function handleMessageMediaLogging(message, guildConfig) {
  if (guildConfig.image_logs_channel_id && guildConfig.module_logging_enabled) {
    const ignored = guildConfig.logging_ignore_channel_ids
      ? JSON.parse(guildConfig.logging_ignore_channel_ids)
      : [];
    if (!ignored.includes(message.channel.id)) {
      const isVoiceMessage = message.flags.has(MessageFlags.IsVoiceMessage);

      if (isVoiceMessage) {
        await processVoiceMessageLogging(message);
      }
    }
  }

  if (guildConfig.image_logs_channel_id && guildConfig.module_logging_enabled) {
    const ignored = guildConfig.logging_ignore_channel_ids
      ? JSON.parse(guildConfig.logging_ignore_channel_ids)
      : [];
    if (!ignored.includes(message.channel.id)) {
      const hasImageAttachment = message.attachments.some(
        (att) => att.contentType && att.contentType.startsWith("image/"),
      );

      const gifEmbedPresent = hasGifEmbed(message.embeds);

      if (hasGifUrl(message.content) && !gifEmbedPresent) {
        runAfter(2000, async () => {
          try {
            const refreshedMessage = await message.channel.messages.fetch(
              message.id,
            );

            if (hasGifEmbed(refreshedMessage.embeds)) {
              await processImageLogging(refreshedMessage);
            }
          } catch (err) {
            logger.error("Error in delayed GIF check:", err);
          }
        });
        return true;
      }

      if (hasImageAttachment || gifEmbedPresent) {
        await processImageLogging(message);
      }
    }
  }

  return false;
}

module.exports = { handleMessageMediaLogging };

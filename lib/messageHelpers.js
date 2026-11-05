const { ChannelType } = require("discord.js");
const emojilib = require("emojilib");
const emojiRegex = require("emoji-regex");

const GIF_HOSTS = ["tenor.com", "giphy.com", "klipy.com"];
const DISCORD_MESSAGE_LIMIT = 2000;

function isTtsEllipsis(content) {
  return /^\.{3,}/.test(content);
}

function prepareTtsText(content) {
  if (isTtsEllipsis(content)) return null;

  if (!content.startsWith(".")) return null;

  let textToRead = content.slice(1).trim();

  textToRead = textToRead.replace(/<a?:([^:]+):\d+>/g, (match, name) => {
    return " " + name.replace(/[_-]/g, " ") + " ";
  });

  const regex = emojiRegex();
  textToRead = textToRead.replace(regex, (match) => {
    if (emojilib[match]) {
      return ` ${emojilib[match][0]} `;
    }
    return match;
  });

  textToRead = textToRead.replace(/[_-]/g, " ");

  textToRead = textToRead.replace(/[^\x00-\x7FÀ-ÏÑ-ÖØ-ïñ-öø-ÿ]/g, "");

  return textToRead.replace(/\s+/g, " ").trim();
}

function hasGifHost(url) {
  return GIF_HOSTS.some((host) => url.includes(host));
}

function hasGifUrl(content) {
  return Boolean(content && hasGifHost(content));
}

function hasGifEmbed(embeds) {
  return embeds.some(
    (embed) =>
      embed.type === "gifv" ||
      (embed.video?.url && hasGifHost(embed.video.url)) ||
      (embed.thumbnail?.url &&
        (embed.thumbnail.url.includes(".gif") ||
          hasGifHost(embed.thumbnail.url))),
  );
}

function chunkUrls(urls) {
  const urlMessage = urls.join("\n");
  if (urlMessage.length <= DISCORD_MESSAGE_LIMIT) return [urlMessage];

  const chunks = [];
  let currentChunk = "";
  for (const url of urls) {
    if (currentChunk.length + url.length + 1 > DISCORD_MESSAGE_LIMIT) {
      chunks.push(currentChunk);
      currentChunk = url;
    } else {
      currentChunk += (currentChunk ? "\n" : "") + url;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

function messageXpForChannel(channelType) {
  const isVoiceChannel =
    channelType === ChannelType.GuildVoice ||
    channelType === ChannelType.GuildStageVoice;
  return isVoiceChannel ? 1 : 10;
}

module.exports = {
  isTtsEllipsis,
  prepareTtsText,
  hasGifUrl,
  hasGifEmbed,
  chunkUrls,
  messageXpForChannel,
};

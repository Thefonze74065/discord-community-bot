const { Events } = require("discord.js");
const { getSession, addToQueue } = require("../lib/tts");
const { isTtsEllipsis, prepareTtsText } = require("../lib/messageHelpers");
const { handleWatchedMessage } = require("../lib/watchAlerts");
const { handleMessageMediaLogging } = require("../lib/messageLogging");
const { awardMessageXp } = require("../lib/messageXp");

const db = require("../lib/database");
const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");

async function handleTtsAutoRead(message, guildConfig) {
  if (guildConfig?.module_tts_enabled === false) return false;

  const ttsSession = getSession(message.guild.id);
  if (!ttsSession || ttsSession.text_channel_id !== message.channel.id) {
    return false;
  }

  if (isTtsEllipsis(message.content)) return true;

  const textToRead = prepareTtsText(message.content);

  if (textToRead && textToRead.length > 0) {
    await addToQueue(message.guild.id, message.member.displayName, textToRead);
  }
  return false;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    const guildConfig = message.guild
      ? getGuildStmt.get(message.guild.id)
      : null;

    if (message.author.bot || !message.guild) return;

    if (await handleTtsAutoRead(message, guildConfig)) return;

    if (!guildConfig) return;

    await handleWatchedMessage(message, guildConfig);

    const { checkAutoMod } = require("../lib/automod");
    if (await checkAutoMod(message, guildConfig)) return;

    if (await handleMessageMediaLogging(message, guildConfig)) return;

    if (!guildConfig.module_leveling_enabled) return;

    await awardMessageXp(message, guildConfig);
  },
};

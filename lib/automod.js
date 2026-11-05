const db = require("./database");
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { handleEventError, safePromise } = require("./errors");
const { sendLog } = require("./logging");
const logger = require("./logger");
const { runAfter } = require("./timers");

const DEFAULT_PING_LIMIT = 5;
const DEFAULT_ATTACHMENT_LIMIT = 3;

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");

async function checkAutoMod(message, existingConfig = null) {
  if (!message.guild || message.author.bot) return false;

  let guildConfig = existingConfig;
  if (!guildConfig) {
    guildConfig = getGuildStmt.get(message.guild.id);
  }

  if (!guildConfig || !guildConfig.module_automod_enabled) return false;

  const member = message.member;
  if (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    (guildConfig.admin_role_id && member.roles.cache.has(guildConfig.admin_role_id)) ||
    (guildConfig.moderator_role_id && member.roles.cache.has(guildConfig.moderator_role_id))
  ) {
    return false;
  }

  // 1. Bad Words (Whole Word Match)
  const badWords = guildConfig.auto_mod_bad_words ? JSON.parse(guildConfig.auto_mod_bad_words) : [];
  if (badWords.length > 0) {
    const content = message.content.toLowerCase();
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const foundWord = badWords.find((word) => {
      const regex = new RegExp(`(?<!\\w)${escapeRegex(word)}(?!\\w)`, "i");
      return regex.test(content);
    });

    if (foundWord) {
      await handleViolation(message, guildConfig, "Bad Word (Whole)", foundWord);
      return true;
    }
  }

  // 2. Strict Bad Words (Partial Match)
  const strictWords = guildConfig.auto_mod_strict_words ? JSON.parse(guildConfig.auto_mod_strict_words) : [];
  if (strictWords.length > 0) {
    const content = message.content.toLowerCase();
    const foundWord = strictWords.find((word) => content.includes(word.toLowerCase()));

    if (foundWord) {
      await handleViolation(message, guildConfig, "Bad Word (Strict)", foundWord);
      return true;
    }
  }

  // 3. Ping Limit
  if (message.mentions.users.size > (guildConfig.auto_mod_ping_limit ?? DEFAULT_PING_LIMIT)) {
    await handleViolation(message, guildConfig, "Mass Mention", `${message.mentions.users.size} mentions`);
    return true;
  }

  // 3. Attachment Limit
  if (message.attachments.size > (guildConfig.auto_mod_attachment_limit ?? DEFAULT_ATTACHMENT_LIMIT)) {
    await handleViolation(message, guildConfig, "Mass Attachment", `${message.attachments.size} attachments`);
    return true;
  }

  return false;
}

async function handleViolation(message, config, type, detail) {
  try {
    if (message.deletable) {
      const [deleteMessageErr] = await safePromise(message.delete());
      if (deleteMessageErr) {
        handleEventError("Delete automod violation", deleteMessageErr, {
          guildId: message.guild.id, channelId: message.channel.id,
        });
      }
    }

    const warningMsg = await message.channel.send(`${message.author}, your message was removed for **${type}** violation.`);
    runAfter(15000, async () => {
      const [deleteErr] = await safePromise(warningMsg.delete());
      if (deleteErr) {
        handleEventError("Delete automod warning", deleteErr, {
          guildId: message.guild.id, channelId: message.channel.id,
        });
      }
    });

    const embed = new EmbedBuilder()
      .setTitle("AutoMod Violation")
      .setColor("#FF0000")
      .addFields(
        { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
        { name: "Channel", value: `${message.channel.name}`, inline: true },
        { name: "Type", value: type, inline: true },
        { name: "Detail", value: detail },
        { name: "Content", value: message.content.substring(0, 1024) || "[No Content]" },
      )
      .setTimestamp();
    await sendLog(message.guild, "moderation", embed, [], message.channel.id);
  } catch (err) {
    logger.error("AutoMod Action Error:", err);
  }
}

module.exports = { checkAutoMod };

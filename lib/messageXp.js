const { addXp, handleLevelUp } = require("./leveling");
const { adjustBalance } = require("./economy");
const { handleEventError } = require("./errors");
const { messageXpForChannel } = require("./messageHelpers");
const { expireKey } = require("./timers");
const { config, guildValue } = require("./config");

const cooldowns = new Map();

async function awardMessageXp(message, guildConfig) {
  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();
  const COOLDOWN_SECONDS = guildValue(
    guildConfig,
    "message_xp_cooldown_seconds",
    config.messageXpCooldownSeconds,
  );
  let xpToAdd = 0;

  let onCooldown = false;
  if (cooldowns.has(key)) {
    const expirationTime = cooldowns.get(key) + COOLDOWN_SECONDS * 1000;
    if (now < expirationTime) {
      onCooldown = true;
    }
  }

  if (!onCooldown) {
    xpToAdd = messageXpForChannel(message.channel.type);

    cooldowns.set(key, now);
    expireKey(cooldowns, key, COOLDOWN_SECONDS * 1000);
  }

  try {
    const { leveledUp, newLevel } = await addXp(
      message.author.id,
      message.guild.id,
      xpToAdd,
      1,
      0,
    );

    if (
      xpToAdd > 0 &&
      guildConfig.module_casino_enabled &&
      guildConfig.casino_chat_drip_enabled
    ) {
      const dripAmount = guildValue(
        guildConfig,
        "casino_chat_drip_amount",
        config.casinoChatDripAmount,
      );
      if (dripAmount > 0) {
        await adjustBalance(
          message.author.id,
          message.guild.id,
          dripAmount,
          guildConfig,
        );
      }
    }

    if (leveledUp) {
      const member = message.member;
      if (member) {
        await handleLevelUp(member, newLevel, message.guild.id);
      }
    }
  } catch (error) {
    handleEventError("Message XP tracking", error, {
      guildId: message.guild?.id,
      userId: message.author?.id,
    });
  }
}

module.exports = { awardMessageXp };

const { Events } = require("discord.js");
const db = require("../lib/database");
const { addXp, handleLevelUp } = require("../lib/leveling");
const logger = require("../lib/logger");
const { expireKey } = require("../lib/timers");
const { config, guildValue } = require("../lib/config");

const cooldowns = new Map();

const getGiveawayByMessageStmt = db.prepare(
  "SELECT * FROM giveaways WHERE message_id = ? AND ended = 0",
);
const upsertGiveawayEntryStmt = db.prepare(
  `INSERT INTO giveaway_entries (giveaway_id, user_id, joined_at)
   VALUES (@giveaway_id, @user_id, CURRENT_TIMESTAMP)
   ON CONFLICT(giveaway_id, user_id) DO NOTHING`,
);
const getGuildReactionConfigStmt = db.prepare(
  "SELECT module_reaction_roles_enabled, module_leveling_enabled FROM guilds WHERE id = ?",
);
const getReactionRoleStmt = db.prepare(
  "SELECT * FROM reaction_roles WHERE message_id = ? AND emoji = ?",
);

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    if (user.bot || !reaction.message.guild) return;

    try {
      const giveaway = getGiveawayByMessageStmt.get(reaction.message.id);
      if (giveaway && reaction.emoji.name === "🎉") {
        upsertGiveawayEntryStmt.run({
          giveaway_id: giveaway.id,
          user_id: user.id,
        });
        return;
      }
    } catch (error) {
      logger.error("Error handling giveaway entry:", error);
    }

    const guildConfig = getGuildReactionConfigStmt.get(
      reaction.message.guild.id,
    );

    if (guildConfig?.module_reaction_roles_enabled !== false) {
      try {
        const emojiKey = reaction.emoji.id || reaction.emoji.name;
        const reactionRole = getReactionRoleStmt.get(
          reaction.message.id,
          emojiKey,
        );

        if (reactionRole) {
          const member = await reaction.message.guild.members.fetch(user.id);
          await member.roles.add(reactionRole.role_id);
          return;
        }
      } catch (error) {
        logger.error("Error handling reaction role add:", error);
      }
    }

    if (!guildConfig || !guildConfig.module_leveling_enabled) return;

    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        logger.error("Something went wrong when fetching the message:", error);
        return;
      }
    }

    const key = `${reaction.message.guild.id}-${user.id}-reaction`;
    const now = Date.now();
    const COOLDOWN_SECONDS = guildValue(
      guildConfig,
      "reaction_xp_cooldown_seconds",
      config.reactionXpCooldownSeconds,
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
      xpToAdd = 5;
      cooldowns.set(key, now);
      expireKey(cooldowns, key, COOLDOWN_SECONDS * 1000);
    }

    try {
      const { leveledUp, newLevel } = await addXp(
        user.id,
        reaction.message.guild.id,
        xpToAdd,
        0,
        0,
        1,
      );

      if (leveledUp) {
        const member = await reaction.message.guild.members.fetch(user.id);
        if (member) {
          await handleLevelUp(member, newLevel, reaction.message.guild.id);
        }
      }
    } catch (error) {
      logger.error("Error tracking reaction XP:", error);
    }
  },
};

const db = require("./database");
const { handleEventError } = require("./errors");
const logger = require("./logger");
const { startInterval } = require("./timers");

const userXpCache = new Map();
let saveInterval = null;

function getLevelFromXp(xp) {
  return Math.floor(0.1 * Math.sqrt(xp));
}

function getXpForLevel(level) {
  return 100 * level * level;
}

const getUserLevelStmt = db.prepare(
  "SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?",
);
const upsertUserLevelStmt = db.prepare(
  `INSERT INTO user_levels (user_id, guild_id, xp, level, messages, voice_time, reactions, last_updated)
   VALUES (@user_id, @guild_id, @xp, @level, @messages, @voice_time, @reactions, CURRENT_TIMESTAMP)
   ON CONFLICT(user_id, guild_id) DO UPDATE SET
     xp = excluded.xp,
     level = excluded.level,
     messages = excluded.messages,
     voice_time = excluded.voice_time,
     reactions = excluded.reactions,
     last_updated = CURRENT_TIMESTAMP`,
);
const upsertUserDailyActivityStmt = db.prepare(
  `INSERT INTO user_daily_activities (user_id, guild_id, date, messages, voice_time, reactions, xp_earned)
   VALUES (@user_id, @guild_id, @date, @messages, @voice_time, @reactions, @xp_earned)
   ON CONFLICT(user_id, guild_id, date) DO UPDATE SET
     messages = messages + excluded.messages,
     voice_time = voice_time + excluded.voice_time,
     reactions = reactions + excluded.reactions,
     xp_earned = xp_earned + excluded.xp_earned`,
);

function getUserData(userId, guildId) {
  const key = `${userId}-${guildId}`;
  if (userXpCache.has(key)) return userXpCache.get(key);

  const userLevel = getUserLevelStmt.get(userId, guildId);
  if (!userLevel) {
    const entry = { userId, guildId, xp: 0, level: 0, messages: 0, voiceTime: 0, reactions: 0 };
    const cacheEntry = { ...entry, dirty: false, pending: { messages: 0, voiceTime: 0, reactions: 0, xp: 0 } };
    userXpCache.set(key, cacheEntry);
    return cacheEntry;
  }

  const mapped = {
    userId: userLevel.user_id,
    guildId: userLevel.guild_id,
    xp: userLevel.xp,
    level: userLevel.level,
    messages: userLevel.messages,
    voiceTime: userLevel.voice_time,
    reactions: userLevel.reactions || 0,
  };
  const cacheEntry = { ...mapped, dirty: false, pending: { messages: 0, voiceTime: 0, reactions: 0, xp: 0 } };
  userXpCache.set(key, cacheEntry);
  return cacheEntry;
}

function addXp(userId, guildId, xpAmount, messageCountInc = 0, voiceTimeInc = 0, reactionCountInc = 0) {
  const userData = getUserData(userId, guildId);
  const oldLevel = userData.level;
  userData.xp += xpAmount;
  userData.messages += messageCountInc;
  userData.voiceTime += voiceTimeInc;
  userData.reactions = (userData.reactions || 0) + reactionCountInc;
  userData.level = getLevelFromXp(userData.xp);
  userData.dirty = true;

  if (!userData.pending) userData.pending = { messages: 0, voiceTime: 0, reactions: 0, xp: 0 };
  userData.pending.messages += messageCountInc;
  userData.pending.voiceTime += voiceTimeInc;
  userData.pending.reactions += reactionCountInc;
  userData.pending.xp += xpAmount;

  return { userLevel: userData, leveledUp: userData.level > oldLevel, newLevel: userData.level };
}

function setXp(userId, guildId, xpAmount) {
  if (!Number.isFinite(xpAmount) || xpAmount < 0) throw new RangeError("XP amount must be a non-negative number");
  const userData = getUserData(userId, guildId);
  const oldLevel = userData.level;
  userData.xp = xpAmount;
  userData.level = getLevelFromXp(xpAmount);
  userData.dirty = true;
  flushUser(userData);
  return { userLevel: userData, leveledUp: userData.level > oldLevel, newLevel: userData.level };
}

function flushUser(data) {
  try {
    upsertUserLevelStmt.run({
      user_id: data.userId, guild_id: data.guildId, xp: data.xp, level: data.level,
      messages: data.messages, voice_time: data.voiceTime, reactions: data.reactions || 0,
    });

    if (data.pending && (data.pending.xp > 0 || data.pending.messages > 0 || data.pending.voiceTime > 0 || data.pending.reactions > 0)) {
      const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())).toISOString().split("T")[0];
      upsertUserDailyActivityStmt.run({
        user_id: data.userId, guild_id: data.guildId, date: today,
        messages: data.pending.messages, voice_time: data.pending.voiceTime,
        reactions: data.pending.reactions, xp_earned: data.pending.xp,
      });
      data.pending = { messages: 0, voiceTime: 0, reactions: 0, xp: 0 };
    }
    data.dirty = false;
  } catch (error) {
    handleEventError("Save XP to database", error, { userId: data.userId, guildId: data.guildId });
  }
}

function flushAllXp() {
  logger.info("Saving XP to database...");
  let count = 0;
  for (const data of userXpCache.values()) {
    if (!data.dirty) continue;
    flushUser(data);
    count++;
  }
  if (count > 0) logger.info(`Saved XP for ${count} users.`);
}

function startXpSaveInterval(minutes = 10) {
  if (saveInterval) clearInterval(saveInterval);
  saveInterval = startInterval(flushAllXp, minutes * 60 * 1000);
  logger.info(`[INFO] XP Save Interval started (${minutes} minutes)`);
}

async function checkAndApplyRewards(member, level, guildId) {
  const allRewards = db.prepare("SELECT * FROM level_rewards WHERE guild_id = ?").all(guildId);
  const earnedRewards = allRewards.filter((r) => r.level <= level);
  earnedRewards.sort((a, b) => b.level - a.level);
  const highestReward = earnedRewards[0];

  const addedRoles = [];
  if (highestReward && !member.roles.cache.has(highestReward.role_id)) {
    try {
      await member.roles.add(highestReward.role_id);
      addedRoles.push(highestReward.role_id);
    } catch (error) {
      handleEventError("Add level role", error, { roleId: highestReward.role_id, userId: member.id, guildId: member.guild.id });
    }
  }

  const rolesToRemove = allRewards.filter((r) => !highestReward || r.role_id !== highestReward.role_id).map((r) => r.role_id);
  for (const roleId of rolesToRemove) {
    if (member.roles.cache.has(roleId)) {
      try { await member.roles.remove(roleId); } catch (error) {
        handleEventError("Remove level role", error, { roleId, userId: member.id, guildId: member.guild.id });
      }
    }
  }

  const unlockedColorRoleIds = new Set(allRewards.filter((r) => r.level <= level && r.color_role_id).map((r) => r.color_role_id));
  const allColorRoleIds = Array.from(new Set(allRewards.filter((r) => r.color_role_id).map((r) => r.color_role_id)));
  const lockedColorRoleIds = allColorRoleIds.filter((roleId) => !unlockedColorRoleIds.has(roleId));

  for (const roleId of lockedColorRoleIds) {
    if (member.roles.cache.has(roleId)) {
      try { await member.roles.remove(roleId); } catch (error) {
        handleEventError("Remove locked color role", error, { roleId, userId: member.id, guildId: member.guild.id });
      }
    }
  }

  return addedRoles;
}

async function handleLevelUp(member, level, guildId) {
  const addedRoles = await checkAndApplyRewards(member, level, guildId);
  try {
    const guildSettings = db.prepare("SELECT * FROM guilds WHERE id = ?").get(guildId);
    if (guildSettings && guildSettings.level_up_channel_id) {
      const channel = member.guild.channels.cache.get(guildSettings.level_up_channel_id);
      if (channel) {
        let message = `Congratulations ${member}, you have reached **Level ${level}**! 🎉`;
        if (addedRoles.length > 0) {
          message += `\n\n🏆 **New Role Unlocked:** ${addedRoles.map((id) => {
            const role = member.guild.roles.cache.get(id);
            return role ? role.name : "Unknown Role";
          }).join(", ")}`;
        } else {
          const nextReward = db.prepare("SELECT * FROM level_rewards WHERE guild_id = ? AND level > ? ORDER BY level ASC LIMIT 1").get(guildId, level);
          if (nextReward) {
            const nextRole = member.guild.roles.cache.get(nextReward.role_id);
            message += `\n\n**Next Goal:** Level ${nextReward.level} for ${nextRole ? nextRole.name : "Unknown Role"}`;
          } else {
            message += `\n\n🚀 Onwards to Level ${level + 1}!`;
          }
        }
        await channel.send(message);
      }
    }
  } catch (error) {
    handleEventError("Send level up notification", error, { userId: member.id, guildId: member.guild.id, level });
  }
}

module.exports = { addXp, setXp, getLevelFromXp, getXpForLevel, checkAndApplyRewards, handleLevelUp, flushAllXp, startXpSaveInterval, userXpCache };

const db = require("./database");
const { addXp, handleLevelUp } = require("./leveling");
const { planVoiceTracking, sessionMinutes } = require("./voiceHelpers");
const logger = require("./logger");

const getVoiceSessionStmt = db.prepare("SELECT * FROM voice_sessions WHERE user_id = ?");
const upsertVoiceSessionStmt = db.prepare(
  `INSERT INTO voice_sessions (user_id, guild_id, start_time)
   VALUES (@user_id, @guild_id, CURRENT_TIMESTAMP)
   ON CONFLICT(user_id) DO UPDATE SET start_time = CURRENT_TIMESTAMP, guild_id = @guild_id`,
);
const deleteVoiceSessionStmt = db.prepare("DELETE FROM voice_sessions WHERE user_id = ?");

async function initializeVoiceTracking(client) {
  logger.info("[INFO] Initializing voice tracking for current users...");
  let count = 0;

  const currentVoiceUsers = [];
  client.guilds.cache.forEach((guild) => {
    guild.voiceStates.cache.forEach((voiceState) => {
      if (
        voiceState.channelId &&
        voiceState.member &&
        !voiceState.member.user.bot
      ) {
        currentVoiceUsers.push({
          userId: voiceState.member.id,
          guildId: guild.id,
        });
      }
    });
  });

  for (const user of currentVoiceUsers) {
    try {
      const existingSession = getVoiceSessionStmt.get(user.userId);

      if (!existingSession) {
        upsertVoiceSessionStmt.run({ user_id: user.userId, guild_id: user.guildId });
        count++;
      } else {
        count++;
      }
    } catch (error) {
      logger.error(`Failed to init voice session for ${user.userId}:`, error);
    }
  }

  logger.info(
    `[INFO] Verified tracking for ${count} users currently in voice channels.`,
  );
}

function stopVoiceTracking() {
  logger.info("[INFO] Stopping voice tracking (saving sessions)...");
  logger.info("[INFO] Voice sessions are persistent in DB. No action needed.");
}

async function handleVoiceTracking(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const userId = member.id;
  const guildId = member.guild.id;

  const guildConfig = db
    .prepare("SELECT module_leveling_enabled, afk_vc_channel_id FROM guilds WHERE id = ?")
    .get(guildId);
  if (!guildConfig || !guildConfig.module_leveling_enabled) return;

  const steps = planVoiceTracking(
    oldState.channelId,
    newState.channelId,
    guildConfig.afk_vc_channel_id,
  );

  for (const step of steps) {
    if (step === "start") {
      await startVoiceSession(userId, guildId);
    } else if (step === "discard") {
      await discardVoiceSession(userId);
    } else if (step === "award") {
      await processVoiceXp(userId, guildId, member);
    } else if (step === "create") {
      await restartVoiceSession(userId, guildId);
    }
  }
}

async function startVoiceSession(userId, guildId) {
  try {
    upsertVoiceSessionStmt.run({ user_id: userId, guild_id: guildId });
  } catch (e) {
    logger.error(`Failed to start voice session for ${userId}:`, e);
  }
}

function discardVoiceSession(userId) {
  try {
    deleteVoiceSessionStmt.run(userId);
  } catch (e) {
    // Ignore if not found
  }
}

async function restartVoiceSession(userId, guildId) {
  try {
    upsertVoiceSessionStmt.run({ user_id: userId, guild_id: guildId });
  } catch (e) {
    logger.error(`Failed to restart voice session for ${userId}:`, e);
  }
}

async function processVoiceXp(userId, guildId, member) {
  try {
    const session = getVoiceSessionStmt.get(userId);
    if (!session) return;

    deleteVoiceSessionStmt.run(userId);

    const minutes = sessionMinutes(session.start_time, Date.now());

    if (minutes > 0) {
      const xpToAdd = minutes * 5;
      const { leveledUp, newLevel } = await addXp(
        userId,
        guildId,
        xpToAdd,
        0,
        minutes,
      );
      if (leveledUp) {
        await handleLevelUp(member, newLevel, guildId);
      }
    }
  } catch (err) {
    if (err && (!err.message || !err.message.includes("No record found"))) {
      logger.error("Error processing voice XP:", err);
    }
  }
}

module.exports = {
  initializeVoiceTracking,
  stopVoiceTracking,
  handleVoiceTracking,
};

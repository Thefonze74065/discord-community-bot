const db = require("./database");
const logger = require("./logger");

const createModeratorActionStmt = db.prepare(
  `INSERT INTO moderator_actions (guild_id, moderator_id, action, target_id, target_tag, reason, details, timestamp)
   VALUES (@guild_id, @moderator_id, @action, @target_id, @target_tag, @reason, @details, CURRENT_TIMESTAMP)`,
);

function logModeratorAction({
  guildId, moderatorId, action, targetId = null, targetTag = null, reason = null, details = null,
}) {
  try {
    createModeratorActionStmt.run({
      guild_id: guildId, moderator_id: moderatorId, action, target_id: targetId,
      target_tag: targetTag, reason, details: details ? JSON.stringify(details) : null,
    });
  } catch (error) {
    logger.error("[ModActions] Failed to log action:", error);
  }
}

function getModeratorActions(guildId, options = {}) {
  const { startDate, endDate, moderatorId } = options;
  let where = "guild_id = ?";
  const params = [guildId];
  if (moderatorId) { where += " AND moderator_id = ?"; params.push(moderatorId); }
  if (startDate && endDate) { where += " AND timestamp >= ? AND timestamp <= ?"; params.push(startDate.toISOString(), endDate.toISOString()); }

  const actions = db.prepare(`SELECT * FROM moderator_actions WHERE ${where} ORDER BY timestamp DESC`).all(params);

  const byModerator = {};
  const actionTypes = {};
  for (const action of actions) {
    if (!byModerator[action.moderator_id]) {
      byModerator[action.moderator_id] = { total: 0, actions: {}, lastActive: null };
    }
    byModerator[action.moderator_id].total++;
    byModerator[action.moderator_id].actions[action.action] = (byModerator[action.moderator_id].actions[action.action] || 0) + 1;
    if (!byModerator[action.moderator_id].lastActive || action.timestamp > byModerator[action.moderator_id].lastActive) {
      byModerator[action.moderator_id].lastActive = action.timestamp;
    }
    actionTypes[action.action] = (actionTypes[action.action] || 0) + 1;
  }

  return {
    totalActions: actions.length,
    byModerator,
    actionTypes,
    recentActions: actions.slice(0, 50),
  };
}

function getActivityTimeline(guildId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const actions = db.prepare(
    "SELECT timestamp, action FROM moderator_actions WHERE guild_id = ? AND timestamp >= ?",
  ).all(guildId, startDate.toISOString());

  const timeline = {};
  for (const action of actions) {
    const date = new Date(action.timestamp).toISOString().split("T")[0];
    if (!timeline[date]) timeline[date] = { total: 0, actions: {} };
    timeline[date].total++;
    timeline[date].actions[action.action] = (timeline[date].actions[action.action] || 0) + 1;
  }

  const result = [];
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    result.push({ date: dateStr, total: timeline[dateStr] ? timeline[dateStr].total : 0, actions: timeline[dateStr] ? timeline[dateStr].actions : {} });
  }

  return result.reverse();
}

module.exports = { logModeratorAction, getModeratorStats: getModeratorActions, getActivityTimeline };

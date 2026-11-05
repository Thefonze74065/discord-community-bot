const {
  getModeratorStats,
  getActivityTimeline,
} = require("../../lib/modActions");
const { handleRouteError } = require("../errors");

function registerModeratorRoutes(app, { client, checkAuth, hasGuildAdmin }) {
  app.get("/api/moderator/stats", checkAuth, async (req, res) => {
    const { guild_id, startDate, endDate, moderatorId } = req.query;

    let guildId = guild_id;
    if (!guildId) {
      const guilds = client.guilds.cache;
      if (guilds.size === 0) {
        return res.status(403).json({ error: "Bot not in any guilds" });
      }
      guildId = guilds.first().id;
    }

    if (!(await hasGuildAdmin(req.user.id, guildId))) {
      return res.status(403).json({ error: "Admin access required" });
    }

    try {
      const options = {};
      if (startDate) options.startDate = new Date(startDate);
      if (endDate) options.endDate = new Date(endDate);
      if (moderatorId) options.moderatorId = moderatorId;

      const stats = getModeratorStats(guildId, options);
      res.json(stats);
    } catch (error) {
      handleRouteError(
        res,
        "Error fetching moderator stats:",
        error,
        "Internal server error",
      );
    }
  });

  app.get("/api/moderator/timeline", checkAuth, async (req, res) => {
    const { guild_id, days } = req.query;

    let guildId = guild_id;
    if (!guildId) {
      const guilds = client.guilds.cache;
      if (guilds.size === 0) {
        return res.status(403).json({ error: "Bot not in any guilds" });
      }
      guildId = guilds.first().id;
    }

    if (!(await hasGuildAdmin(req.user.id, guildId))) {
      return res.status(403).json({ error: "Admin access required" });
    }

    try {
      const daysInt = parseInt(days) || 30;
      const timeline = getActivityTimeline(guildId, daysInt);
      res.json(timeline);
    } catch (error) {
      handleRouteError(
        res,
        "Error fetching activity timeline:",
        error,
        "Internal server error",
      );
    }
  });

  app.post("/api/users/bulk", checkAuth, async (req, res) => {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "Invalid userIds" });
    }

    try {
      const users = [];
      for (const userId of userIds.slice(0, 50)) {
        try {
          const user = await client.users.fetch(userId);
          users.push({
            id: user.id,
            username: user.username,
            discriminator: user.discriminator,
            avatar: user.avatar,
          });
        } catch (err) {
          continue;
        }
      }
      res.json(users);
    } catch (error) {
      handleRouteError(
        res,
        "Error fetching users:",
        error,
        "Internal server error",
      );
    }
  });
}

module.exports = registerModeratorRoutes;

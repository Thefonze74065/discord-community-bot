const db = require("../../lib/database");
const { handleRouteError } = require("../errors");

function registerActivityRoutes(app, { client, checkAuth, hasGuildAccess }) {
  const getDailyActivityStmt = db.prepare(
    `SELECT date,
            COALESCE(SUM(messages), 0) AS messages,
            COALESCE(SUM(voice_time), 0) AS voice_time,
            COALESCE(SUM(reactions), 0) AS reactions,
            COALESCE(SUM(xp_earned), 0) AS xp_earned
     FROM user_daily_activities
     WHERE guild_id = ? AND date >= ?
     GROUP BY date
     ORDER BY date ASC`,
  );
  const getUserActivityStmt = db.prepare(
    `SELECT date, messages, voice_time, reactions, xp_earned
     FROM user_daily_activities
     WHERE guild_id = ? AND user_id = ? AND date >= ?
     ORDER BY date ASC`,
  );

  app.get("/api/activity/server", checkAuth, async (req, res) => {
    const { guildId, days = 30 } = req.query;

    if (!guildId) return res.status(400).json({ error: "Missing guildId" });
    if (!(await hasGuildAccess(req.user.id, guildId))) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const now = new Date();
    const startDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - parseInt(days),
      ),
    );
    const startDateStr = startDate.toISOString().split("T")[0];

    try {
      const activity = getDailyActivityStmt.all(guildId, startDateStr);

      const formatted = activity.map((entry) => ({
        date: entry.date,
        messages: entry.messages || 0,
        voiceTime: entry.voice_time || 0,
        reactions: entry.reactions || 0,
        xpEarned: entry.xp_earned || 0,
      }));

      const filledData = [];
      const currentDate = new Date(startDate);
      const endDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );

      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split("T")[0];
        const existing = formatted.find((d) => d.date === dateStr);

        if (existing) {
          filledData.push(existing);
        } else {
          filledData.push({
            date: dateStr,
            messages: 0,
            voiceTime: 0,
            reactions: 0,
            xpEarned: 0,
          });
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      res.json(filledData);
    } catch (error) {
      handleRouteError(
        res,
        "Error fetching server activity:",
        error,
        "Failed to fetch activity data",
      );
    }
  });

  app.get("/api/activity/user/:userId", checkAuth, async (req, res) => {
    const { userId } = req.params;
    const { guildId, days = 30 } = req.query;

    if (!guildId) return res.status(400).json({ error: "Missing guildId" });
    if (!(await hasGuildAccess(req.user.id, guildId))) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const now = new Date();
    const startDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - parseInt(days),
      ),
    );
    const startDateStr = startDate.toISOString().split("T")[0];

    try {
      const activity = getUserActivityStmt.all(guildId, userId, startDateStr);

      const formatted = activity.map((entry) => ({
        date: entry.date,
        messages: entry.messages,
        voiceTime: entry.voice_time,
        reactions: entry.reactions,
        xpEarned: entry.xp_earned,
      }));

      const filledData = [];
      const currentDate = new Date(startDate);
      const endDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );

      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split("T")[0];
        const existing = formatted.find((d) => d.date === dateStr);

        if (existing) {
          filledData.push(existing);
        } else {
          filledData.push({
            date: dateStr,
            messages: 0,
            voiceTime: 0,
            reactions: 0,
            xpEarned: 0,
          });
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      res.json(filledData);
    } catch (error) {
      handleRouteError(
        res,
        "Error fetching user activity:",
        error,
        "Failed to fetch user activity",
      );
    }
  });

  app.get("/api/activity/top", checkAuth, async (req, res) => {
    const { guildId, days = 7, metric = "xpEarned" } = req.query;

    if (!guildId) return res.status(400).json({ error: "Missing guildId" });
    if (!(await hasGuildAccess(req.user.id, guildId))) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const allowedMetrics = ["messages", "voiceTime", "reactions", "xpEarned"];
    if (!allowedMetrics.includes(metric)) {
      return res.status(400).json({ error: "Invalid metric" });
    }

    const now = new Date();
    const startDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - parseInt(days),
      ),
    );
    const startDateStr = startDate.toISOString().split("T")[0];

    try {
      const columnMap = {
        messages: "messages",
        voiceTime: "voice_time",
        reactions: "reactions",
        xpEarned: "xp_earned",
      };
      const orderColumn = columnMap[metric];

      const topUsers = db
        .prepare(
          `SELECT user_id,
                  SUM(${orderColumn}) AS total
           FROM user_daily_activities
           WHERE guild_id = ? AND date >= ?
           GROUP BY user_id
           ORDER BY total DESC
           LIMIT 10`,
        )
        .all(guildId, startDateStr);

      const enriched = await Promise.all(
        topUsers.map(async (entry) => {
          let userTag = "Unknown User";
          let avatarUrl = null;
          try {
            const user = await client.users.fetch(entry.user_id);
            userTag = user.tag;
            avatarUrl = user.displayAvatarURL();
          } catch (e) {
            // User might have left or bot can't see them
          }
          return {
            userId: entry.user_id,
            value: entry.total,
            username: userTag,
            avatar: avatarUrl,
          };
        }),
      );

      res.json(enriched);
    } catch (error) {
      handleRouteError(
        res,
        "Error fetching top activity:",
        error,
        "Failed to fetch top activity",
      );
    }
  });
}

module.exports = registerActivityRoutes;

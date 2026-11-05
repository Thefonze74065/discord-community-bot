const db = require("../../lib/database");
const { handleRouteError } = require("../errors");

function registerTtsRoutes(app, { client, checkAuth, hasGuildAccess }) {
  const getTtsLogsStmt = db.prepare(
    "SELECT * FROM tts_logs WHERE guild_id = ? AND timestamp >= ? ORDER BY timestamp ASC",
  );
  const getTtsUserAggStmt = db.prepare(
    `SELECT user_id,
            COUNT(*) AS count,
            SUM(character_count) AS total_chars,
            SUM(audio_seconds) AS total_audio
     FROM tts_logs
     WHERE guild_id = ? AND timestamp >= ?
     GROUP BY user_id
     ORDER BY count DESC
     LIMIT 20`,
  );

  app.get("/api/tts/stats", checkAuth, async (req, res) => {
    const guildId = req.query.guild_id;
    const days = parseInt(req.query.days) || 30;

    if (!guildId) return res.status(400).json({ error: "Missing guild_id" });

    if (!(await hasGuildAccess(req.user.id, guildId))) {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      const now = new Date();
      let startDate;
      let resolution = "day";

      if (days <= 1) {
        resolution = "hour";
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else {
        startDate = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - days,
          ),
        );
      }

      const startDateStr = startDate.toISOString();

      const logs = getTtsLogsStmt.all(guildId, startDateStr);

      const dataMap = new Map();

      if (resolution === "hour") {
        for (let i = 0; i <= 24; i++) {
          const d = new Date(startDate.getTime() + i * 60 * 60 * 1000);
          const key = d.toISOString().slice(0, 13).replace("T", " ") + ":00";
          dataMap.set(key, {
            label: key.split(" ")[1],
            count: 0,
            chars: 0,
            audioSeconds: 0,
            fullDate: key,
          });
        }

        logs.forEach((log) => {
          const d = new Date(log.timestamp);
          const key = d.toISOString().slice(0, 13).replace("T", " ") + ":00";
          if (dataMap.has(key)) {
            const entry = dataMap.get(key);
            entry.count++;
            entry.chars += log.character_count;
            entry.audioSeconds += log.audio_seconds || 0;
          }
        });
      } else {
        for (let i = 0; i <= days; i++) {
          const d = new Date(startDate);
          d.setUTCDate(d.getUTCDate() + i);
          const key = d.toISOString().split("T")[0];
          dataMap.set(key, {
            label: key,
            count: 0,
            chars: 0,
            audioSeconds: 0,
            fullDate: key,
          });
        }

        logs.forEach((log) => {
          const key = new Date(log.timestamp).toISOString().split("T")[0];
          if (dataMap.has(key)) {
            const entry = dataMap.get(key);
            entry.count++;
            entry.chars += log.character_count;
            entry.audioSeconds += log.audio_seconds || 0;
          }
        });
      }

      const usageData = Array.from(dataMap.values());

      const userAgg = getTtsUserAggStmt.all(guildId, startDateStr);

      const userStats = [];
      for (const u of userAgg) {
        let username = "Unknown";
        try {
          const user = await client.users.fetch(u.user_id);
          username = user.tag;
        } catch (e) {
          // ignore
        }
        const totalChars = u.total_chars || 0;
        const totalAudio = u.total_audio || 0;
        const count = u.count;
        userStats.push({
          userId: u.user_id,
          username,
          count,
          totalChars,
          avgChars: count > 0 ? Math.round(totalChars / count) : 0,
          totalAudio,
          avgAudio: count > 0 ? totalAudio / count : 0,
        });
      }

      const totalMessages = usageData.reduce((acc, cur) => acc + cur.count, 0);
      const totalChars = usageData.reduce((acc, cur) => acc + cur.chars, 0);
      const totalAudio = usageData.reduce(
        (acc, cur) => acc + (cur.audioSeconds || 0),
        0,
      );
      const avgChars =
        totalMessages > 0 ? Math.round(totalChars / totalMessages) : 0;
      const avgAudio = totalMessages > 0 ? totalAudio / totalMessages : 0;
      const overallStats = {
        totalMessages,
        totalChars,
        avgChars,
        totalAudio,
        avgAudio,
      };

      res.json({
        dailyUsage: usageData,
        userStats,
        resolution,
        overallStats,
      });
    } catch (error) {
      handleRouteError(
        res,
        "Error fetching TTS stats:",
        error,
        "Internal server error",
      );
    }
  });
}

module.exports = registerTtsRoutes;

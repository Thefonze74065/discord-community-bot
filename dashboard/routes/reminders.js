const db = require("../../lib/database");
const { handleRouteError } = require("../errors");
const { reloadCustomReminders } = require("../scheduler");

function registerRemindersRoutes(app, { client, checkAuth }) {
  const getGuildsStmt = db.prepare("SELECT * FROM guilds");

  app.get("/api/reminders", checkAuth, async (req, res) => {
    try {
      const adminGuilds = getGuildsStmt.all();
      const guildIds = adminGuilds.map((g) => g.id);

      const placeholders = guildIds.map(() => "?").join(",");
      const reminders = db
        .prepare(
          `SELECT * FROM global_reminders WHERE guild_id IN (${placeholders}) ORDER BY created_at DESC`,
        )
        .all(...guildIds);
      res.json(reminders);
    } catch (error) {
      handleRouteError(
        res,
        "Error fetching reminders:",
        error,
        "Internal server error",
      );
    }
  });

  app.post("/api/reminders", checkAuth, async (req, res) => {
    try {
      const { name, cron, message, guildId, channelId, roleId } = req.body;

      if (!name || !cron || !message) {
        return res
          .status(400)
          .json({ error: "Name, cron, and message are required" });
      }

      let targetGuildId = guildId;
      if (!targetGuildId) {
        const adminGuilds = getGuildsStmt.all();
        if (adminGuilds.length === 0) {
          return res.status(400).json({ error: "No guilds available" });
        }
        targetGuildId = adminGuilds[0].id;
      }

      const result = db
        .prepare(
          `INSERT INTO global_reminders (guild_id, channel_id, role_id, name, cron, message, created_at)
           VALUES (@guild_id, @channel_id, @role_id, @name, @cron, @message, CURRENT_TIMESTAMP)`,
        )
        .run({
          guild_id: targetGuildId,
          channel_id: channelId || null,
          role_id: roleId || null,
          name,
          cron,
          message,
        });

      const reminder = {
        id: result.lastInsertRowid,
        guild_id: targetGuildId,
        channel_id: channelId || null,
        role_id: roleId || null,
        name,
        cron,
        message,
      };

      reloadCustomReminders(client);

      res.json(reminder);
    } catch (error) {
      handleRouteError(
        res,
        "Error creating reminder:",
        error,
        "Internal server error",
      );
    }
  });

  app.put("/api/reminders/:id", checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, cron, message, guildId, channelId, roleId } = req.body;

      let targetGuildId = guildId;
      if (!targetGuildId) {
        const adminGuilds = getGuildsStmt.all();
        if (adminGuilds.length > 0) {
          targetGuildId = adminGuilds[0].id;
        }
      }

      db.prepare(
        `UPDATE global_reminders
         SET guild_id = @guild_id, channel_id = @channel_id, role_id = @role_id,
             name = @name, cron = @cron, message = @message
         WHERE id = @id`,
      ).run({
        id,
        guild_id: targetGuildId,
        channel_id: channelId || null,
        role_id: roleId || null,
        name,
        cron,
        message,
      });

      reloadCustomReminders(client);

      res.json({ id, ...req.body });
    } catch (error) {
      handleRouteError(
        res,
        "Error updating reminder:",
        error,
        "Internal server error",
      );
    }
  });

  app.delete("/api/reminders/:id", checkAuth, async (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM global_reminders WHERE id = ?").run(id);

      reloadCustomReminders(client);

      res.json({ success: true });
    } catch (error) {
      handleRouteError(
        res,
        "Error deleting reminder:",
        error,
        "Internal server error",
      );
    }
  });
}

module.exports = registerRemindersRoutes;

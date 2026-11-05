const db = require("../../lib/database");
const { handleRouteError } = require("../errors");
const logger = require("../../lib/logger");

const getGuildsStmt = db.prepare("SELECT * FROM guilds");
const getGiveawaysStmt = db.prepare(
  "SELECT * FROM giveaways WHERE guild_id = ? ORDER BY end_time DESC",
);
const getGiveawayStmt = db.prepare("SELECT * FROM giveaways WHERE id = ?");
const getGuildConfigStmt = db.prepare(
  "SELECT module_giveaways_enabled FROM guilds WHERE id = ?",
);
const createGiveawayStmt = db.prepare(
  `INSERT INTO giveaways (guild_id, channel_id, channel_name, message_id, prize, sponsors, end_time, winner_count, winners, description, created_by, ended, created_at)
   VALUES (@guild_id, @channel_id, @channel_name, @message_id, @prize, @sponsors, @end_time, @winner_count, @winners, @description, @created_by, 0, CURRENT_TIMESTAMP)`,
);
const updateGiveawayStmt = db.prepare(
  `UPDATE giveaways
   SET prize = @prize,
       sponsors = @sponsors,
       end_time = @end_time,
       winner_count = @winner_count,
       channel_id = @channel_id,
       description = @description
   WHERE id = @id`,
);
const updateGiveawayMessageStmt = db.prepare(
  "UPDATE giveaways SET message_id = @message_id WHERE id = @id",
);
const endGiveawayStmt = db.prepare(
  "UPDATE giveaways SET ended = 1, winners = @winners WHERE id = @id",
);
const deleteGiveawayStmt = db.prepare("DELETE FROM giveaways WHERE id = ?");

function registerGiveawaysRoutes(app, { client, checkAuth }) {
  app.get("/api/giveaways", checkAuth, async (req, res) => {
    const adminGuilds = getGuildsStmt.all();
    if (!adminGuilds.length) return res.json([]);
    const guildId = adminGuilds[0].id;
    const giveaways = getGiveawaysStmt.all(guildId);
    for (const g of giveaways) {
      if (!g.channel_name) g.channel_name = g.channel_id;
    }
    res.json(giveaways);
  });

  app.post("/api/giveaways", checkAuth, async (req, res) => {
    const adminGuilds = getGuildsStmt.all();
    if (!adminGuilds.length)
      return res.status(400).json({ error: "No admin guilds" });
    const guildId = adminGuilds[0].id;
    const guildConfig = getGuildConfigStmt.get(guildId);
    if (guildConfig?.module_giveaways_enabled === false) {
      return res
        .status(400)
        .json({ error: "Giveaways are disabled for this server" });
    }
    const { prize, sponsors, endTime, winnerCount, channelId, description } =
      req.body;
    if (!prize || !sponsors || !endTime || !winnerCount || !channelId) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    try {
      const result = createGiveawayStmt.run({
        guild_id: guildId,
        channel_id: channelId,
        channel_name: null,
        message_id: null,
        prize,
        sponsors: JSON.stringify(sponsors),
        end_time: new Date(endTime).toISOString(),
        winner_count: Number(winnerCount),
        winners: "[]",
        description: description || null,
        created_by: req.user.id,
      });
      const giveaway = {
        id: result.lastInsertRowid,
        guild_id: guildId,
        channel_id: channelId,
        prize,
        sponsors,
        end_time: new Date(endTime).toISOString(),
        winner_count: Number(winnerCount),
        description: description || null,
        created_by: req.user.id,
        ended: 0,
      };

      if (global._dashboardClient) {
        const botClient = global._dashboardClient;
        try {
          const channel = await botClient.channels.fetch(channelId);
          if (channel && channel.send) {
            const { EmbedBuilder } = require("discord.js");
            const embed = new EmbedBuilder()
              .setTitle(`🎉 Giveaway: ${prize}`)
              .setDescription(description || "React with 🎉 to enter!")
              .addFields(
                {
                  name: "Ends",
                  value: `<t:${Math.floor(new Date(endTime).getTime() / 1000)}:F> (<t:${Math.floor(new Date(endTime).getTime() / 1000)}:R>)`,
                },
                { name: "Winners", value: String(winnerCount) },
                {
                  name: "Sponsors",
                  value: sponsors.map((id) => `<@${id}>`).join(", "),
                },
              )
              .setColor(0x00bfff)
              .setTimestamp(new Date(endTime));
            const msg = await channel.send({
              content: `🎉 **GIVEAWAY** 🎉`,
              embeds: [embed],
            });
            await msg.react("🎉");
            updateGiveawayMessageStmt.run({
              message_id: msg.id,
              id: giveaway.id,
            });
          }
        } catch (err) {
          logger.error("[Giveaway] Failed to post embed:", err);
        }
      }
      res.json(giveaway);
    } catch (e) {
      handleRouteError(
        res,
        "Failed to create giveaway",
        e,
        "Failed to create giveaway",
      );
    }
  });

  app.put("/api/giveaways/:id", checkAuth, async (req, res) => {
    const { id } = req.params;
    const giveaway = getGiveawayStmt.get(id);
    if (!giveaway) {
      return res.status(404).json({ error: "Giveaway not found" });
    }
    const guildConfig = getGuildConfigStmt.get(giveaway.guild_id);
    if (guildConfig?.module_giveaways_enabled === false) {
      return res
        .status(400)
        .json({ error: "Giveaways are disabled for this server" });
    }
    const { prize, sponsors, endTime, winnerCount, channelId, description } =
      req.body;
    if (!prize || !sponsors || !endTime || !winnerCount || !channelId) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    try {
      updateGiveawayStmt.run({
        id,
        prize,
        sponsors: JSON.stringify(sponsors),
        end_time: new Date(endTime).toISOString(),
        winner_count: Number(winnerCount),
        channel_id: channelId,
        description: description || null,
      });

      if (global._dashboardClient && giveaway.message_id && giveaway.channel_id) {
        try {
          const botClient = global._dashboardClient;
          const channel = await botClient.channels.fetch(giveaway.channel_id);
          if (channel && channel.messages) {
            const msg = await channel.messages.fetch(giveaway.message_id);
            if (msg) {
              const { EmbedBuilder } = require("discord.js");
              const embed = new EmbedBuilder()
                .setTitle(`🎉 Giveaway: ${prize}`)
                .setDescription(
                  description || "React with 🎉 to enter!",
                )
                .addFields(
                  {
                    name: "Ends",
                    value: `<t:${Math.floor(new Date(endTime).getTime() / 1000)}:F> (<t:${Math.floor(new Date(endTime).getTime() / 1000)}:R>)`,
                  },
                  { name: "Winners", value: String(winnerCount) },
                  {
                    name: "Sponsors",
                    value: Array.isArray(sponsors)
                      ? sponsors.map((id) => `<@${id}>`).join(", ")
                      : sponsors,
                  },
                )
                .setColor(0x00bfff)
                .setTimestamp(new Date(endTime));
              await msg.edit({
                content: `🎉 **GIVEAWAY** 🎉`,
                embeds: [embed],
              });
            }
          }
        } catch (err) {
          logger.error(
            `[Giveaway] Failed to update giveaway embed in Discord:`,
            err,
          );
        }
      }

      const updated = { ...giveaway, prize, sponsors, end_time: new Date(endTime).toISOString(), winner_count: Number(winnerCount), channel_id: channelId, description: description || null };
      res.json(updated);
    } catch (e) {
      handleRouteError(
        res,
        `[Giveaway] Failed to update giveaway ${id}:`,
        e,
        "Failed to update giveaway",
      );
    }
  });

  app.post("/api/giveaways/:id/end", checkAuth, async (req, res) => {
    const { id } = req.params;
    try {
      logger.info(`[Giveaway] Attempting to end giveaway: ${id}`);
      const giveaway = getGiveawayStmt.get(id);
      if (!giveaway) {
        return res.status(404).json({ error: "Giveaway not found" });
      }
      const guildConfig = getGuildConfigStmt.get(giveaway.guild_id);
      if (guildConfig?.module_giveaways_enabled === false) {
        return res
          .status(400)
          .json({ error: "Giveaways are disabled for this server" });
      }
      const updatedGiveaway = { ...giveaway, ended: 1 };
      endGiveawayStmt.run({ winners: "[]", id });

      if (global._dashboardClient) {
        try {
          const scheduler = require("../events/giveawayScheduler");
          await scheduler.endGiveaway(updatedGiveaway, global._dashboardClient);
          logger.info(`[Giveaway] endGiveaway() called successfully for ${id}`);
        } catch (err) {
          logger.error(
            `[Giveaway] Error in scheduler.endGiveaway for ${id}:`,
            err,
          );
          return res
            .status(500)
            .json({ error: "Failed to end giveaway (bot error)" });
        }
      } else {
        logger.warn(
          `[Giveaway] _dashboardClient not available when ending giveaway ${id}`,
        );
      }
      res.json({ success: true });
    } catch (e) {
      handleRouteError(
        res,
        `[Giveaway] Failed to end giveaway ${id}:`,
        e,
        "Failed to end giveaway",
      );
    }
  });

  app.post("/api/giveaways/:id/reroll", checkAuth, async (req, res) => {
    const { id } = req.params;
    const { rerollAll } = req.body;
    try {
      logger.info(
        `[Giveaway] Attempting to reroll giveaway: ${id} (rerollAll: ${rerollAll})`,
      );
      const giveaway = getGiveawayStmt.get(id);
      if (!giveaway) {
        return res.status(404).json({ error: "Giveaway not found" });
      }

      const guildConfig = getGuildConfigStmt.get(giveaway.guild_id);
      if (guildConfig?.module_giveaways_enabled === false) {
        return res
          .status(400)
          .json({ error: "Giveaways are disabled for this server" });
      }

      if (!giveaway.ended) {
        return res
          .status(400)
          .json({ error: "Cannot reroll an active giveaway" });
      }

      if (global._dashboardClient) {
        try {
          const scheduler = require("../events/giveawayScheduler");
          const newWinners = await scheduler.rerollGiveaway(
            giveaway,
            global._dashboardClient,
            rerollAll || false,
          );
          logger.info(
            `[Giveaway] Reroll successful for ${id}. New winners: ${newWinners.join(", ")}`,
          );
          res.json({ success: true, winners: newWinners });
        } catch (err) {
          logger.error(
            `[Giveaway] Error in scheduler.rerollGiveaway for ${id}:`,
            err,
          );
          return res
            .status(500)
            .json({ error: err.message || "Failed to reroll giveaway" });
        }
      } else {
        logger.warn(
          `[Giveaway] _dashboardClient not available when rerolling giveaway ${id}`,
        );
        return res.status(503).json({ error: "Bot client not available" });
      }
    } catch (e) {
      handleRouteError(
        res,
        `[Giveaway] Failed to reroll giveaway ${id}:`,
        e,
        "Failed to reroll giveaway",
      );
    }
  });

  app.delete("/api/giveaways/:id", checkAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const giveaway = getGiveawayStmt.get(id);
      if (!giveaway)
        return res.status(404).json({ error: "Giveaway not found" });

      if (global._dashboardClient && giveaway.message_id && giveaway.channel_id) {
        try {
          const botClient = global._dashboardClient;
          const channel = await botClient.channels.fetch(giveaway.channel_id);
          if (channel && channel.messages) {
            try {
              const msg = await channel.messages.fetch(giveaway.message_id);
              if (msg) await msg.delete();
            } catch (msgErr) {
              if (
                msgErr.code === 10008 ||
                (msgErr.message && msgErr.message.includes("Unknown Message"))
              ) {
                logger.warn(
                  `[Giveaway] Embed message already deleted or not found for giveaway ${id}`,
                );
              } else {
                logger.error(
                  `[Giveaway] Error fetching/deleting giveaway embed:`,
                  msgErr,
                );
              }
            }
          }
        } catch (err) {
          logger.error(
            `[Giveaway] Failed to delete giveaway embed in Discord:`,
            err,
          );
        }
      }

      deleteGiveawayStmt.run(id);
      res.json({ success: true });
    } catch (e) {
      handleRouteError(
        res,
        `[Giveaway] Failed to delete giveaway ${id}:`,
        e,
        "Failed to delete giveaway",
      );
    }
  });
}

module.exports = registerGiveawaysRoutes;

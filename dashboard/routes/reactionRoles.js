const db = require("../../lib/database");
const { handleRouteError } = require("../errors");
const logger = require("../../lib/logger");

function registerReactionRolesRoutes(
  app,
  { client, checkAuth, hasGuildAccess },
) {
  app.get("/api/guilds/:guildId/roles", checkAuth, async (req, res) => {
    const { guildId } = req.params;
    try {
      if (!(await hasGuildAccess(req.user.id, guildId))) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        try {
          await client.guilds.fetch(guildId);
        } catch (e) {
          return res.status(404).json({ error: "Guild not found" });
        }
      }

      const fetchedGuild = client.guilds.cache.get(guildId);
      if (!fetchedGuild)
        return res.status(404).json({ error: "Guild not found" });

      const roles = fetchedGuild.roles.cache
        .filter((r) => r.name !== "@everyone")
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.hexColor,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json(roles);
    } catch (error) {
      handleRouteError(
        res,
        "Error fetching roles:",
        error,
        "Failed to fetch roles",
      );
    }
  });

  app.get("/api/reaction-roles/:messageId", checkAuth, async (req, res) => {
    try {
      const rrs = db
        .prepare("SELECT * FROM reaction_roles WHERE message_id = ?")
        .all(req.params.messageId);

      if (rrs.length > 0) {
        if (!(await hasGuildAccess(req.user.id, rrs[0].guild_id))) {
          return res.status(403).json({ error: "Unauthorized" });
        }
      }

      res.json(rrs);
    } catch (error) {
      handleRouteError(
        res,
        "Error fetching reaction roles:",
        error,
        "Failed to fetch reaction roles",
      );
    }
  });

  app.post("/api/reaction-roles", checkAuth, async (req, res) => {
    const { guildId, channelId, messageId, emoji, roleId } = req.body;

    if (!guildId || !channelId || !messageId || !emoji || !roleId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      if (!(await hasGuildAccess(req.user.id, guildId))) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const channel = await client.channels.fetch(channelId);
      if (!channel) return res.status(404).json({ error: "Channel not found" });

      const message = await channel.messages.fetch(messageId);
      if (!message) return res.status(404).json({ error: "Message not found" });

      const customEmojiRegex = /<a?:.+?:(\d+)>/;
      const match = emoji.match(customEmojiRegex);
      const emojiId = match ? match[1] : emoji;

      try {
        await message.react(emojiId);
      } catch (e) {
        return res.status(400).json({
          error:
            "Bot cannot react with this emoji. Is it from a server the bot is in?",
        });
      }

      try {
        db.prepare(
          "INSERT INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id) VALUES (@guild_id, @channel_id, @message_id, @emoji, @role_id)",
        ).run({
          guild_id: guildId,
          channel_id: channelId,
          message_id: messageId,
          emoji: emojiId,
          role_id: roleId,
        });
      } catch (error) {
        return res
          .status(409)
          .json({ error: "This emoji is already used on this message." });
      }

      res.json({ guildId, channelId, messageId, emoji: emojiId, roleId });
    } catch (error) {
      handleRouteError(
        res,
        "Error adding reaction role:",
        error,
        "Failed to add reaction role: " + error.message,
      );
    }
  });

  app.delete("/api/reaction-roles", checkAuth, async (req, res) => {
    const { messageId, emoji, channelId } = req.body;

    if (!messageId || !emoji) {
      return res.status(400).json({ error: "Missing messageId or emoji" });
    }

    try {
      const rr = db
        .prepare(
          "SELECT * FROM reaction_roles WHERE message_id = ? AND emoji = ?",
        )
        .get(messageId, emoji);

      if (!rr) {
        return res.status(404).json({ error: "Reaction role not found" });
      }

      if (!(await hasGuildAccess(req.user.id, rr.guild_id))) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      db.prepare(
        "DELETE FROM reaction_roles WHERE message_id = ? AND emoji = ?",
      ).run(messageId, emoji);

      if (channelId) {
        try {
          const channel = await client.channels.fetch(channelId);
          const message = await channel.messages.fetch(messageId);
          const reaction = message.reactions.cache.get(emoji);
          if (reaction) {
            await reaction.users.remove(client.user.id);
          }
        } catch (e) {
          logger.warn("Could not remove bot reaction:", e.message);
        }
      }

      res.json({ success: true });
    } catch (error) {
      handleRouteError(
        res,
        "Error removing reaction role:",
        error,
        "Failed to remove reaction role",
      );
    }
  });
}

module.exports = registerReactionRolesRoutes;

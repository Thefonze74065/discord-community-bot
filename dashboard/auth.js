const { PermissionsBitField } = require("discord.js");
const db = require("../../lib/database");
const logger = require("../../lib/logger");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");

function createAuth(client) {
  const checkAuth = (req, res, next) => {
    if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") {
      if (!req.user) {
        const guilds = client.guilds.cache.map((g) => ({
          id: g.id, name: g.name, icon: g.icon, owner: true,
          permissions: "8", features: [], permissions_new: "8",
        }));
        req.user = {
          id: "test-admin-id", username: "Test Admin", discriminator: "0000",
          avatar: null, guilds,
        };
        req.session.passport = { user: req.user };
      }
      return next();
    }
    if (req.isAuthenticated()) return next();
    if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Unauthorized" });
    res.redirect("/login.html");
  };

  async function hasGuildAccess(userId, guildId) {
    if ((process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") && userId === "test-admin-id") return true;
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return false;
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return false;
      if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
      const guildSettings = getGuildStmt.get(guildId);
      if (!guildSettings) return false;
      if (guildSettings.admin_role_id && member.roles.cache.has(guildSettings.admin_role_id)) return true;
      if (guildSettings.moderator_role_id && member.roles.cache.has(guildSettings.moderator_role_id)) return true;
      return false;
    } catch (err) {
      logger.error(`Error checking access for ${userId} in ${guildId}:`, err);
      return false;
    }
  }

  async function hasGuildAdmin(userId, guildId) {
    if ((process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") && userId === "test-admin-id") return true;
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return false;
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return false;
      if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
      const guildSettings = getGuildStmt.get(guildId);
      if (!guildSettings) return false;
      if (guildSettings.admin_role_id && member.roles.cache.has(guildSettings.admin_role_id)) return true;
      return false;
    } catch (err) {
      logger.error(`Error checking admin access for ${userId} in ${guildId}:`, err);
      return false;
    }
  }

  return { checkAuth, hasGuildAccess, hasGuildAdmin };
}

module.exports = { createAuth };

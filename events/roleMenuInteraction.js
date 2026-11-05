const { Events } = require("discord.js");
const db = require("../lib/database");
const logger = require("../lib/logger");

const getRoleMenuStmt = db.prepare(
  "SELECT * FROM role_menus WHERE message_id = ?",
);
const getRoleMenuOptionsStmt = db.prepare(
  "SELECT * FROM role_menu_options WHERE menu_id = ?",
);
const getGuildStmt = db.prepare(
  "SELECT module_role_menus_enabled FROM guilds WHERE id = ?",
);

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== "role-menu-select") return;

    await interaction.deferReply({ ephemeral: true });

    try {
      const messageId = interaction.message.id;
      const selectedRoleIds = interaction.values;

      const roleMenu = getRoleMenuStmt.get(messageId);

      if (!roleMenu) {
        return interaction.editReply({
          content: "This role menu is no longer active.",
        });
      }

      const options = getRoleMenuOptionsStmt.all(roleMenu.id);

      const guildConfig = getGuildStmt.get(roleMenu.guild_id);

      if (guildConfig?.module_role_menus_enabled === false) {
        return interaction.editReply({
          content: "Role menus are disabled for this server.",
        });
      }

      const member = interaction.member;
      const allOptionRoleIds = options.map((o) => o.role_id);

      const rolesToRemove = allOptionRoleIds.filter(
        (id) => !selectedRoleIds.includes(id),
      );
      const rolesToAdd = selectedRoleIds;

      if (rolesToRemove.length > 0) {
        const toRemove = rolesToRemove.filter((id) =>
          member.roles.cache.has(id),
        );
        if (toRemove.length > 0) {
          try {
            await member.roles.remove(toRemove);
          } catch (err) {
            logger.error(
              `Failed to remove roles for ${member.user.tag}:`,
              err,
            );
            throw new Error(
              "Failed to remove some roles. Check bot hierarchy.",
            );
          }
        }
      }

      if (rolesToAdd.length > 0) {
        const toAdd = rolesToAdd.filter((id) => !member.roles.cache.has(id));
        if (toAdd.length > 0) {
          try {
            await member.roles.add(toAdd);
          } catch (err) {
            logger.error(`Failed to add roles for ${member.user.tag}:`, err);
            throw new Error("Failed to add some roles. Check bot hierarchy.");
          }
        }
      }

      const addedNames = options
        .filter((o) => rolesToAdd.includes(o.role_id))
        .map((o) => o.label)
        .join(", ");

      await interaction.editReply({
        content: `✅ Roles updated: **${addedNames || "None"}**`,
      });
    } catch (error) {
      logger.error("Error handling role menu:", error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`,
      });
    }
  },
};

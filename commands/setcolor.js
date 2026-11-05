const { createExecute, guard } = require("../lib/commandWrapper");
const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const db = require("../lib/database");
const logger = require("../lib/logger");
const { withTimeout } = require("../lib/timers");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");
const getUserLevelStmt = db.prepare("SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?");
const getLevelRewardsStmt = db.prepare(
  "SELECT * FROM level_rewards WHERE guild_id = ? AND level <= ? AND color_role_id IS NOT NULL ORDER BY level ASC",
);

async function getSelectableColorChoices(interaction, input = "") {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  const [guildConfig, userLevel] = [
    withTimeout(getGuildStmt.get(guildId), 2000, () => null),
    withTimeout(getUserLevelStmt.get(userId, guildId), 2000, () => null),
  ];

  const byRole = new Map();

  if (userLevel) {
    const rewards = getLevelRewardsStmt.all(guildId, userLevel.level);
    for (const reward of rewards) {
      if (!reward.color_role_id) continue;
      byRole.set(reward.color_role_id, { unlockedLevel: reward.level, source: "rank" });
    }
  }

  if (interaction.member.premiumSince && guildConfig?.booster_color_role_id) {
    byRole.set(guildConfig.booster_color_role_id, { unlockedLevel: null, source: "booster" });
  }

  const search = String(input || "").toLowerCase();
  const choices = [];

  for (const [roleId, meta] of byRole.entries()) {
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) continue;

    const label = meta.source === "booster" ? `${role.name} (Booster)` : `${role.name} (Lvl ${meta.unlockedLevel}+)`;

    if (search && !label.toLowerCase().includes(search) && !role.name.toLowerCase().includes(search)) {
      continue;
    }

    choices.push({ name: label, value: roleId, source: meta.source, unlockedLevel: meta.unlockedLevel });
  }

  choices.sort((a, b) => {
    if (a.source === b.source) {
      if (a.unlockedLevel === null && b.unlockedLevel === null) return 0;
      if (a.unlockedLevel === null) return 1;
      if (b.unlockedLevel === null) return -1;
      return a.unlockedLevel - b.unlockedLevel;
    }
    if (a.source === "rank") return -1;
    return 1;
  });

  return choices.slice(0, 25);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setcolor")
    .setDescription("Set your displayed color from unlocked rank or booster colors.")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Choose a color role")
        .addStringOption((option) =>
          option.setName("color").setDescription("An unlocked rank color or booster color").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("clear").setDescription("Remove your selected color role"),
    ),

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name !== "color") {
      await interaction.respond([]);
      return;
    }

    try {
      const choices = await withTimeout(getSelectableColorChoices(interaction, focusedOption.value), 2000, () => {
        logger.error("Color autocomplete timed out.");
        return [];
      });
      await interaction.respond(choices.map((choice) => ({ name: choice.name, value: choice.value })));
    } catch (error) {
      logger.error("Autocomplete error in /setcolor:", error);
      await interaction.respond([]);
    }
  },

  execute: createExecute(
    { flags: MessageFlags.Ephemeral },
    async (interaction) => {
      await guard(
        interaction,
        {
          logMessage: "Error executing /setcolor:",
          errorReply: {
            content: "Failed to update your color. Please ensure the bot can manage the configured color roles.",
            flags: MessageFlags.Ephemeral,
          },
        },
        async () => {
          const subcommand = interaction.options.getSubcommand();
          const choices = await getSelectableColorChoices(interaction);

          if (choices.length === 0) {
            await interaction.editReply({
              content: "You do not have any available color roles yet. Level up to unlock one, or boost the server if a booster color is configured.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const selectableRoleIds = choices.map((choice) => choice.value);

          if (subcommand === "clear") {
            const equippedSelectableRoles = selectableRoleIds.filter((roleId) => interaction.member.roles.cache.has(roleId));
            if (equippedSelectableRoles.length === 0) {
              await interaction.editReply({ content: "You do not currently have a selectable color role equipped.", flags: MessageFlags.Ephemeral });
              return;
            }
            await interaction.member.roles.remove(equippedSelectableRoles);
            await interaction.editReply({ content: "Removed your selected color role.", flags: MessageFlags.Ephemeral });
            return;
          }

          const selectedRoleId = interaction.options.getString("color", true);
          if (!selectableRoleIds.includes(selectedRoleId)) {
            await interaction.editReply({ content: "That color is not available to you right now.", flags: MessageFlags.Ephemeral });
            return;
          }

          const rolesToRemove = selectableRoleIds.filter(
            (roleId) => roleId !== selectedRoleId && interaction.member.roles.cache.has(roleId),
          );
          if (rolesToRemove.length > 0) {
            await interaction.member.roles.remove(rolesToRemove);
          }

          if (!interaction.member.roles.cache.has(selectedRoleId)) {
            await interaction.member.roles.add(selectedRoleId);
          }

          const selectedRole = interaction.guild.roles.cache.get(selectedRoleId);
          await interaction.editReply({
            content: `Selected display color: ${selectedRole || `<@&${selectedRoleId}>`}`,
            flags: MessageFlags.Ephemeral,
          });
        },
      );
    },
  ),
};

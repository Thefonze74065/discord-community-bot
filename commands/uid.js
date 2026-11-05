const { createExecute } = require("../lib/commandWrapper");
const { SlashCommandBuilder } = require("discord.js");
const db = require("../lib/database");

const GAME_REGIONS = {
  "Where Winds Meet": ["China (HMT)", "Global (ROTW)"],
  "Arkknights Endfield": ["Americas/Europe", "Asia"],
  "The critically acclaimed MMORPG Final Fantasy XIV": [
    "Aether", "Crystal", "Dynamis", "Primal", "Chaos", "Light", "Elemental",
    "Gaia", "Mana", "Meteor", "Materia",
  ],
};

const upsertUserGameAccountStmt = db.prepare(
  `INSERT INTO user_game_accounts (user_id, guild_id, game, uid, region, created_at, updated_at)
   VALUES (@user_id, @guild_id, @game, @uid, @region, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
   ON CONFLICT(user_id, guild_id, game) DO UPDATE SET uid = excluded.uid, region = excluded.region, updated_at = CURRENT_TIMESTAMP`,
);
const deleteUserGameAccountsStmt = db.prepare(
  "DELETE FROM user_game_accounts WHERE user_id = @user_id AND guild_id = @guild_id AND game = @game",
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("uid")
    .setDescription("Manage your game UIDs")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set your UID for a game")
        .addStringOption((opt) => opt.setName("game").setDescription("Game name").setRequired(true).setAutocomplete(true))
        .addStringOption((opt) => opt.setName("uid").setDescription("Your UID").setRequired(true))
        .addStringOption((opt) => opt.setName("region").setDescription("Account region").setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((sub) =>
      sub.setName("remove").setDescription("Remove your UID for a game")
        .addStringOption((opt) => opt.setName("game").setDescription("Game name").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List UIDs")
        .addStringOption((opt) => opt.setName("game").setDescription("Filter by game"))
        .addStringOption((opt) => opt.setName("region").setDescription("Filter by region")),
    ),

  execute: createExecute({ ephemeral: true }, async (interaction) => {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    if (sub === "set") {
      const game = interaction.options.getString("game");
      const uid = interaction.options.getString("uid");
      const region = interaction.options.getString("region");
      if (GAME_REGIONS[game] && !GAME_REGIONS[game].includes(region)) {
        return interaction.editReply({ content: `Invalid region for ${game}. Valid regions: ${GAME_REGIONS[game].join(", ")}`, ephemeral: true });
      }
      upsertUserGameAccountStmt.run({ user_id: userId, guild_id: guildId, game, uid, region });
      return interaction.editReply({ content: `UID for ${game} (${region}) set to: ${uid}`, ephemeral: true });
    }

    if (sub === "remove") {
      const game = interaction.options.getString("game");
      const result = deleteUserGameAccountsStmt.run({ user_id: userId, guild_id: guildId, game });
      if (result.changes === 0) {
        return interaction.editReply({ content: `No UID found for ${game}.`, ephemeral: true });
      }
      return interaction.editReply({ content: `UID for ${game} removed.`, ephemeral: true });
    }

    if (sub === "list") {
      const game = interaction.options.getString("game");
      const region = interaction.options.getString("region");
      let where = `guild_id = @guild_id AND user_id = @user_id`;
      const params = { guild_id: guildId, user_id: userId };
      if (game) { where += " AND game = @game"; params.game = game; }
      if (region) { where += " AND region = @region"; params.region = region; }
      const accounts = db.prepare(`SELECT * FROM user_game_accounts WHERE ${where} ORDER BY game ASC, region ASC`).all(params);
      if (!accounts.length) {
        return interaction.editReply({ content: "You have no UIDs saved.", ephemeral: true });
      }
      let msg = `Your saved UIDs`;
      if (game) msg += ` for **${game}**`;
      if (region) msg += ` (${region})`;
      msg += ":\n";
      for (const acc of accounts) {
        msg += `• ${acc.game} (${acc.region}): \`${acc.uid}\`\n`;
      }
      return interaction.editReply({ content: msg });
    }
  }),

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === "game") {
      const input = focusedOption.value.toLowerCase();
      const games = Object.keys(GAME_REGIONS);
      const filtered = games.filter((g) => g.toLowerCase().includes(input));
      await interaction.respond(filtered.map((g) => ({ name: g, value: g })));
    } else if (focusedOption.name === "region") {
      const game = interaction.options.getString("game") || "";
      const input = focusedOption.value.toLowerCase();
      const regions = GAME_REGIONS[game] || [];
      const filtered = regions.filter((r) => r.toLowerCase().includes(input));
      await interaction.respond(filtered.map((r) => ({ name: r, value: r })));
    }
  },
};

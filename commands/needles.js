const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../lib/database");
const {
  CURRENCY_NAME, CURRENCY_EMOJI, formatNeedles, adjustBalance, getWallet, requireCasino,
} = require("../lib/economy");

const getTopWalletsStmt = db.prepare(
  "SELECT * FROM wallets WHERE guild_id = ? ORDER BY balance DESC LIMIT 10",
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("needles")
    .setDescription(`${CURRENCY_NAME} leaderboard and gifts`)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub.setName("leaderboard").setDescription(`Show the 10 richest members in ${CURRENCY_NAME}`),
    )
    .addSubcommand((sub) =>
      sub
        .setName("give")
        .setDescription(`Give some of your ${CURRENCY_NAME} to another member`)
        .addUserOption((opt) => opt.setName("user").setDescription("Who to give to").setRequired(true))
        .addIntegerOption((opt) =>
          opt.setName("amount").setDescription("How many to give").setRequired(true).setMinValue(1),
        ),
    ),
  async execute(interaction) {
    const config = await requireCasino(interaction);
    if (!config) return;

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "leaderboard") {
      const top = getTopWalletsStmt.all(guildId);
      if (top.length === 0) {
        return interaction.reply({ content: `Nobody has any ${CURRENCY_NAME} yet. Try /daily!`, ephemeral: true });
      }
      const medals = ["🥇", "🥈", "🥉"];
      const lines = top.map(
        (w, i) =>
          `${medals[i] || `**${i + 1}.**`} <@${w.user_id}> — ${w.balance.toLocaleString("en-US")} ${CURRENCY_EMOJI}`,
      );
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`${CURRENCY_EMOJI} ${CURRENCY_NAME} Leaderboard`)
        .setDescription(lines.join("\n"));
      return interaction.reply({ embeds: [embed], allowedMentions: { users: [] } });
    }

    const targetUser = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    if (targetUser.bot) {
      return interaction.reply({ content: "Bots don't carry needles.", ephemeral: true });
    }

    if (sub === "give") {
      if (!config.casino_transfers_enabled) {
        return interaction.reply({ content: "Giving needles to other members is turned off in this server.", ephemeral: true });
      }
      if (targetUser.id === interaction.user.id) {
        return interaction.reply({ content: "You can't give needles to yourself.", ephemeral: true });
      }
      const sender = adjustBalance(interaction.user.id, guildId, -amount, config);
      if (!sender) {
        const wallet = getWallet(interaction.user.id, guildId, config);
        return interaction.reply({ content: `You only have ${formatNeedles(wallet.balance)}.`, ephemeral: true });
      }
      adjustBalance(targetUser.id, guildId, amount, config);
      return interaction.reply({ content: `${interaction.user} gave ${formatNeedles(amount)} to ${targetUser}.` });
    }
  },
};

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../lib/database");
const { getMemberRank } = require("../lib/permissions");
const {
  CURRENCY_NAME, formatNeedles, getWallet, requireCasino,
} = require("../lib/economy");

const updateWalletBalanceStmt = db.prepare(
  "UPDATE wallets SET balance = @balance, updated_at = CURRENT_TIMESTAMP WHERE user_id = @user_id AND guild_id = @guild_id",
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setneedles")
    .setDescription(`Set a member's ${CURRENCY_NAME} balance`)
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The user to modify").setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt.setName("amount").setDescription("The new balance").setRequired(true).setMinValue(0),
    ),
  async execute(interaction) {
    const config = await requireCasino(interaction);
    if (!config) return;

    if (getMemberRank(interaction.member, config) < 2) {
      return interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
    }

    const targetUser = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    const guildId = interaction.guildId;
    if (targetUser.bot) {
      return interaction.reply({ content: "Bots don't carry needles.", ephemeral: true });
    }

    await getWallet(targetUser.id, guildId, config);
    updateWalletBalanceStmt.run({ balance: amount, user_id: targetUser.id, guild_id: guildId });
    await interaction.reply({ content: `Set ${targetUser}'s balance to ${formatNeedles(amount)}.`, ephemeral: true });
  },
};

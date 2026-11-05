const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../lib/database");
const { getXpForLevel } = require("../lib/leveling");

const getUserLevelStmt = db.prepare("SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?");
const getHighestRewardStmt = db.prepare(
  "SELECT * FROM level_rewards WHERE guild_id = ? AND level <= ? ORDER BY level DESC LIMIT 1",
);
const getUserGameAccountStmt = db.prepare(
  "SELECT * FROM user_game_accounts WHERE user_id = ? AND guild_id = ? AND game = ?",
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level")
    .setDescription("Check your current activity level and stats.")
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName("user").setDescription("The user to check (defaults to yourself)").setRequired(false),
    ),
  execute: async (interaction) => {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const guildId = interaction.guild.id;

    const userLevel = getUserLevelStmt.get(targetUser.id, guildId);
    if (!userLevel) {
      return interaction.editReply({ content: `${targetUser.username} has not earned any XP yet.`, ephemeral: true });
    }

    const highestReward = getHighestRewardStmt.get(guildId, userLevel.level);
    let rankName = "None";
    if (highestReward) {
      const role = interaction.guild.roles.cache.get(highestReward.role_id);
      if (role) rankName = role.name;
    }

    const nextLevelXp = getXpForLevel(userLevel.level + 1);
    const currentLevelXp = getXpForLevel(userLevel.level);
    const progress = userLevel.xp - currentLevelXp;
    const needed = nextLevelXp - currentLevelXp;
    const percent = Math.floor((progress / needed) * 100);
    const barLength = 20;
    const filledLength = Math.floor((barLength * percent) / 100);
    const emptyLength = barLength - filledLength;
    const progressBar = "█".repeat(filledLength) + "░".repeat(emptyLength);

    const wwmAccount = getUserGameAccountStmt.get(targetUser.id, guildId, "Where Winds Meet");

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`Level Stats for ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: "Rank", value: rankName, inline: true },
        { name: "Level", value: `${userLevel.level}`, inline: true },
        { name: "Total XP", value: `${userLevel.xp}`, inline: true },
        { name: "Progress", value: `${progressBar} ${percent}%`, inline: false },
        { name: "XP Needed", value: `${nextLevelXp - userLevel.xp}`, inline: true },
        { name: "Messages Sent", value: `${userLevel.messages}`, inline: true },
        { name: "Reactions", value: `${userLevel.reactions || 0}`, inline: true },
        { name: "Voice Time", value: `${userLevel.voice_time} mins`, inline: true },
      );

    if (wwmAccount) {
      embed.addFields({ name: "Where Winds Meet", value: `${wwmAccount.region}: \`${wwmAccount.uid}\``, inline: true });
    }

    embed.setFooter({ text: "Keep chatting to level up!" });
    await interaction.editReply({ embeds: [embed] });
  },
};

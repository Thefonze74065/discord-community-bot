const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../lib/database");
const { getXpForLevel } = require("../lib/leveling");

const getUserLevelsByGuildStmt = db.prepare("SELECT * FROM user_levels WHERE guild_id = ? ORDER BY xp DESC LIMIT 10");
const getAllUserLevelsByGuildStmt = db.prepare("SELECT * FROM user_levels WHERE guild_id = ?");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the top 10 users with the most XP or near a rank")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub.setName("top").setDescription("Show the top 10 users with the most XP"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("near-rank")
        .setDescription("Show the 10 users closest to a rank (level)")
        .addIntegerOption((option) =>
          option.setName("rank").setDescription("Enter the rank/level to check").setRequired(true).setMinValue(1),
        ),
    ),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    await interaction.deferReply();

    if (subcommand === "top") {
      try {
        const topUsers = getUserLevelsByGuildStmt.all(guildId);
        if (topUsers.length === 0) {
          return interaction.editReply("No XP data found for this server yet.");
        }
        const embed = new EmbedBuilder()
          .setTitle(`🏆 ${interaction.guild.name} Leaderboard`)
          .setColor(0xffd700)
          .setTimestamp();
        let description = "";
        for (let i = 0; i < topUsers.length; i++) {
          const userLevel = topUsers[i];
          let userTag = "Unknown User";
          try {
            const member = await interaction.guild.members.fetch(userLevel.user_id);
            userTag = member.displayName;
          } catch (e) {
            try {
              const user = await interaction.client.users.fetch(userLevel.user_id);
              userTag = user.tag;
            } catch (e2) {
              userTag = "Unknown User";
            }
          }
          let rankEmoji = `#${i + 1}`;
          if (i === 0) rankEmoji = "🥇";
          if (i === 1) rankEmoji = "🥈";
          if (i === 2) rankEmoji = "🥉";
          description += `${rankEmoji} **${userTag}**\nLevel ${userLevel.level} • ${userLevel.xp.toLocaleString()} XP\n\n`;
        }
        embed.setDescription(description);
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        await interaction.editReply({ content: "An error occurred while fetching the leaderboard.", ephemeral: true });
      }
    } else if (subcommand === "near-rank") {
      const rank = interaction.options.getInteger("rank");
      if (!rank || rank < 1) {
        return interaction.editReply("Please provide a valid rank (level >= 1).");
      }
      const targetXp = getXpForLevel(rank);
      const users = getAllUserLevelsByGuildStmt.all(guildId);
      if (users.length === 0) {
        return interaction.editReply("No XP data found for this server yet.");
      }
      const notReached = users.filter((u) => u.xp < targetXp);
      notReached.sort((a, b) => targetXp - a.xp - (targetXp - b.xp));
      const closest = notReached.slice(0, 10);

      const embed = new EmbedBuilder()
        .setTitle(`🎯 Users Closest to Level ${rank}`)
        .setColor(0x3498db)
        .setTimestamp();
      let description = "";
      for (const userLevel of closest) {
        let userTag = "Unknown User";
        try {
          const member = await interaction.guild.members.fetch(userLevel.user_id);
          userTag = member.displayName;
        } catch (e) {
          try {
            const user = await interaction.client.users.fetch(userLevel.user_id);
            userTag = user.tag;
          } catch (e2) {
            userTag = "Unknown User";
          }
        }
        const xpNeeded = targetXp - userLevel.xp;
        description += `+${xpNeeded} XP — **${userTag}** (Level ${userLevel.level}, ${userLevel.xp.toLocaleString()} XP)\n`;
      }
      embed.setDescription(description || "No users found.");
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

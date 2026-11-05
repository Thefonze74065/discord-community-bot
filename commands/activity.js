const { createExecute } = require("../lib/commandWrapper");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../lib/database");

const getUserLevelStmt = db.prepare("SELECT * FROM user_levels WHERE user_id = ? AND guild_id = ?");
const recentActivityStmt = db.prepare(
  `SELECT COALESCE(SUM(messages), 0) AS messages, COALESCE(SUM(voice_time), 0) AS voice_time,
   COALESCE(SUM(reactions), 0) AS reactions, COALESCE(SUM(xp_earned), 0) AS xp_earned
   FROM user_daily_activities WHERE user_id = ? AND guild_id = ? AND date >= ?`,
);
const totalStatsStmt = db.prepare(
  `SELECT COALESCE(SUM(xp), 0) AS xp, COALESCE(SUM(messages), 0) AS messages,
   COALESCE(SUM(voice_time), 0) AS voice_time, COALESCE(SUM(reactions), 0) AS reactions
   FROM user_levels WHERE guild_id = ?`,
);
const recentServerStatsStmt = db.prepare(
  `SELECT COALESCE(SUM(xp_earned), 0) AS xp_earned, COALESCE(SUM(messages), 0) AS messages,
   COALESCE(SUM(voice_time), 0) AS voice_time, COALESCE(SUM(reactions), 0) AS reactions
   FROM user_daily_activities WHERE guild_id = ? AND date >= ?`,
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("activity")
    .setDescription("Check activity stats for a user or the server.")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("user")
        .setDescription("Check activity for a specific user")
        .addUserOption((option) =>
          option
            .setName("target")
            .setDescription("The user to check (defaults to yourself)")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("server").setDescription("Check activity stats for the entire server"),
    ),
  execute: createExecute({}, async (interaction) => {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    twoWeeksAgo.setHours(0, 0, 0, 0);
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split("T")[0];

    if (subcommand === "user") {
      const targetUser = interaction.options.getUser("target") || interaction.user;
      const userLevel = getUserLevelStmt.get(targetUser.id, guildId);
      if (!userLevel) {
        return interaction.editReply({ content: `${targetUser.username} has no recorded activity.`, ephemeral: true });
      }

      const recent = recentActivityStmt.get(targetUser.id, guildId, twoWeeksAgoStr);

      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`Activity Report: ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          {
            name: "📊 Total Activity (All Time)",
            value: `**XP:** ${userLevel.xp}\n**Messages:** ${userLevel.messages}\n**Voice:** ${userLevel.voice_time} mins\n**Reactions:** ${userLevel.reactions || 0}`,
            inline: false,
          },
          {
            name: "📅 Recent Activity (Last 14 Days)",
            value: `**XP Earned:** ${recent.xp_earned || 0}\n**Messages:** ${recent.messages || 0}\n**Voice:** ${recent.voice_time || 0} mins\n**Reactions:** ${recent.reactions || 0}`,
            inline: false,
          },
        )
        .setFooter({ text: "Stats updated every 10 minutes." });

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === "server") {
      const total = totalStatsStmt.get(guildId);
      const recent = recentServerStatsStmt.get(guildId, twoWeeksAgoStr);

      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`Server Activity Report: ${interaction.guild.name}`)
        .setThumbnail(interaction.guild.iconURL())
        .addFields(
          {
            name: "📊 Total Server Activity (All Time)",
            value: `**Total XP:** ${total.xp || 0}\n**Messages:** ${total.messages || 0}\n**Voice:** ${total.voice_time || 0} mins\n**Reactions:** ${total.reactions || 0}`,
            inline: false,
          },
          {
            name: "📅 Recent Server Activity (Last 14 Days)",
            value: `**XP Earned:** ${recent.xp_earned || 0}\n**Messages:** ${recent.messages || 0}\n**Voice:** ${recent.voice_time || 0} mins\n**Reactions:** ${recent.reactions || 0}`,
            inline: false,
          },
        )
        .setFooter({ text: "Stats updated every 10 minutes." });

      await interaction.editReply({ embeds: [embed] });
    }
  }),
};

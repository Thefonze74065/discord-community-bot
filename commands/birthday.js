const { createExecute } = require("../lib/commandWrapper");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../lib/database");

const upsertBirthdayStmt = db.prepare(
  `INSERT INTO birthdays (user_id, guild_id, day, month, year, created_at)
   VALUES (@user_id, @guild_id, @day, @month, @year, CURRENT_TIMESTAMP)
   ON CONFLICT(user_id, guild_id) DO UPDATE SET day = excluded.day, month = excluded.month, year = excluded.year`,
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Set your birthday for server celebrations!")
    .addIntegerOption((option) =>
      option.setName("day").setDescription("Day of your birthday (1-31)").setRequired(true).setMinValue(1).setMaxValue(31),
    )
    .addIntegerOption((option) =>
      option
        .setName("month")
        .setDescription("Month of your birthday")
        .setRequired(true)
        .addChoices(
          { name: "January", value: 1 }, { name: "February", value: 2 }, { name: "March", value: 3 },
          { name: "April", value: 4 }, { name: "May", value: 5 }, { name: "June", value: 6 },
          { name: "July", value: 7 }, { name: "August", value: 8 }, { name: "September", value: 9 },
          { name: "October", value: 10 }, { name: "November", value: 11 }, { name: "December", value: 12 },
        ),
    )
    .addIntegerOption((option) =>
      option
        .setName("year")
        .setDescription("Year of your birth (optional)")
        .setRequired(false)
        .setMinValue(1900)
        .setMaxValue(new Date().getFullYear()),
    ),
  execute: createExecute({ ephemeral: true }, async (interaction) => {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const day = interaction.options.getInteger("day");
    const month = interaction.options.getInteger("month");
    const year = interaction.options.getInteger("year");

    upsertBirthdayStmt.run({ user_id: userId, guild_id: guildId, day, month, year });

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let desc = `Your birthday has been set to **${day} ${months[month - 1]}`;
    if (year) desc += ` ${year}`;
    desc += `**. You will be celebrated in this server! 🎉`;

    const embed = new EmbedBuilder().setTitle("Birthday Saved!").setDescription(desc).setColor("#FFD700");
    await interaction.editReply({ embeds: [embed] });
  }),
};

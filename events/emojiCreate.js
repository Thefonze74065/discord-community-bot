const { Events, EmbedBuilder } = require("discord.js");
const { sendLog } = require("../lib/logging");

module.exports = {
  name: Events.GuildEmojiCreate,
  async execute(emoji) {
    const embed = new EmbedBuilder()
      .setTitle("Emoji Created")
      .setColor("#00FF00")
      .setThumbnail(emoji.url)
      .addFields(
        { name: "Name", value: emoji.name, inline: true },
        { name: "ID", value: emoji.id, inline: true },
        { name: "Animated", value: emoji.animated ? "Yes" : "No", inline: true }
      )
      .setTimestamp();

    await sendLog(emoji.guild, "moderation", embed);
  },
};

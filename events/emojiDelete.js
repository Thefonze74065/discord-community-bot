const { Events, EmbedBuilder } = require("discord.js");
const { sendLog } = require("../lib/logging");

module.exports = {
  name: Events.GuildEmojiDelete,
  async execute(emoji) {
    const embed = new EmbedBuilder()
      .setTitle("Emoji Deleted")
      .setColor("#FF0000")
      .setThumbnail(emoji.url)
      .addFields(
        { name: "Name", value: emoji.name, inline: true },
        { name: "ID", value: emoji.id, inline: true }
      )
      .setTimestamp();

    await sendLog(emoji.guild, "moderation", embed);
  },
};

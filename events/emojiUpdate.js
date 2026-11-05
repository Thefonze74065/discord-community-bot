const { Events, EmbedBuilder } = require("discord.js");
const { sendLog } = require("../lib/logging");

module.exports = {
  name: Events.GuildEmojiUpdate,
  async execute(oldEmoji, newEmoji) {
    const embed = new EmbedBuilder()
      .setTitle("Emoji Updated")
      .setColor("#FFFF00")
      .setThumbnail(newEmoji.url)
      .addFields({
        name: "Emoji",
        value: `<:${newEmoji.name}:${newEmoji.id}>`,
        inline: true,
      })
      .setTimestamp();

    const changes = [];
    if (oldEmoji.name !== newEmoji.name)
      changes.push(`**Name:** \`${oldEmoji.name}\` -> \`${newEmoji.name}\``);

    if (changes.length > 0) {
      embed.addFields({ name: "Changes", value: changes.join("\n") });
      await sendLog(newEmoji.guild, "moderation", embed);
    }
  },
};

const { Events, EmbedBuilder } = require("discord.js");
const { sendLog } = require("../lib/logging");

module.exports = {
  name: Events.UserUpdate,
  async execute(oldUser, newUser) {
    const client = newUser.client;

    // Username change
    if (oldUser.tag !== newUser.tag) {
      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setAuthor({ name: newUser.tag, iconURL: newUser.displayAvatarURL() })
        .setTitle("Username Changed")
        .addFields(
          { name: "Old", value: oldUser.tag, inline: true },
          { name: "New", value: newUser.tag, inline: true }
        )
        .setTimestamp();

      for (const guild of client.guilds.cache.values()) {
        if (guild.members.cache.has(newUser.id)) {
          await sendLog(guild, "message", embed);
        }
      }
    }

    // Avatar change
    if (oldUser.avatar !== newUser.avatar) {
      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setAuthor({ name: newUser.tag, iconURL: newUser.displayAvatarURL() })
        .setTitle("Avatar Changed")
        .setDescription(
          `[Old Avatar](${oldUser.displayAvatarURL()}) -> [New Avatar](${newUser.displayAvatarURL()})`
        )
        .setThumbnail(newUser.displayAvatarURL())
        .setTimestamp();

      for (const guild of client.guilds.cache.values()) {
        if (guild.members.cache.has(newUser.id)) {
          await sendLog(guild, "message", embed);
        }
      }
    }
  },
};

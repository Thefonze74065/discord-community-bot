const { Events, EmbedBuilder } = require("discord.js");
const { sendLog } = require("../lib/logging");

module.exports = {
  name: Events.GuildUpdate,
  async execute(oldGuild, newGuild) {
    const embed = new EmbedBuilder()
      .setTitle("Server Updated")
      .setColor("#FFFF00")
      .setTimestamp();

    const changes = [];
    if (oldGuild.name !== newGuild.name)
      changes.push(`**Name:** \`${oldGuild.name}\` -> \`${newGuild.name}\``);
    if (oldGuild.icon !== newGuild.icon) changes.push(`**Icon:** Changed`);
    if (oldGuild.banner !== newGuild.banner)
      changes.push(`**Banner:** Changed`);
    if (oldGuild.ownerId !== newGuild.ownerId)
      changes.push(
        `**Owner:** <@${oldGuild.ownerId}> -> <@${newGuild.ownerId}>`
      );
    if (oldGuild.verificationLevel !== newGuild.verificationLevel)
      changes.push(
        `**Verification Level:** \`${oldGuild.verificationLevel}\` -> \`${newGuild.verificationLevel}\``
      );

    if (changes.length > 0) {
      embed.addFields({ name: "Changes", value: changes.join("\n") });
      await sendLog(newGuild, "moderation", embed);
    }
  },
};

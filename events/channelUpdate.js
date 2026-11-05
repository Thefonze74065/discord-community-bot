const { Events, EmbedBuilder } = require("discord.js");
const { sendLog } = require("../lib/logging");

module.exports = {
  name: Events.ChannelUpdate,
  async execute(oldChannel, newChannel) {
    if (!newChannel.guild) return;

    // Filter out position updates as they can be spammy
    if (oldChannel.rawPosition !== newChannel.rawPosition) return;
    if (oldChannel.permissionOverwrites !== newChannel.permissionOverwrites)
      return; // Handling permission updates might be too complex for now, or we can add it.

    const embed = new EmbedBuilder()
      .setTitle("Channel Updated")
      .setColor("#FFFF00") // Yellow
      .setDescription(`<#${newChannel.id}>`)
      .addFields({ name: "ID", value: newChannel.id, inline: true })
      .setTimestamp();

    const changes = [];
    if (oldChannel.name !== newChannel.name)
      changes.push(
        `**Name:** \`${oldChannel.name}\` -> \`${newChannel.name}\``
      );
    if (oldChannel.parentId !== newChannel.parentId)
      changes.push(
        `**Category:** \`${oldChannel.parent?.name || "None"}\` -> \`${
          newChannel.parent?.name || "None"
        }\``
      );
    if (oldChannel.topic !== newChannel.topic)
      changes.push(`**Topic:** Changed`);
    if (oldChannel.nsfw !== newChannel.nsfw)
      changes.push(
        `**NSFW:** \`${oldChannel.nsfw}\` -> \`${newChannel.nsfw}\``
      );
    if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser)
      changes.push(
        `**Slowmode:** \`${oldChannel.rateLimitPerUser}s\` -> \`${newChannel.rateLimitPerUser}s\``
      );

    if (changes.length > 0) {
      embed.addFields({ name: "Changes", value: changes.join("\n") });
      await sendLog(newChannel.guild, "moderation", embed);
    }
  },
};

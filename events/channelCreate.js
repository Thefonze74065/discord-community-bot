const { Events, EmbedBuilder, ChannelType } = require("discord.js");
const { sendLog } = require("../lib/logging");

const channelTypes = {
  [ChannelType.GuildText]: "Text",
  [ChannelType.GuildVoice]: "Voice",
  [ChannelType.GuildCategory]: "Category",
  [ChannelType.GuildAnnouncement]: "Announcement",
  [ChannelType.GuildStageVoice]: "Stage",
  [ChannelType.GuildForum]: "Forum",
  [ChannelType.GuildMedia]: "Media",
};

module.exports = {
  name: Events.ChannelCreate,
  async execute(channel) {
    if (!channel.guild) return;

    const typeName = channelTypes[channel.type] || `Unknown (${channel.type})`;

    const embed = new EmbedBuilder()
      .setTitle("Channel Created")
      .setColor("#00FF00") // Green
      .addFields(
        { name: "Name", value: `#${channel.name}`, inline: true },
        { name: "Type", value: typeName, inline: true },
        {
          name: "Category",
          value: channel.parent ? channel.parent.name : "None",
          inline: true,
        },
        { name: "ID", value: channel.id, inline: true }
      )
      .setTimestamp();

    await sendLog(channel.guild, "moderation", embed);
  },
};

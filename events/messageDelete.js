const {
  Events,
  EmbedBuilder,
  AuditLogEvent,
  AttachmentBuilder,
} = require("discord.js");
const { sendLog } = require("../lib/logging");

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    if (message.partial) return; // Cannot log content if message wasn't cached
    if (message.author.bot) return; // Ignore bots
    if (!message.guild) return; // Ignore DMs

    // Get server nickname (if available)
    let nickname = null;
    try {
      const member = await message.guild.members.fetch(message.author.id);
      nickname = member && member.nickname ? member.nickname : null;
    } catch (e) {
      nickname = null;
    }

    const embed = new EmbedBuilder()
      .setColor(0xff0000) // Red
      .setAuthor({
        name: message.author.tag,
        iconURL: message.author.displayAvatarURL(),
      })
      .setTitle("Message Deleted")
      .setDescription(
        message.content
          ? message.content.length > 4090
            ? message.content.slice(0, 4090) + "..."
            : message.content
          : "*No content (maybe an embed/attachment)*",
      )
      .addFields(
        { name: "Channel", value: `<#${message.channel.id}>` },
        {
          name: "Server Nickname",
          value: nickname ? nickname : "(none)",
          inline: true,
        },
        { name: "Account Name", value: message.author.tag, inline: true },
        { name: "User ID", value: message.author.id, inline: true },
      )
      .setTimestamp();

    const files = [];
    if (message.attachments.size > 0) {
      message.attachments.forEach((attachment) => {
        // Create an attachment from the URL
        // Note: If the message is deleted, the URL might expire quickly,
        // but usually it remains accessible for a short window.
        const file = new AttachmentBuilder(attachment.url, {
          name: attachment.name,
        });
        files.push(file);
      });

      embed.addFields({
        name: "Attachments",
        value: `${message.attachments.size} attachment(s) (re-uploaded below)`,
      });
    }

    // Check who deleted it
    try {
      const fetchedLogs = await message.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MessageDelete,
      });
      const log = fetchedLogs.entries.first();
      if (
        log &&
        log.target.id === message.author.id &&
        log.extra.channel.id === message.channel.id &&
        log.createdTimestamp > Date.now() - 5000
      ) {
        embed.setFooter({ text: `Deleted by ${log.executor.tag}` });
      }
    } catch (e) {
      /* ignore */
    }

    await sendLog(message.guild, "message", embed, files, message.channel.id);
  },
};

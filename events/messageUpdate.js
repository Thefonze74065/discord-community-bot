const { Events, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { sendLog } = require("../lib/logging");

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    if (oldMessage.partial) return; // Cannot compare if old message wasn't cached
    if (newMessage.partial) await newMessage.fetch();
    if (newMessage.author.bot) return;
    if (!newMessage.guild) return;

    // Check for content changes
    const contentChanged = oldMessage.content !== newMessage.content;

    // Check for attachment removal
    // We check if old message had attachments that are NOT in the new message
    const removedAttachments = oldMessage.attachments.filter(
      (oldAtt) => !newMessage.attachments.has(oldAtt.id),
    );
    const attachmentsRemoved = removedAttachments.size > 0;

    // If nothing interesting changed, return
    if (!contentChanged && !attachmentsRemoved) return;

    const embed = new EmbedBuilder()
      .setColor(0xe67e22) // Orange
      .setAuthor({
        name: newMessage.author.tag,
        iconURL: newMessage.author.displayAvatarURL(),
      })
      .setTitle("Message Edited")
      .addFields({ name: "Channel", value: `<#${newMessage.channel.id}>` })
      .setTimestamp();

    if (contentChanged) {
      const oldContent = oldMessage.content || "*No content*";
      const newContent = newMessage.content || "*No content*";
      embed.addFields(
        {
          name: "Before",
          value:
            oldContent.length > 1020
              ? oldContent.slice(0, 1020) + "..."
              : oldContent,
        },
        {
          name: "After",
          value:
            newContent.length > 1020
              ? newContent.slice(0, 1020) + "..."
              : newContent,
        },
      );
    } else {
      embed.setDescription("**Attachments were removed from this message.**");
      const messageContent = newMessage.content || "*No content*";
      embed.addFields({
        name: "Content",
        value:
          messageContent.length > 1020
            ? messageContent.slice(0, 1020) + "..."
            : messageContent,
      });
    }

    const files = [];
    if (attachmentsRemoved) {
      removedAttachments.forEach((attachment) => {
        const file = new AttachmentBuilder(attachment.url, {
          name: attachment.name,
        });
        files.push(file);
      });

      embed.addFields({
        name: "Removed Attachments",
        value: `${removedAttachments.size} attachment(s) (re-uploaded below)`,
      });
    }

    await sendLog(
      newMessage.guild,
      "message",
      embed,
      files,
      newMessage.channel.id,
    );
  },
};

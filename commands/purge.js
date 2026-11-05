const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags,
} = require("discord.js");
const { createExecute, guard } = require("../lib/commandWrapper");
const db = require("../lib/database");
const { logModeratorAction } = require("../lib/modActions");
const { sendLog } = require("../lib/logging");
const { hasStaffAccess } = require("../lib/permissions");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk delete messages")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("count")
        .setDescription("Delete a specific number of messages")
        .addIntegerOption((option) =>
          option.setName("amount").setDescription("Number of messages to delete (max 100)").setMinValue(1).setMaxValue(100).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("time")
        .setDescription("Delete messages from a specific time range")
        .addStringOption((option) =>
          option
            .setName("duration")
            .setDescription("Time range to delete messages from")
            .setRequired(true)
            .addChoices(
              { name: "Last 5 Minutes", value: "300000" },
              { name: "Last 15 Minutes", value: "900000" },
              { name: "Last 30 Minutes", value: "1800000" },
              { name: "Last 1 Hour", value: "3600000" },
              { name: "Last 6 Hours", value: "21600000" },
              { name: "Last 12 Hours", value: "43200000" },
              { name: "Last 24 Hours", value: "86400000" },
            ),
        ),
    ),
  execute: createExecute(
    { flags: MessageFlags.Ephemeral },
    async (interaction) => {
      const guildConfig = getGuildStmt.get(interaction.guild.id);
      const hasPermission = hasStaffAccess(interaction.member, guildConfig, {
        permission: PermissionFlagsBits.ManageMessages,
      });
      if (!hasPermission) {
        return interaction.editReply({ content: "You do not have permission to use this command." });
      }

      const subcommand = interaction.options.getSubcommand();
      let deletedCount = 0;
      let logDetail = "";
      let deletedMessages = null;

      await guard(
        interaction,
        {
          logMessage: "Error purging messages:",
          errorReply: () =>
            interaction.replied
              ? null
              : {
                  content: "Failed to purge messages. Ensure they are not older than 14 days.",
                  ephemeral: true,
                },
        },
        async () => {
          if (subcommand === "count") {
            const amount = interaction.options.getInteger("amount");
            const messagesToDelete = await interaction.channel.messages.fetch({ limit: amount });
            const deleted = await interaction.channel.bulkDelete(messagesToDelete, true);
            deletedCount = deleted.size;
            deletedMessages = deleted;
            logDetail = `${deletedCount} messages`;
            await interaction.editReply({ content: `✅ Successfully purged **${deletedCount}** messages.` });
          } else if (subcommand === "time") {
            const durationMs = parseInt(interaction.options.getString("duration"));
            const cutoff = Date.now() - durationMs;
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
            const messagesToDelete = messages.filter(
              (msg) => msg.createdTimestamp > cutoff && msg.createdTimestamp > twoWeeksAgo,
            );

            if (messagesToDelete.size === 0) {
              return interaction.editReply({
                content: "No messages found in that time range (or they are older than 14 days).",
              });
            }

            const deleted = await interaction.channel.bulkDelete(messagesToDelete, true);
            deletedCount = deleted.size;
            deletedMessages = deleted;

            const durationMap = {
              300000: "5 Minutes", 900000: "15 Minutes", 1800000: "30 Minutes",
              3600000: "1 Hour", 21600000: "6 Hours", 43200000: "12 Hours", 86400000: "24 Hours",
            };
            logDetail = `Time Range: ${durationMap[durationMs]} (${deletedCount} messages)`;

            await interaction.editReply({
              content: `✅ Successfully purged **${deletedCount}** messages from the last ${durationMap[durationMs]}.`,
            });
          }

          await logModeratorAction({
            guildId: interaction.guild.id, moderatorId: interaction.user.id, action: "purge",
            targetId: null, targetTag: null, reason: null,
            details: {
              channelId: interaction.channel.id, channelName: interaction.channel.name,
              deletedCount, subcommand,
            },
          });

          if (deletedCount > 0 && deletedMessages) {
            const sortedMessages = Array.from(deletedMessages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
            let messageLog = "";
            const maxLogLength = 4000;

            for (const msg of sortedMessages) {
              const timestamp = `<t:${Math.floor(msg.createdTimestamp / 1000)}:T>`;
              const author = `${msg.author.tag} (${msg.author.id})`;
              let content = msg.content || "*[No text content]*";
              if (msg.attachments.size > 0) {
                const attachmentInfo = Array.from(msg.attachments.values()).map((att) => `[${att.name}](${att.url})`).join(", ");
                content += `\n📎 ${attachmentInfo}`;
              }
              if (msg.embeds.length > 0) content += `\n📋 ${msg.embeds.length} embed(s)`;
              if (content.length > 200) content = content.substring(0, 200) + "...";
              const entry = `${timestamp} **${author}**\n${content}\n\n`;
              if (messageLog.length + entry.length > maxLogLength) {
                messageLog += `*... and ${sortedMessages.length - sortedMessages.indexOf(msg)} more messages*`;
                break;
              }
              messageLog += entry;
            }

            const embed = new EmbedBuilder()
              .setTitle("🗑️ Messages Purged")
              .setColor("#FF0000")
              .setDescription(`${deletedCount} message(s) deleted from ${interaction.channel}`)
              .addFields(
                { name: "Channel", value: `${interaction.channel}\n\`${interaction.channel.name}\` (${interaction.channel.id})`, inline: true },
                { name: "Moderator", value: `${interaction.user.tag}\n<@${interaction.user.id}>`, inline: true },
                { name: "\u200b", value: "\u200b", inline: true },
                { name: "Messages Deleted", value: `${deletedCount}`, inline: true },
                { name: "Moderator ID", value: interaction.user.id, inline: true },
                { name: "Channel ID", value: interaction.channel.id, inline: true },
              )
              .setFooter({ text: `Action by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
              .setTimestamp();

            if (logDetail) {
              embed.addFields({ name: "Details", value: logDetail, inline: false });
            }

            if (messageLog.length > 0) {
              if (messageLog.length <= 1024) {
                embed.addFields({ name: "Deleted Messages", value: messageLog, inline: false });
                await sendLog(interaction.guild, "moderation", embed, [], interaction.channelId);
              } else {
                await sendLog(interaction.guild, "moderation", embed, [], interaction.channelId);
                const chunks = [];
                let currentChunk = "";
                for (const line of messageLog.split("\n\n")) {
                  if (currentChunk.length + line.length + 2 > 4000) {
                    if (currentChunk) chunks.push(currentChunk);
                    currentChunk = line + "\n\n";
                  } else {
                    currentChunk += line + "\n\n";
                  }
                }
                if (currentChunk) chunks.push(currentChunk);
                for (const chunk of chunks) {
                  const trimmedChunk = chunk.slice(0, 4096);
                  const messageEmbed = new EmbedBuilder().setColor("#FF0000").setDescription(trimmedChunk);
                  await sendLog(interaction.guild, "moderation", messageEmbed, [], interaction.channelId);
                }
              }
            } else {
              await sendLog(interaction.guild, "moderation", embed, [], interaction.channelId);
            }
          }
        },
      );
    },
  ),
};

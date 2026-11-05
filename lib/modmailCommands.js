const {
  ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require("discord.js");
const db = require("./database");
const discordTranscripts = require("discord-html-transcripts");
const { sendLog } = require("./logging");
const fs = require("fs");
const path = require("path");
const {
  NOT_A_TICKET_MESSAGE, buildTicketTopic, buildTicketOverwrites,
  overwriteIdsToRemove, parseUserId, isTicketChannel,
} = require("./modmailHelpers");
const logger = require("./logger");
const { runAfter } = require("./timers");

const findTicketStmt = db.prepare("SELECT * FROM modmail_tickets WHERE channel_id = ?");
const createTicketStmt = db.prepare(
  `INSERT INTO modmail_tickets (guild_id, channel_id, user_id, status, created_at)
   VALUES (@guild_id, @channel_id, @user_id, 'OPEN', CURRENT_TIMESTAMP)`,
);
const updateTicketStatusStmt = db.prepare("UPDATE modmail_tickets SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP WHERE id = ?");
const updateTicketTranscriptStmt = db.prepare("UPDATE modmail_tickets SET transcript_path = @transcript_path WHERE id = @id");

function findTicket(channelId) {
  return findTicketStmt.get(channelId);
}

async function createTicket(interaction, guildConfig) {
  const guild = interaction.guild;
  const targetUser = interaction.options.getUser("user");
  const adminOnly = interaction.options.getBoolean("admin_only");
  const categoryId = guildConfig.modmail_category_id;
  const category = guild.channels.cache.get(categoryId);

  if (!category || category.type !== ChannelType.GuildCategory) {
    return interaction.editReply({ content: "Invalid Modmail Category configured." });
  }

  const existingChannel = category.children.cache.find((c) => c.topic && c.topic.includes(targetUser.id));
  if (existingChannel) {
    return interaction.editReply({ content: `User already has an open ticket: ${existingChannel}` });
  }

  try {
    const permissionOverwrites = buildTicketOverwrites(guildConfig, {
      guildId: guild.id, targetUserId: targetUser.id, clientUserId: interaction.client.user.id, adminOnly,
    });
    const ticketChannel = await guild.channels.create({
      name: `ticket-${targetUser.username}`, type: ChannelType.GuildText, parent: categoryId,
      topic: buildTicketTopic(targetUser.id, adminOnly), permissionOverwrites,
    });

    createTicketStmt.run({ guild_id: guild.id, channel_id: ticketChannel.id, user_id: targetUser.id });

    const embed = new EmbedBuilder()
      .setTitle("Modmail Ticket")
      .setDescription(`Hello ${targetUser}, a staff member has opened this ticket with you.${adminOnly ? "\n\n**Note: Only admins can view this ticket.**" : ""}`)
      .setColor("#5865F2").setTimestamp();

    await ticketChannel.send({ content: `${targetUser}`, embeds: [embed] });
    await interaction.editReply({ content: `Ticket created: ${ticketChannel}` });
  } catch (error) {
    logger.error("Error creating ticket:", error);
    await interaction.editReply({ content: "Failed to create ticket." });
  }
}

async function revokeTicketAccess(interaction, ticket, guildConfig) {
  const userOverwrite = interaction.channel.permissionOverwrites.cache.get(ticket.user_id);
  if (userOverwrite) {
    try { await interaction.channel.permissionOverwrites.edit(ticket.user_id, { ViewChannel: false }); } catch (error) {
      if (error.code !== 10009) logger.error(`Failed to edit permissions for ticket user ${ticket.user_id}:`, error);
    }
  }

  const removable = overwriteIdsToRemove(
    interaction.channel.permissionOverwrites.cache.keys(), interaction.guild.id, guildConfig, ticket.user_id,
  );
  for (const id of removable) {
    try { await interaction.channel.permissionOverwrites.delete(id); } catch (error) {
      logger.error(`Failed to remove overwrite for ${id}:`, error);
    }
  }
}

async function closeTicket(interaction, guildConfig) {
  const ticket = findTicket(interaction.channel.id);
  if (!ticket) return interaction.editReply({ content: NOT_A_TICKET_MESSAGE });
  if (ticket.status === "CLOSED") return interaction.editReply({ content: "This ticket is already closed." });

  try {
    await revokeTicketAccess(interaction, ticket, guildConfig);
    updateTicketStatusStmt.run(ticket.id);

    const embed = new EmbedBuilder().setTitle("Ticket Closed")
      .setDescription("This ticket has been closed. The user can no longer see this channel.")
      .setColor("#FF0000");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("modmail_reopen").setLabel("Reopen Ticket").setStyle(ButtonStyle.Success).setEmoji("🔓"),
      new ButtonBuilder().setCustomId("modmail_transcript").setLabel("Generate Transcript").setStyle(ButtonStyle.Primary).setEmoji("📄"),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    logger.error("Error closing ticket:", error);
    await interaction.editReply({ content: "Failed to close ticket." });
  }
}

async function requestClose(interaction) {
  const ticket = findTicket(interaction.channel.id);
  if (!ticket) return interaction.editReply({ content: NOT_A_TICKET_MESSAGE });

  const embed = new EmbedBuilder().setTitle("Close Request")
    .setDescription("Staff have requested to close this ticket. Is your issue resolved?")
    .setColor("#F1C40F");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("modmail_close_confirm").setLabel("Close Ticket").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("modmail_close_cancel").setLabel("Keep Open").setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ content: `<@${ticket.user_id}>`, embeds: [embed], components: [row] });
}

async function addUserToTicket(interaction) {
  const ticket = findTicket(interaction.channel.id);
  if (!isTicketChannel(ticket, interaction.channel)) return interaction.editReply({ content: NOT_A_TICKET_MESSAGE });

  const userId = parseUserId(interaction.options.getString("user"));
  try {
    const targetUser = await interaction.client.users.fetch(userId);
    await interaction.channel.permissionOverwrites.edit(userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    await interaction.editReply({ content: `✅ Added ${targetUser} to the ticket.` });
    await interaction.channel.send({ content: `${targetUser} has been added to this ticket by ${interaction.user}.` });
  } catch (error) {
    logger.error("Error adding user:", error);
    await interaction.editReply({ content: "Failed to add user to the ticket." });
  }
}

async function saveTranscriptForDashboard(ticket, attachment) {
  const transcriptsDir = path.join(__dirname, "../dashboard/public/transcripts");
  if (!fs.existsSync(transcriptsDir)) fs.mkdirSync(transcriptsDir, { recursive: true });
  const fileName = `ticket-${ticket.id}.html`;
  fs.writeFileSync(path.join(transcriptsDir, fileName), attachment.attachment);
  updateTicketTranscriptStmt.run({ id: ticket.id, transcript_path: `/transcripts/${fileName}` });
}

async function sendTranscript(interaction) {
  const ticket = findTicket(interaction.channel.id);
  if (!isTicketChannel(ticket, interaction.channel)) return interaction.editReply({ content: NOT_A_TICKET_MESSAGE });

  await interaction.editReply({ content: "Generating transcript..." });
  try {
    const attachment = await discordTranscripts.createTranscript(interaction.channel, {
      limit: -1, returnType: "attachment", filename: `transcript-${ticket ? ticket.id : "unknown"}.html`,
      saveImages: true, poweredBy: false, hydrate: true,
    });

    const logEmbed = new EmbedBuilder().setTitle("Modmail Ticket Transcript")
      .addFields(
        { name: "Ticket ID", value: ticket ? ticket.id : "Unknown", inline: true },
        { name: "User", value: ticket ? `<@${ticket.user_id}>` : "Unknown", inline: true },
        { name: "Generated By", value: interaction.user.tag, inline: true },
      )
      .setColor("#5865F2").setTimestamp();

    await sendLog(interaction.guild, "modmail", logEmbed, [attachment], interaction.channelId);

    if (ticket) await saveTranscriptForDashboard(ticket, attachment);
    await interaction.followUp({ content: "Transcript generated and sent to logs." });
  } catch (error) {
    logger.error("Error generating transcript:", error);
    await interaction.followUp({ content: "Failed to generate transcript.", ephemeral: true });
  }
}

async function deleteTicket(interaction) {
  const ticket = findTicket(interaction.channel.id);
  if (!isTicketChannel(ticket, interaction.channel)) return interaction.editReply({ content: NOT_A_TICKET_MESSAGE });

  await interaction.editReply({ content: "Deleting ticket channel..." });
  try {
    runAfter(5000, async () => {
      try { await interaction.channel.delete(); } catch (error) { logger.error("Error deleting channel:", error); }
    });
  } catch (error) {
    logger.error("Error deleting ticket:", error);
    await interaction.followUp({ content: "Failed to delete channel.", ephemeral: true });
  }
}

module.exports = { createTicket, closeTicket, requestClose, addUserToTicket, sendTranscript, deleteTicket };

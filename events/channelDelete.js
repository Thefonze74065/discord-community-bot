const { Events, EmbedBuilder, ChannelType } = require("discord.js");
const { sendLog } = require("../lib/logging");
const db = require("../lib/database");
const fs = require("fs");
const path = require("path");
const logger = require("../lib/logger");

const channelTypes = {
  [ChannelType.GuildText]: "Text",
  [ChannelType.GuildVoice]: "Voice",
  [ChannelType.GuildCategory]: "Category",
  [ChannelType.GuildAnnouncement]: "Announcement",
  [ChannelType.GuildStageVoice]: "Stage",
  [ChannelType.GuildForum]: "Forum",
  [ChannelType.GuildMedia]: "Media",
};

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");
const createVCTranscriptStmt = db.prepare(
  `INSERT INTO vc_transcripts (guild_id, channel_id, channel_name, message_count, created_at, deleted_at)
   VALUES (@guild_id, @channel_id, @channel_name, @message_count, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
);
const updateVCTranscriptPathStmt = db.prepare(
  "UPDATE vc_transcripts SET transcript_path = @transcript_path WHERE id = @id",
);

module.exports = {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (!channel.guild) return;

    if (channel.type === ChannelType.GuildVoice) {
      await handleVoiceChannelTranscript(channel);
    }

    const typeName = channelTypes[channel.type] || `Unknown (${channel.type})`;

    const embed = new EmbedBuilder()
      .setTitle("Channel Deleted")
      .setColor("#FF0000")
      .addFields(
        { name: "Name", value: `#${channel.name}`, inline: true },
        { name: "Type", value: typeName, inline: true },
        { name: "ID", value: channel.id, inline: true },
      )
      .setTimestamp();

    await sendLog(channel.guild, "moderation", embed);
  },
  generateVoiceChannelTranscript: handleVoiceChannelTranscript,
};

async function handleVoiceChannelTranscript(channel) {
  try {
    const guildConfig = getGuildStmt.get(channel.guild.id);

    if (!guildConfig?.vc_transcript_channel_id) {
      return;
    }

    const messages = await channel.messages
      .fetch({ limit: 100 })
      .catch(() => null);

    if (!messages || messages.size === 0) {
      return;
    }

    logger.info(
      `[VC Transcript] Generating transcript for #${channel.name} (${messages.size} messages)`,
    );

    const discordTranscripts = require("discord-html-transcripts");
    const attachment = await discordTranscripts.createTranscript(channel, {
      limit: -1,
      returnType: "attachment",
      filename: `vc-transcript-${channel.id}.html`,
      saveImages: true,
      poweredBy: false,
      hydrate: true,
    });

    const transcript = createVCTranscriptStmt.run({
      guild_id: channel.guild.id,
      channel_id: channel.id,
      channel_name: channel.name,
      message_count: messages.size,
    });

    const transcriptsDir = path.join(
      __dirname,
      "../dashboard/public/transcripts",
    );
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }
    const fileName = `vc-${transcript.lastInsertRowid}.html`;
    const filePath = path.join(transcriptsDir, fileName);
    fs.writeFileSync(filePath, attachment.attachment);

    updateVCTranscriptPathStmt.run({
      id: transcript.lastInsertRowid,
      transcript_path: `/transcripts/${fileName}`,
    });

    const dashboardUrl = process.env.DASHBOARD_CALLBACK_URL
      ? new URL(process.env.DASHBOARD_CALLBACK_URL).origin
      : "http://localhost:3000";

    const logEmbed = new EmbedBuilder()
      .setTitle("Voice Channel Text Chat Transcript")
      .setDescription(`Voice channel **${channel.name}** was deleted`)
      .addFields(
        { name: "Channel ID", value: channel.id, inline: true },
        { name: "Messages", value: messages.size.toString(), inline: true },
        {
          name: "Transcript",
          value: `[View on Dashboard](${dashboardUrl}/transcripts/${fileName})`,
          inline: false,
        },
      )
      .setColor("#FF6B6B")
      .setTimestamp();
    await sendLog(
      channel.guild,
      "vcTranscript",
      logEmbed,
      [attachment],
      channel.id,
    );

    logger.info(
      `[VC Transcript] Successfully saved transcript for #${channel.name}`,
    );
  } catch (error) {
    logger.error("[VC Transcript] Error generating transcript:", error);
  }
}

const { SlashCommandBuilder } = require("discord.js");
const { joinChannel, leaveChannel, addToQueue } = require("../lib/tts");
const db = require("../lib/database");
const emojilib = require("emojilib");
const emojiRegex = require("emoji-regex");
const logger = require("../lib/logger");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");
const updateTtsChannelStmt = db.prepare(
  "UPDATE guilds SET tts_channel_id = @tts_channel_id, updated_at = CURRENT_TIMESTAMP WHERE id = @id",
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tts")
    .setDescription("Text-to-Speech commands")
    .addSubcommand((subcommand) =>
      subcommand.setName("join").setDescription("Join your voice channel and start TTS"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("leave").setDescription("Leave the voice channel"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("say")
        .setDescription("Manually say a message")
        .addStringOption((option) =>
          option.setName("message").setDescription("The message to speak").setRequired(true),
        ),
    ),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: subcommand === "say" });

    const guildConfig = getGuildStmt.get(interaction.guild.id);

    if (guildConfig?.module_tts_enabled === false) {
      return interaction.editReply({ content: "Text-to-speech is disabled for this server." });
    }

    if (subcommand === "join") {
      const channel = interaction.member.voice.channel;
      if (!channel) {
        return interaction.editReply({ content: "You need to be in a voice channel first!" });
      }

      try {
        await joinChannel(channel, interaction.channel);
        updateTtsChannelStmt.run({ tts_channel_id: interaction.channel.id, id: interaction.guild.id });
        return interaction.editReply({
          content: `Joined ${channel} and bound TTS to this text channel. I will read messages sent here!`,
        });
      } catch (error) {
        logger.error(error);
        return interaction.editReply({ content: "Failed to join voice channel. Check my permissions or logs." });
      }
    } else if (subcommand === "leave") {
      const success = leaveChannel(interaction.guild.id);
      updateTtsChannelStmt.run({ tts_channel_id: null, id: interaction.guild.id });
      if (success) {
        return interaction.editReply({ content: "Left the voice channel." });
      }
      return interaction.editReply({ content: "I am not currently in a voice channel." });
    } else if (subcommand === "say") {
      let message = interaction.options.getString("message");

      message = message.replace(/<a?:([^:]+):\d+>/g, (match, name) => " " + name.replace(/[_-]/g, " ") + " ");

      const regex = emojiRegex();
      message = message.replace(regex, (match) => {
        if (emojilib[match]) return ` ${emojilib[match][0]} `;
        return match;
      });

      message = message.replace(/[_-]/g, " ");
      message = message.replace(/[^\x00-\x7F\u00C0-\u00CF\u00D1-\u00D6\u00D8-\u00EF\u00F1-\u00F6\u00F8-\u00FF]/g, "");
      message = message.replace(/\s+/g, " ").trim();

      let ttsName = interaction.member.displayName;
      const ttsNameOverride = Array.isArray(guildConfig?.tts_name_overrides)
        ? JSON.parse(guildConfig.tts_name_overrides).find((entry) => entry && entry.userId === interaction.user.id)
        : null;
      if (ttsNameOverride?.alias) {
        ttsName = String(ttsNameOverride.alias).trim() || ttsName;
      }

      const success = await addToQueue(interaction.guild.id, ttsName, message);

      if (success) {
        return interaction.editReply({ content: "Message added to queue." });
      }
      return interaction.editReply({ content: "I am not in a voice channel! Use `/tts join` first." });
    }
  },
};

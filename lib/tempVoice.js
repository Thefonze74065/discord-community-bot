const db = require("./database");
const { handleEventError } = require("./errors");
const { buildTempVcOverwrites } = require("./voiceHelpers");
const { generateVoiceChannelTranscript } = require("../events/channelDelete");
const logger = require("./logger");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");
const createTempVoiceChannelStmt = db.prepare(
  "INSERT INTO temp_voice_channels (channel_id, guild_id, owner_id, created_at) VALUES (@channel_id, @guild_id, @owner_id, CURRENT_TIMESTAMP)",
);
const deleteTempVoiceChannelStmt = db.prepare(
  "DELETE FROM temp_voice_channels WHERE channel_id = ?",
);
const getTempVoiceChannelStmt = db.prepare(
  "SELECT * FROM temp_voice_channels WHERE channel_id = ?",
);

async function handleUserJoinedVC(state) {
  const { channel, member, guild } = state;

  try {
    const guildSettings = getGuildStmt.get(guild.id);

    if (
      !guildSettings ||
      !guildSettings.temp_vc_channel_id ||
      !guildSettings.module_temp_vc_enabled
    )
      return;

    if (channel.id !== guildSettings.temp_vc_channel_id) return;

    const categoryId = guildSettings.temp_vc_category_id || (channel.parent && channel.parent.id);
    const category = categoryId ? guild.channels.cache.get(categoryId) : null;

    const permissionOverwrites = buildTempVcOverwrites(category, member.id);

    const tempChannel = await channel.guild.channels.create({
      name: guildSettings.temp_vc_name_format.replace("{username}", member.user.username),
      type: 2,
      parent: categoryId,
      permissionOverwrites,
    });

    createTempVoiceChannelStmt.run({
      channel_id: tempChannel.id, guild_id: guild.id, owner_id: member.id,
    });

    try {
      await member.voice.setChannel(tempChannel);
    } catch (moveError) {
      logger.warn(`[TempVC] Failed to move ${member.user.tag} to new channel. Cleaning up...`);

      const [deleteErr] = await handleEventError.safeDelete(tempChannel);
      if (deleteErr) {
        handleEventError("Delete temp VC after failed move", deleteErr, {
          channelId: tempChannel.id, guildId: state.guild.id,
        });
      }

      deleteTempVoiceChannelStmt.run(tempChannel.id);
    }
  } catch (error) {
    logger.error("Error handling user join VC:", error);
  }
}

async function handleUserLeftVC(state) {
  const { channel, guild } = state;

  try {
    const guildConfig = getGuildStmt.get(guild.id);
    if (!guildConfig || !guildConfig.module_temp_vc_enabled) return;

    const tempChannel = getTempVoiceChannelStmt.get(channel.id);
    if (!tempChannel) return;

    if (channel.members.size === 0) {
      await generateVoiceChannelTranscript(channel);

      const [deleteErr] = await handleEventError.safeDelete(channel);
      if (deleteErr) {
        handleEventError("Delete empty temp VC", deleteErr, {
          channelId: channel.id, guildId: state.guild.id,
        });
      }

      deleteTempVoiceChannelStmt.run(channel.id);
    }
  } catch (error) {
    logger.error("Error handling user left VC:", error);
  }
}

module.exports = { handleUserJoinedVC, handleUserLeftVC };

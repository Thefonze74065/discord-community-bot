const { Events } = require("discord.js");
const db = require("../lib/database");
const { startXpSaveInterval } = require("../lib/leveling");
const { config } = require("../lib/config");
const { startScheduler } = require("../lib/scheduler");
const { runStartupAudits } = require("../lib/audits");
const { joinChannel } = require("../lib/tts");
const logger = require("../lib/logger");

const upsertGuildStmt = db.prepare(
  "INSERT INTO guilds (id, created_at, updated_at) VALUES (@id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(id) DO NOTHING",
);
const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.info(`[SUCCESS] Logged in as ${client.user.tag}!`);
    logger.info(
      `[INFO] Bot is ready and serving ${client.guilds.cache.size} guilds!`,
    );

    try {
      for (const [guildId, guild] of client.guilds.cache) {
        upsertGuildStmt.run({ id: guildId });

        const me = guild.members.me;
        if (me && me.voice.channel) {
          const guildConfig = getGuildStmt.get(guildId);

          if (guildConfig && guildConfig.tts_channel_id) {
            const textChannel = guild.channels.cache.get(
              guildConfig.tts_channel_id,
            );
            if (textChannel) {
              logger.info(
                `[TTS] Resuming session in guild ${guild.name} (VC: ${me.voice.channel.name}, Text: ${textChannel.name})`,
              );
              try {
                await joinChannel(me.voice.channel, textChannel);
                await textChannel.send(
                  ":white_check_mark: Bot is back online! TTS is now available.",
                );
              } catch (err) {
                logger.error(
                  `[TTS] Failed to resume session in ${guild.name}:`,
                  err,
                );
              }
            }
          }
        }
      }
      logger.info(
        `[INFO] Database synced with ${client.guilds.cache.size} guilds`,
      );
    } catch (error) {
      logger.error("[ERROR] Failed to sync guilds with database:", error);
    }

    startXpSaveInterval(config.xpSaveIntervalMinutes);
    startScheduler(client);

    logger.info(
      "[INFO] Bot is fully ready to accept commands. Starting background audits...",
    );

    runStartupAudits(client).catch((err) =>
      logger.error("[ERROR] Critical failure in startup audits:", err),
    );
  },
};

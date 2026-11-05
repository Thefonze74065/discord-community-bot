const {
  ChannelType, PermissionFlagsBits, OverwriteType, EmbedBuilder,
} = require("discord.js");
const db = require("./database");
const { addXp, handleLevelUp } = require("./leveling");
const { initializeVoiceTracking } = require("../events/voiceStateUpdate");
const { handleEventError, safePromise } = require("./errors");
const { sendLog } = require("./logging");
const logger = require("./logger");

const getTempChannelsStmt = db.prepare("SELECT * FROM temp_voice_channels");
const deleteTempChannelStmt = db.prepare("DELETE FROM temp_voice_channels WHERE id = ?");
const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");
const createTempVoiceChannelStmt = db.prepare(
  "INSERT INTO temp_voice_channels (channel_id, guild_id, owner_id, created_at) VALUES (@channel_id, @guild_id, @owner_id, CURRENT_TIMESTAMP)",
);
const getVoiceSessionsStmt = db.prepare("SELECT * FROM voice_sessions");
const deleteVoiceSessionStmt = db.prepare("DELETE FROM voice_sessions WHERE id = ?");

async function runStartupAudits(client) {
  const totalStart = Date.now();
  logger.info("==========================================");
  logger.info("[AUDIT] Starting background integrity checks...");
  logger.info("==========================================");

  // --- Audit Temp VCs ---
  const tempVcStart = Date.now();
  logger.info("[AUDIT] 1/3: Verifying Temporary Voice Channels...");

  try {
    const tempChannels = getTempChannelsStmt.all();
    logger.info(`[AUDIT] Found ${tempChannels.length} temp channels in DB. Checking existence...`);

    let removedChannels = 0;
    let checkedCount = 0;

    for (const tempChannel of tempChannels) {
      checkedCount++;
      try {
        const channel = await client.channels.fetch(tempChannel.channel_id).catch(() => null);

        if (!channel) {
          logger.info(`[AUDIT] Channel ${tempChannel.channel_id} not found in Discord. Removing from DB.`);
          deleteTempChannelStmt.run(tempChannel.id);
          removedChannels++;
        }
      } catch (error) {
        logger.error(`[AUDIT] Error checking temp channel ${tempChannel.channel_id}:`, error);
      }

      if (checkedCount % 10 === 0) {
        logger.info(`[AUDIT] Checked ${checkedCount}/${tempChannels.length} temp channels...`);
      }
    }
    logger.info(`[AUDIT] Temp VC Audit complete in ${Date.now() - tempVcStart}ms. Removed ${removedChannels} stale records.`);
  } catch (err) {
    logger.error("[AUDIT] Failed during Temp VC audit:", err);
  }

  // --- Audit Orphan Temp VCs ---
  const orphanStart = Date.now();
  logger.info("[AUDIT] 2/3: Scanning for Orphaned Voice Channels...");

  let recoveredChannels = 0;
  let cleanedEmptyChannels = 0;
  let guildsChecked = 0;

  for (const [guildId, guild] of client.guilds.cache) {
    guildsChecked++;
    try {
      const guildSettings = getGuildStmt.get(guildId);

      if (!guildSettings || !guildSettings.temp_vc_channel_id) continue;

      const triggerChannel = await guild.channels.fetch(guildSettings.temp_vc_channel_id).catch(() => null);
      if (!triggerChannel) continue;

      const categoryId = guildSettings.temp_vc_category_id || triggerChannel.parentId;
      if (!categoryId) continue;

      const voiceChannels = guild.channels.cache.filter(
        (c) => c.parentId === categoryId && c.type === ChannelType.GuildVoice && c.id !== triggerChannel.id,
      );

      const nameFormat = guildSettings.temp_vc_name_format || "{username}'s VC";
      const regexString = "^" + nameFormat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\{username\\}/g, ".*") + "$";
      const nameRegex = new RegExp(regexString);

      for (const [channelId, channel] of voiceChannels) {
        const isKnown = db.prepare("SELECT * FROM temp_voice_channels WHERE channel_id = ?").get(channelId);
        if (isKnown) continue;

        if (!nameRegex.test(channel.name)) continue;

        if (channel.members.size === 0) {
          const [deleteErr] = await safePromise(channel.delete());
          if (deleteErr) {
            handleEventError("Delete orphan empty VC", deleteErr, {
              channelId: channel.id, channelName: channel.name, guildId: guild.id,
            });
          } else {
            cleanedEmptyChannels++;
          }
          continue;
        }

        let ownerId = null;
        channel.permissionOverwrites.cache.forEach((overwrite) => {
          if (overwrite.type === OverwriteType.Member) {
            const allow = overwrite.allow;
            if (allow.has(PermissionFlagsBits.ManageChannels)) {
              ownerId = overwrite.id;
            }
          }
        });

        if (!ownerId && channel.members.size > 0) {
          ownerId = channel.members.first().id;
        }

        if (ownerId) {
          createTempVoiceChannelStmt.run({ channel_id: channel.id, guild_id: guild.id, owner_id: ownerId });
          recoveredChannels++;
          logger.info(`[AUDIT] Recovered orphan temp VC ${channel.name} (${channel.id}) for user ${ownerId}`);

          const adminRolePing = guildSettings.admin_role_id ? `<@&${guildSettings.admin_role_id}>` : "";

          const embed = new EmbedBuilder()
            .setTitle("⚠️ Orphan Temp VC Recovered")
            .setDescription("A temporary voice channel was found without a database record and has been recovered.")
            .addFields(
              { name: "Channel", value: `${channel.name} (<#${channel.id}>)`, inline: true },
              { name: "Assigned Owner", value: `<@${ownerId}>`, inline: true },
              { name: "Recovered At", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
            )
            .setColor(0xffa500)
            .setTimestamp();

          await sendLog(
            guild, "moderation", embed, [], channel.id,
            adminRolePing ? `⚠️ Attention ${adminRolePing}` : undefined,
          );
        }
      }
    } catch (err) {
      logger.error(`[AUDIT] Failed to audit orphan VCs for guild ${guildId}:`, err);
    }
  }
  logger.info(`[AUDIT] Orphan Audit complete in ${Date.now() - orphanStart}ms. Scanned ${guildsChecked} guilds. Recovered ${recoveredChannels}, Cleaned ${cleanedEmptyChannels}.`);

  // --- Audit Voice Sessions ---
  const sessionStart = Date.now();
  logger.info("[AUDIT] 3/3: Reconciling Voice Sessions...");

  await initializeVoiceTracking(client);

  const sessions = getVoiceSessionsStmt.all();
  logger.info(`[AUDIT] Found ${sessions.length} open sessions in DB. Checking validity...`);

  let closedSessions = 0;
  let sessionCheckCount = 0;

  for (const session of sessions) {
    sessionCheckCount++;
    let isActive = false;
    try {
      const guild = await client.guilds.fetch(session.guild_id).catch(() => null);
      if (guild) {
        const member = await guild.members.fetch(session.user_id).catch(() => null);
        if (member && member.voice.channel) {
          isActive = true;
        }
      }
    } catch (error) {
      isActive = false;
    }

    if (!isActive) {
      const durationMs = Date.now() - new Date(session.start_time).getTime();
      const minutes = Math.floor(durationMs / 60000);

      if (minutes > 0) {
        try {
          const xpEarned = minutes * 2;
          const { leveledUp, newLevel } = await addXp(session.user_id, session.guild_id, xpEarned, 0, minutes);

          if (leveledUp) {
            try {
              const guild = await client.guilds.fetch(session.guild_id);
              const member = await guild.members.fetch(session.user_id);
              await handleLevelUp(member, newLevel, session.guild_id);
            } catch (e) {
              // Ignore
            }
          }
          logger.info(`[AUDIT] Closed stale session for user ${session.user_id}. Duration: ${minutes}m. XP: ${xpEarned}`);
        } catch (e) {
          logger.error(`[AUDIT] Failed to award XP for stale session ${session.id}:`, e);
        }
      }

      deleteVoiceSessionStmt.run(session.id);
      closedSessions++;
    }

    if (sessionCheckCount % 20 === 0) {
      logger.info(`[AUDIT] Checked ${sessionCheckCount}/${sessions.length} sessions...`);
    }
  }
  logger.info(`[AUDIT] Voice Session Audit complete in ${Date.now() - sessionStart}ms. Closed ${closedSessions} stale sessions.`);

  logger.info("==========================================");
  logger.info(`[AUDIT] All startup checks finished in ${Date.now() - totalStart}ms.`);
  logger.info("==========================================");
}

async function auditBoosterRoles(client) {
  logger.info("[AUDIT] Starting Booster Role Audit...");
  const start = Date.now();
  let removedCount = 0;

  try {
    const guilds = db.prepare("SELECT * FROM guilds WHERE booster_color_role_id IS NOT NULL").all();

    for (const guildData of guilds) {
      const guild = client.guilds.cache.get(guildData.id);
      if (!guild) continue;

      const roleId = guildData.booster_color_role_id;
      const role = guild.roles.cache.get(roleId);

      if (!role) {
        logger.warn(`[AUDIT] Booster role ${roleId} not found in guild ${guild.name}`);
        continue;
      }

      await guild.members.fetch();

      const membersWithRole = role.members;

      for (const member of membersWithRole.values()) {
        if (!member.premiumSince) {
          logger.info(`[AUDIT] Removing booster role from ${member.user.tag} in ${guild.name} (No longer boosting)`);
          try {
            await member.roles.remove(role);
            removedCount++;
          } catch (err) {
            logger.error(`[AUDIT] Failed to remove role from ${member.user.tag}:`, err);
          }
        }
      }
    }
  } catch (error) {
    logger.error("[AUDIT] Error during booster role audit:", error);
  }

  logger.info(`[AUDIT] Booster Role Audit complete in ${Date.now() - start}ms. Removed roles from ${removedCount} users.`);
}

module.exports = { runStartupAudits, auditBoosterRoles };

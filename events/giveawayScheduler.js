// events/giveawayScheduler.js
// Schedules and ends giveaways, picks winners, and announces results.
const db = require("../lib/database");
const { config } = require("../lib/config");
const {
  EmbedBuilder,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { handleEventError } = require("../lib/errors");
const logger = require("../lib/logger");
const { startInterval } = require("../lib/timers");

async function selectWinners(entries, winnerCount, guild, excludeUserIds = []) {
  if (entries.length === 0) return [];

  const validEntries = [];
  for (const entry of entries) {
    if (excludeUserIds.includes(entry.user_id)) continue;
    try {
      await guild.members.fetch(entry.user_id);
      validEntries.push(entry);
    } catch (err) {
      logger.info(`[Giveaway] Skipping user ${entry.user_id} - not in server`);
    }
  }

  if (validEntries.length === 0) return [];

  const crypto = require("crypto");
  const arr = validEntries.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(winnerCount, arr.length)).map((e) => e.user_id);
}

async function createWinnerModmail(
  client,
  guildId,
  winnerId,
  sponsorId,
  prize,
) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const guildConfig = db.prepare("SELECT * FROM guilds WHERE id = ?").get(guildId);

    if (!guildConfig || !guildConfig.modmail_category_id) {
      logger.warn(
        `[Giveaway] Cannot create modmail - modmail not configured for guild ${guildId}`,
      );
      return null;
    }

    const categoryId = guildConfig.modmail_category_id;
    const category = guild.channels.cache.get(categoryId);

    if (!category || category.type !== ChannelType.GuildCategory) {
      logger.warn(
        `[Giveaway] Cannot create modmail - invalid category ${categoryId}`,
      );
      return null;
    }

    const winner = await guild.members.fetch(winnerId).catch(() => null);
    const sponsor = await guild.members.fetch(sponsorId).catch(() => null);

    if (!winner) {
      logger.warn(`[Giveaway] Winner ${winnerId} not found in guild`);
      return null;
    }
    if (!sponsor) {
      logger.warn(`[Giveaway] Sponsor ${sponsorId} not found in guild`);
      return null;
    }

    const permissionOverwrites = [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: winnerId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
      {
        id: sponsorId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ManageChannels,
        ],
      },
    ];

    if (guildConfig.admin_role_id) {
      permissionOverwrites.push({
        id: guildConfig.admin_role_id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
        ],
      });
    }
    if (guildConfig.moderator_role_id) {
      permissionOverwrites.push({
        id: guildConfig.moderator_role_id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
        ],
      });
    }
    if (guildConfig.trial_moderator_role_id) {
      permissionOverwrites.push({
        id: guildConfig.trial_moderator_role_id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
        ],
      });
    }

    const ticketChannel = await guild.channels.create({
      name: `giveaway-${winner.user.username}`,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `Giveaway Winner Ticket | Winner: ${winnerId} | Sponsor: ${sponsorId} | Prize: ${prize}`,
      permissionOverwrites,
    });

    db.prepare(
      `INSERT INTO modmail_tickets (guild_id, channel_id, user_id, status, created_at)
       VALUES (@guild_id, @channel_id, @user_id, 'OPEN', CURRENT_TIMESTAMP)`,
    ).run({
      guild_id: guildId,
      channel_id: ticketChannel.id,
      user_id: winnerId,
    });

    const embed = new EmbedBuilder()
      .setTitle("🎉 Giveaway Winner Ticket")
      .setDescription(
        `Congratulations ${winner}! You've won: **${prize}**\n\n` +
          `This ticket connects you with your sponsor ${sponsor}.\n` +
          `Please coordinate here to claim your prize.`,
      )
      .addFields(
        { name: "Winner", value: `${winner}`, inline: true },
        { name: "Sponsor", value: `${sponsor}`, inline: true },
        { name: "Prize", value: prize, inline: false },
      )
      .setColor(0xffd700)
      .setTimestamp();

    const closeButton = new ButtonBuilder()
      .setCustomId("modmail_close")
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒");

    const row = new ActionRowBuilder().addComponents(closeButton);

    await ticketChannel.send({
      content: `${winner} ${sponsor}`,
      embeds: [embed],
      components: [row],
    });

    logger.info(
      `[Giveaway] Created modmail ticket ${ticketChannel.id} for winner ${winnerId} and sponsor ${sponsorId}`,
    );
    return ticketChannel;
  } catch (error) {
    logger.error(
      `[Giveaway] Failed to create modmail for winner ${winnerId}:`,
      error,
    );
    return null;
  }
}

async function checkGiveaways(client) {
  const now = new Date();
  const giveaways = db.prepare(
    "SELECT * FROM giveaways WHERE ended = 0 AND end_time <= ?",
  ).all(now.toISOString());

  for (const g of giveaways) {
    const guildConfig = db
      .prepare(
        "SELECT module_giveaways_enabled FROM guilds WHERE id = ?",
      )
      .get(g.guild_id);

    if (guildConfig?.module_giveaways_enabled === false) {
      continue;
    }

    await endGiveaway(g, client);
  }
}

async function endGiveaway(giveaway, client) {
  try {
    logger.info(
      `[GiveawayScheduler] Ending giveaway ${giveaway.id} in channel ${giveaway.channel_id}`,
    );

    const entries = db.prepare(
      "SELECT * FROM giveaway_entries WHERE giveaway_id = ?",
    ).all(giveaway.id);
    logger.info(
      `[GiveawayScheduler] Found ${entries.length} entries for giveaway ${giveaway.id}`,
    );

    const guild = await client.guilds.fetch(giveaway.guild_id).catch(() => null);
    const guildConfig = db
      .prepare("SELECT * FROM guilds WHERE id = ?")
      .get(giveaway.guild_id);
    let winners = [];
    if (entries.length > 0 && guild) {
      winners = await selectWinners(entries, giveaway.winner_count, guild);
      logger.info(
        `[GiveawayScheduler] Winners selected: ${winners.join(", ")}`,
      );
    } else {
      logger.info(
        `[GiveawayScheduler] No valid entries for giveaway ${giveaway.id}`,
      );
    }

    db.prepare(
      "UPDATE giveaways SET ended = 1, winners = ? WHERE id = ?",
    ).run(JSON.stringify(winners), giveaway.id);

    const sponsors = giveaway.sponsors ? JSON.parse(giveaway.sponsors) : [];

    if (
      guildConfig?.module_modmail_enabled !== false &&
      winners.length > 0 &&
      sponsors.length > 0
    ) {
      for (let i = 0; i < winners.length; i++) {
        const winnerId = winners[i];
        const sponsorId = sponsors[i % sponsors.length];
        await createWinnerModmail(
          client,
          giveaway.guild_id,
          winnerId,
          sponsorId,
          giveaway.prize,
        );
      }
    }

    const channel = await client.channels
      .fetch(giveaway.channel_id)
      .catch((err) => {
        handleEventError("Fetch giveaway channel", err, {
          channelId: giveaway.channel_id,
          giveawayId: giveaway.id,
        });
        return null;
      });
    if (channel) {
      const winnerMentions =
        winners.length > 0
          ? winners.map((id) => `<@${id}>`).join(", ")
          : "No valid entries.";
      let desc =
        typeof giveaway.description === "string" &&
        giveaway.description.trim().length > 0
          ? giveaway.description
          : "No description provided.";
      const embed = new EmbedBuilder()
        .setTitle(`Giveaway Ended: ${giveaway.prize}`)
        .setDescription(desc)
        .addFields(
          { name: "Winners", value: winnerMentions },
          {
            name: "Sponsors",
            value: sponsors.map((id) => `<@${id}>`).join(", "),
          },
        )
        .setColor(0xffd700)
        .setTimestamp(new Date());
      await channel.send({
        content: `🎉 **Giveaway Ended!** 🎉`,
        embeds: [embed],
      });
    } else {
      logger.warn(
        `[GiveawayScheduler] Channel not found for giveaway ${giveaway.id}`,
      );
    }
  } catch (err) {
    handleEventError("End giveaway", err, {
      giveawayId: giveaway.id,
    });
    throw err;
  }
}

async function rerollGiveaway(giveaway, client, rerollAll = false) {
  try {
    logger.info(`[GiveawayScheduler] Rerolling giveaway ${giveaway.id}`);

    if (!giveaway.ended) {
      throw new Error("Cannot reroll an active giveaway");
    }

    const entries = db.prepare(
      "SELECT * FROM giveaway_entries WHERE giveaway_id = ?",
    ).all(giveaway.id);

    if (entries.length === 0) {
      throw new Error("No entries found for this giveaway");
    }

    const guild = await client.guilds.fetch(giveaway.guild_id);
    if (!guild) {
      throw new Error("Guild not found");
    }

    let newWinners;
    if (rerollAll) {
      newWinners = await selectWinners(entries, giveaway.winner_count, guild);
    } else {
      const validWinners = [];
      const invalidCount = [];

      for (const winnerId of JSON.parse(giveaway.winners || "[]")) {
        try {
          await guild.members.fetch(winnerId);
          validWinners.push(winnerId);
        } catch (err) {
          invalidCount.push(winnerId);
        }
      }

      if (invalidCount.length === 0) {
        throw new Error("All current winners are still in the server");
      }

      const neededWinners = giveaway.winner_count - validWinners.length;
      const replacementWinners = await selectWinners(
        entries,
        neededWinners,
        guild,
        validWinners,
      );

      newWinners = [...validWinners, ...replacementWinners];
    }

    db.prepare(
      "UPDATE giveaways SET winners = ? WHERE id = ?",
    ).run(JSON.stringify(newWinners), giveaway.id);

    const sponsors = giveaway.sponsors ? JSON.parse(giveaway.sponsors) : [];

    if (sponsors.length > 0) {
      const oldWinners = JSON.parse(giveaway.winners || "[]");
      const actualNewWinners = newWinners.filter(
        (id) => !oldWinners.includes(id),
      );

      for (let i = 0; i < actualNewWinners.length; i++) {
        const winnerId = actualNewWinners[i];
        const sponsorId = sponsors[i % sponsors.length];
        await createWinnerModmail(
          client,
          giveaway.guild_id,
          winnerId,
          sponsorId,
          giveaway.prize,
        );
      }
    }

    const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
    if (channel) {
      const winnerMentions =
        newWinners.length > 0
          ? newWinners.map((id) => `<@${id}>`).join(", ")
          : "No valid entries remaining.";

      let desc =
        typeof giveaway.description === "string" &&
        giveaway.description.trim().length > 0
          ? giveaway.description
          : "No description provided.";

      const embed = new EmbedBuilder()
        .setTitle(`🎉 Giveaway Rerolled: ${giveaway.prize}`)
        .setDescription(desc)
        .addFields(
          { name: "New Winners", value: winnerMentions },
          {
            name: "Sponsors",
            value: sponsors.map((id) => `<@${id}>`).join(", "),
          },
        )
        .setColor(0xff6b6b)
        .setTimestamp(new Date());

      await channel.send({
        content: `🔄 **Giveaway Rerolled!** 🔄`,
        embeds: [embed],
      });
    }

    return newWinners;
  } catch (err) {
    handleEventError("Reroll giveaway", err, {
      giveawayId: giveaway.id,
    });
    throw err;
  }
}

function startScheduler(client) {
  startInterval(() => checkGiveaways(client), config.giveawayCheckIntervalMs);
}

module.exports = Object.assign(startScheduler, { endGiveaway, rerollGiveaway });

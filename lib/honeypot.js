const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("./database");
const { config, guildValue } = require("./config");
const { handleEventError } = require("./errors");
const { getMemberRank } = require("./permissions");
const { logModeratorAction } = require("./modActions");
const { sendLog } = require("./logging");
const { expireKey } = require("./timers");

const HONEYPOT_NOTICE =
  "## ⚠️ DO NOT POST IN THIS CHANNEL\n" +
  "This channel is a trap for spam bots and compromised accounts. " +
  "**Anyone who sends a message here is automatically banned**, and their messages from the last hour are deleted across the server.\n" +
  "There are no exceptions and no warnings. If you're a real person, just leave this channel alone.";

const HONEYPOT_BAN_REASON = "Posted in the honeypot channel";

const bansInProgress = new Set();

const getGuildsWithHoneypotStmt = db.prepare(
  "SELECT * FROM guilds WHERE honeypot_channel_id IS NOT NULL",
);

async function ensureHoneypotNotice(channel) {
  if (!channel || !channel.isTextBased()) return;

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const existingNotices = messages.filter(
      (msg) =>
        msg.author.id === channel.client.user.id &&
        msg.content === HONEYPOT_NOTICE,
    );

    if (existingNotices.size === 0) {
      await channel.send(HONEYPOT_NOTICE);
      return;
    }

    const [, ...duplicates] = [...existingNotices.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    );
    for (const duplicate of duplicates) {
      await duplicate.delete().catch(() => null);
    }
  } catch (error) {
    handleEventError("Ensure honeypot notice", error, {
      channelId: channel?.id,
      guildId: channel?.guild?.id,
    });
  }
}

async function ensureHoneypotNotices(client) {
  try {
    const guilds = getGuildsWithHoneypotStmt.all();
    for (const guildData of guilds) {
      const channel = await client.channels.fetch(guildData.honeypot_channel_id).catch(() => null);
      if (!channel) continue;
      await ensureHoneypotNotice(channel);
    }
  } catch (error) {
    handleEventError("Ensure honeypot notices", error);
  }
}

function isExemptFromHoneypot(member, guildConfig) {
  return (
    getMemberRank(member, guildConfig) > 0 ||
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member.permissions.has(PermissionFlagsBits.BanMembers)
  );
}

async function handleHoneypotMessage(message, guildConfig) {
  if (
    !guildConfig?.honeypot_channel_id ||
    message.channel.id !== guildConfig.honeypot_channel_id
  ) {
    return false;
  }

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));

  if (member && isExemptFromHoneypot(member, guildConfig)) return false;

  const banKey = `${message.guild.id}-${message.author.id}`;
  if (bansInProgress.has(banKey)) return true;
  bansInProgress.add(banKey);
  const deleteMessageSeconds = guildValue(
    guildConfig,
    "honeypot_delete_message_seconds",
    config.honeypotDeleteMessageSeconds,
  );

  try {
    if (member && !member.bannable) {
      await message.delete().catch(() => null);
      await sendHoneypotLog(message, false);
      return true;
    }

    await message.author
      .send(
        `You were automatically banned from **${message.guild.name}** for posting in a channel that warns it bans anyone who posts there. ` +
          "If your account was compromised, secure it and contact the server staff.",
      )
      .catch(() => null);

    await message.guild.members.ban(message.author, {
      reason: HONEYPOT_BAN_REASON,
      deleteMessageSeconds,
    });

    await logModeratorAction({
      guildId: message.guild.id,
      moderatorId: message.client.user.id,
      action: "ban",
      targetId: message.author.id,
      targetTag: message.author.tag,
      reason: HONEYPOT_BAN_REASON,
      details: {
        deleteMessageSeconds,
        honeypotChannelId: message.channel.id,
      },
    });

    await sendHoneypotLog(message, true);
  } catch (error) {
    handleEventError("Honeypot ban", error, {
      guildId: message.guild.id,
      userId: message.author.id,
      channelId: message.channel.id,
    });
  } finally {
    expireKey(bansInProgress, banKey, 10_000);
  }

  return true;
}

async function sendHoneypotLog(message, banned) {
  const embed = new EmbedBuilder()
    .setColor(banned ? 0x8b0000 : 0xffa500)
    .setTitle(
      banned ? "🍯 Honeypot Ban" : "🍯 Honeypot Triggered (Could Not Ban)",
    )
    .setAuthor({
      name: message.author.tag,
      iconURL: message.author.displayAvatarURL(),
    })
    .setDescription(
      banned
        ? `${message.author} posted in ${message.channel} and was banned. Their messages from the last hour were deleted.`
        : `${message.author} posted in ${message.channel}, but I can't ban them (their role is above mine). The message was deleted.`,
    )
    .addFields(
      {
        name: "User",
        value: `${message.author.tag} (${message.author.id})`,
        inline: false,
      },
      {
        name: "Message",
        value: (message.content || "*No text content*").slice(0, 1024),
        inline: false,
      },
    )
    .setThumbnail(message.author.displayAvatarURL())
    .setTimestamp();

  await sendLog(message.guild, "moderation", embed, [], null);
}

module.exports = {
  HONEYPOT_NOTICE,
  ensureHoneypotNotice,
  ensureHoneypotNotices,
  handleHoneypotMessage,
};

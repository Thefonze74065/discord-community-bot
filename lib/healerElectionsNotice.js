const { handleEventError } = require("./errors");

const HEALER_ELECTIONS_NOTICE =
  "6h slowmode is active. You get one image per entry, so attach it to your current message. Good luck!";

async function getNoticeMessages(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  return messages.filter(
    (msg) =>
      msg.author.id === channel.client.user.id &&
      msg.content === HEALER_ELECTIONS_NOTICE,
  );
}

async function ensureHealerElectionsNotice(channel, options = {}) {
  const { refresh = false } = options;

  if (!channel || !channel.isTextBased()) return;

  try {
    const existingNotices = await getNoticeMessages(channel);

    if (refresh) {
      for (const notice of existingNotices.values()) {
        await notice.delete().catch(() => null);
      }

      await channel.send(HEALER_ELECTIONS_NOTICE);
      return;
    }

    if (existingNotices.size === 0) {
      await channel.send(HEALER_ELECTIONS_NOTICE);
    }
  } catch (error) {
    handleEventError("Ensure healer elections notice", error, {
      channelId: channel?.id,
      guildId: channel?.guild?.id,
      refresh,
    });
  }
}

module.exports = {
  HEALER_ELECTIONS_NOTICE,
  ensureHealerElectionsNotice,
};

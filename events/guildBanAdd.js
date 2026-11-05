const { Events, EmbedBuilder, AuditLogEvent } = require("discord.js");
const { sendLog } = require("../lib/logging");

module.exports = {
  name: Events.GuildBanAdd,
  async execute(ban) {
    const { guild, user } = ban;

    // Try to fetch audit log to see who banned
    let executor = null;
    let reason = "No reason provided";
    try {
      const fetchedLogs = await guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MemberBanAdd,
      });
      const log = fetchedLogs.entries.first();
      if (
        log &&
        log.target.id === user.id &&
        log.createdTimestamp > Date.now() - 5000
      ) {
        executor = log.executor;
        if (log.reason) reason = log.reason;
      }
    } catch (e) {
      /* ignore */
    }

    const embed = new EmbedBuilder()
      .setColor(0xff0000) // Red
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setTitle("Member Banned")
      .addFields(
        { name: "User", value: `<@${user.id}> (${user.id})`, inline: true },
        { name: "Reason", value: reason, inline: true }
      )
      .setTimestamp();

    if (executor) {
      let moderatorText = executor.tag;

      // If the bot performed the ban, check if it was via command
      if (executor.id === guild.client.user.id) {
        const match = reason.match(/(.*) \(Banned by (.*)\)$/);
        if (match) {
          reason = match[1];
          moderatorText = `${match[2]}`;
        }
      }

      embed.addFields({ name: "Moderator", value: moderatorText });
    }

    // Update reason field with cleaned reason
    const fields = embed.data.fields;
    const reasonField = fields.find((f) => f.name === "Reason");
    if (reasonField) {
      reasonField.value = reason;
    }

    await sendLog(guild, "moderation", embed);
  },
};

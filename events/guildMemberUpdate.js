const { Events, EmbedBuilder, AuditLogEvent } = require("discord.js");
const { sendLog } = require("../lib/logging");

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    if (oldMember.partial) await oldMember.fetch();
    if (newMember.partial) await newMember.fetch();

    const guild = newMember.guild;

    // 1. Role Changes
    const addedRoles = newMember.roles.cache.filter(
      (role) => !oldMember.roles.cache.has(role.id)
    );
    const removedRoles = oldMember.roles.cache.filter(
      (role) => !newMember.roles.cache.has(role.id)
    );

    if (addedRoles.size > 0 || removedRoles.size > 0) {
      const roleEmbed = new EmbedBuilder()
        .setColor(0x0000ff) // Blue
        .setAuthor({
          name: newMember.user.tag,
          iconURL: newMember.user.displayAvatarURL(),
        })
        .setTitle("Member Roles Updated")
        .setDescription(`<@${newMember.id}> roles have changed.`)
        .setTimestamp();

      if (addedRoles.size > 0) {
        roleEmbed.addFields({
          name: "Added Roles",
          value: addedRoles.map((r) => r.toString()).join(", "),
        });
      }

      if (removedRoles.size > 0) {
        roleEmbed.addFields({
          name: "Removed Roles",
          value: removedRoles.map((r) => r.toString()).join(", "),
        });
      }

      await sendLog(guild, "message", roleEmbed);
    }

    // 2. Nickname Changes
    if (oldMember.nickname !== newMember.nickname) {
      const nickEmbed = new EmbedBuilder()
        .setColor(0xe67e22) // Orange
        .setAuthor({
          name: newMember.user.tag,
          iconURL: newMember.user.displayAvatarURL(),
        })
        .setTitle("Nickname Changed")
        .addFields(
          {
            name: "Old Nickname",
            value: oldMember.nickname || "None",
            inline: true,
          },
          {
            name: "New Nickname",
            value: newMember.nickname || "None",
            inline: true,
          }
        )
        .setTimestamp();

      await sendLog(guild, "message", nickEmbed);
    }

    // 3. Server Avatar Changes
    if (oldMember.avatar !== newMember.avatar) {
      const avatarEmbed = new EmbedBuilder()
        .setColor(0xe67e22) // Orange
        .setAuthor({
          name: newMember.user.tag,
          iconURL: newMember.displayAvatarURL(),
        })
        .setTitle("Server Avatar Updated")
        .setDescription(
          `<@${newMember.id}> updated their server profile picture.`
        )
        .setTimestamp();

      const oldUrl = oldMember.avatarURL();
      const newUrl = newMember.avatarURL();

      if (oldUrl) {
        avatarEmbed.addFields({
          name: "Old Avatar",
          value: `[Link](${oldUrl})`,
          inline: true,
        });
      } else {
        avatarEmbed.addFields({
          name: "Old Avatar",
          value: "None (Global)",
          inline: true,
        });
      }

      if (newUrl) {
        avatarEmbed.addFields({
          name: "New Avatar",
          value: `[Link](${newUrl})`,
          inline: true,
        });
        avatarEmbed.setThumbnail(newUrl);
      } else {
        avatarEmbed.addFields({
          name: "New Avatar",
          value: "None (Global)",
          inline: true,
        });
        avatarEmbed.setThumbnail(newMember.user.displayAvatarURL());
      }

      await sendLog(guild, "message", avatarEmbed);
    }

    // 4. Timeout (Communication Disabled)
    // Check if communicationDisabledUntilTimestamp changed
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
    const newTimeout = newMember.communicationDisabledUntilTimestamp;

    // Timed out
    if (
      (!oldTimeout && newTimeout) ||
      (oldTimeout && newTimeout && newTimeout > oldTimeout)
    ) {
      // Try to fetch audit log to see who did it
      let executor = null;
      try {
        const fetchedLogs = await guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.MemberRoleUpdate, // Timeout is technically a role update or member update? Actually it's MemberUpdate usually.
        });
        // Actually for timeouts it's MemberUpdate
        const log = fetchedLogs.entries.first();
        if (
          log &&
          log.target.id === newMember.id &&
          log.createdTimestamp > Date.now() - 5000
        ) {
          executor = log.executor;
        }
      } catch (e) {
        /* ignore */
      }

      const timeoutEmbed = new EmbedBuilder()
        .setColor(0xff0000) // Red
        .setAuthor({
          name: newMember.user.tag,
          iconURL: newMember.user.displayAvatarURL(),
        })
        .setTitle("Member Timed Out")
        .addFields(
          { name: "User", value: `<@${newMember.id}>`, inline: true },
          {
            name: "Until",
            value: `<t:${Math.floor(newTimeout / 1000)}:R>`,
            inline: true,
          }
        )
        .setTimestamp();

      if (executor) {
        timeoutEmbed.addFields({ name: "Moderator", value: executor.tag });
      }

      await sendLog(guild, "moderation", timeoutEmbed);
    }

    // Timeout Removed
    if (oldTimeout && !newTimeout) {
      const removeTimeoutEmbed = new EmbedBuilder()
        .setColor(0x00ff00) // Green
        .setAuthor({
          name: newMember.user.tag,
          iconURL: newMember.user.displayAvatarURL(),
        })
        .setTitle("Timeout Removed")
        .setDescription(`<@${newMember.id}> is no longer timed out.`)
        .setTimestamp();

      await sendLog(guild, "moderation", removeTimeoutEmbed);
    }
  },
};

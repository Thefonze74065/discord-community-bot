const { PermissionFlagsBits } = require("discord.js");

function planVoiceTracking(oldChannelId, newChannelId) {
  if (!oldChannelId && newChannelId) {
    return ["start"];
  }

  if (oldChannelId && !newChannelId) {
    return ["award"];
  }

  if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
    return ["award", "create"];
  }

  return [];
}

function sessionMinutes(startTime, now) {
  return Math.floor((now - new Date(startTime).getTime()) / 60000);
}

function buildStaffPings(guildConfig) {
  const pings = [
    guildConfig.admin_role_id ? `<@&${guildConfig.admin_role_id}>` : null,
    guildConfig.moderator_role_id ? `<@&${guildConfig.moderator_role_id}>` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return pings || undefined;
}

function buildTempVcOverwrites(category, memberId) {
  let permissionOverwrites = [];

  if (category && category.permissionOverwrites) {
    permissionOverwrites = category.permissionOverwrites.cache.map(
      (overwrite) => ({
        id: overwrite.id,
        allow: overwrite.allow.bitfield,
        deny: overwrite.deny.bitfield,
        type: overwrite.type,
      }),
    );
  }

  const memberOverwriteIndex = permissionOverwrites.findIndex(
    (ow) => ow.id === memberId,
  );

  if (memberOverwriteIndex !== -1) {
    const existingAllow = permissionOverwrites[memberOverwriteIndex].allow.toString();
    const existingDeny = permissionOverwrites[memberOverwriteIndex].deny.toString();

    permissionOverwrites[memberOverwriteIndex] = {
      id: memberId,
      allow: [
        existingAllow,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
      ],
      deny: existingDeny,
    };
  } else {
    permissionOverwrites.push({
      id: memberId,
      allow: [
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
      ],
    });
  }

  return permissionOverwrites;
}

module.exports = {
  planVoiceTracking,
  sessionMinutes,
  buildStaffPings,
  buildTempVcOverwrites,
};

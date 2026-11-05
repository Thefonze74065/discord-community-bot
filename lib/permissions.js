const { PermissionFlagsBits } = require("discord.js");

function getMemberRank(member, guildConfig) {
  if (!member) return 0;
  if (member.id === member.guild.ownerId) return 4;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return 3;

  if (
    guildConfig?.admin_role_id &&
    member.roles.cache.has(guildConfig.admin_role_id)
  )
    return 2;
  if (
    guildConfig?.moderator_role_id &&
    member.roles.cache.has(guildConfig.moderator_role_id)
  )
    return 1;
  if (
    guildConfig?.trial_moderator_role_id &&
    member.roles.cache.has(guildConfig.trial_moderator_role_id)
  )
    return 0.5;

  return 0;
}

function canModerate(executor, target, guildConfig) {
  const executorRank = getMemberRank(executor, guildConfig);
  const targetRank = getMemberRank(target, guildConfig);

  return executorRank > targetRank;
}

const STAFF_ROLE_KEYS = {
  admin: "admin_role_id",
  moderator: "moderator_role_id",
  trialModerator: "trial_moderator_role_id",
};

function hasStaffAccess(
  member,
  guildConfig,
  {
    administrator = true,
    permission = null,
    roles = ["admin", "moderator", "trialModerator"],
  } = {},
) {
  if (
    administrator &&
    member.permissions.has(PermissionFlagsBits.Administrator)
  )
    return true;
  if (permission && member.permissions.has(permission)) return true;

  return roles.some((role) => {
    const roleId = guildConfig?.[STAFF_ROLE_KEYS[role]];
    return Boolean(roleId && member.roles.cache.has(roleId));
  });
}

module.exports = { getMemberRank, canModerate, hasStaffAccess };

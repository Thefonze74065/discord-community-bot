const REMINDER_TYPES = {
  FIREWORK_FEST: "fireworkfest",
  GROUP_DIAGNOSIS: "groupdiagnosis",
  DAILY_RESET: "daily",
  WEEKLY_RESET: "weekly",
};

const EVENT_TYPES = {
  READY: "ready",
  MESSAGE_CREATE: "messageCreate",
  MESSAGE_DELETE: "messageDelete",
  MESSAGE_UPDATE: "messageUpdate",
  INTERACTION_CREATE: "interactionCreate",
  GUILD_MEMBER_ADD: "guildMemberAdd",
  GUILD_MEMBER_REMOVE: "guildMemberRemove",
  VOICE_STATE_UPDATE: "voiceStateUpdate",
};

const DEFAULT_MESSAGES = {
  DAILY_RESET:
    "🌅 **Daily Reset!**\nThe game day has reset. Don't forget to complete your daily tasks!",
  WEEKLY_RESET:
    "📅 **Weekly Reset!**\nA new week has begun. Weekly challenges and caps have been reset!",
  GROUP_DIAGNOSIS:
    "🩺 **Group Diagnosis is now open!**\nThe event runs from 2:00 to 6:30 UTC.",
  FIREWORK_FEST: "🎆 **Firework Fest!**\nThe Firework Fest event is now live!",
};

const CRON_SCHEDULES = {
  FIREWORK_FEST_MIDNIGHT: "30 0 * * 6",
  FIREWORK_FEST_NOON: "30 12 * * 6",
  GROUP_DIAGNOSIS: "0 2 * * *",
  DAILY_RESET: "0 21 * * *",
  WEEKLY_RESET: "0 21 * * 0",
  BIRTHDAY_CHECK: "0 9 * * *",
  HEALER_ELECTIONS_PURGE: "0 2 * * 1",
};

const LIMITS = {
  REMINDER_NAME_MAX_LENGTH: 100,
  REMINDER_MESSAGE_MAX_LENGTH: 2000,
  MUTE_DURATION_MAX_DAYS: 28,
  MAX_LEVEL: 100,
};

const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
};

module.exports = {
  REMINDER_TYPES,
  EVENT_TYPES,
  DEFAULT_MESSAGES,
  CRON_SCHEDULES,
  LIMITS,
  TIME,
};

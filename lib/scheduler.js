const cron = require("node-cron");
const db = require("./database");
const { handleEventError } = require("./errors");
const logger = require("./logger");

const DEFAULT_PRONOUN_RULES = [
  { roleName: "He/Him", subject: "he", object: "him" },
  { roleName: "They/Them", subject: "they", object: "them" },
  { roleName: "She/Her", subject: "she", object: "her" },
];

const activeReminderJobs = new Map();

const getGuildsWithBirthdaysStmt = db.prepare(
  "SELECT * FROM birthdays WHERE day = ? AND month = ?",
);
const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");
const deleteExpiredWatchesStmt = db.prepare(
  "DELETE FROM watched_users WHERE expires_at <= ? AND expires_at IS NOT NULL",
);

function startScheduler(client) {
  cron.schedule(
    "0 * * * *",
    async () => {
      logger.info("[SCHEDULER] Cleaning up expired watches...");
      await cleanupExpiredWatches();
    },
    { timezone: "UTC" },
  );

  cron.schedule(
    "0 15 * * *",
    async () => {
      logger.info("[SCHEDULER] Checking for birthdays...");
      await announceBirthdays(client);
    },
    { timezone: "UTC" },
  );

  async function announceBirthdays(client) {
    const today = new Date();
    const day = today.getUTCDate();
    const month = today.getUTCMonth() + 1;

    try {
      const birthdays = getGuildsWithBirthdaysStmt.all(day, month);
      if (!birthdays.length) return;

      const byGuild = {};
      for (const b of birthdays) {
        if (!byGuild[b.guild_id]) byGuild[b.guild_id] = [];
        byGuild[b.guild_id].push(b);
      }

      for (const guildId of Object.keys(byGuild)) {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) continue;

        const guildConfig = getGuildStmt.get(guildId);
        if (guildConfig?.module_birthdays_enabled === false) continue;

        let channelId =
          guildConfig?.birthday_announcement_channel_id ||
          guildConfig?.welcome_channel_id ||
          guildConfig?.reset_reminder_channel_id;
        if (!channelId) continue;

        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) continue;

        for (const b of byGuild[guildId]) {
          try {
            const member = await guild.members.fetch(b.user_id).catch(() => null);
            if (!member) continue;

            const pronounRule = resolveBirthdayPronounRule(guild, member, guildConfig);
            const subject = pronounRule.subject || "they";
            const object = pronounRule.object || "them";

            let msg = "";
            if (guildConfig?.birthday_role_id) {
              msg = `<@&${guildConfig.birthday_role_id}> `;
            }

            if (b.year) {
              const age = today.getUTCFullYear() - b.year;
              msg += `🎉 It's <@${b.user_id}>'s birthday! Wish ${object} a wonderful day — ${subject} ${subject === "they" ? "turn" : "turns"} **${age}** today!`;
            } else {
              msg += `🎉 It's <@${b.user_id}>'s birthday! Wish ${object} a wonderful day!`;
            }
            await channel.send(msg);
          } catch (err) {
            logger.error(`[SCHEDULER] Error announcing birthday for ${b.user_id}:`, err);
          }
        }
      }
    } catch (error) {
      handleEventError("Birthday announcements", error);
    }
  }

  function resolveBirthdayPronounRule(guild, member, guildConfig) {
    const configuredRules = Array.isArray(guildConfig?.birthday_pronoun_roles)
      ? JSON.parse(guildConfig.birthday_pronoun_roles)
      : [];
    const rules = configuredRules.length > 0 ? configuredRules : DEFAULT_PRONOUN_RULES;

    for (const rule of rules) {
      if (!rule) continue;

      if (rule.role_id && member.roles.cache.has(rule.role_id)) {
        return rule;
      }

      if (rule.role_name) {
        const role = guild.roles.cache.find((guildRole) => guildRole.name === rule.role_name);
        if (role && member.roles.cache.has(role.id)) {
          return rule;
        }
      }
    }

    return { subject: "they", object: "them" };
  }

  cron.schedule(
    "0 21 * * *",
    async () => {
      logger.info("[SCHEDULER] Running nightly maintenance...");
    },
    { timezone: "UTC" },
  );

  initializeCustomReminders(client);

  logger.info("[INFO] Scheduler started (UTC)");
}

async function initializeCustomReminders(client) {
  try {
    const reminders = db.prepare("SELECT * FROM global_reminders").all();
    logger.info(`[SCHEDULER] Loading ${reminders.length} custom reminders...`);

    for (const reminder of reminders) {
      scheduleCustomReminder(client, reminder);
    }
  } catch (error) {
    handleEventError("Initialize custom reminders", error);
  }
}

function scheduleCustomReminder(client, reminder) {
  if (activeReminderJobs.has(reminder.id)) {
    activeReminderJobs.get(reminder.id).stop();
  }

  try {
    const job = cron.schedule(
      reminder.cron,
      async () => {
        logger.info(`[SCHEDULER] Executing custom reminder: ${reminder.name}`);
        await executeCustomReminder(client, reminder);
      },
      { timezone: "UTC" },
    );

    activeReminderJobs.set(reminder.id, job);
    logger.info(`[SCHEDULER] Scheduled "${reminder.name}" with cron: ${reminder.cron}`);
  } catch (error) {
    handleEventError("Schedule custom reminder", error, {
      reminderId: reminder.id, reminderName: reminder.name, cron: reminder.cron,
    });
  }
}

async function executeCustomReminder(client, reminder) {
  try {
    const guild = await client.guilds.fetch(reminder.guild_id).catch(() => null);
    if (!guild) {
      logger.info(`[SCHEDULER] Guild ${reminder.guild_id} not found for reminder: ${reminder.name}`);
      return;
    }

    let channelId = reminder.channel_id;
    if (!channelId) {
      const guildConfig = getGuildStmt.get(reminder.guild_id);
      channelId = guildConfig?.reset_reminder_channel_id;
    }

    if (!channelId) {
      logger.info(`[SCHEDULER] No channel configured for reminder: ${reminder.name}`);
      return;
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      logger.info(`[SCHEDULER] Channel ${channelId} not found or not text-based`);
      return;
    }

    const content = reminder.role_id
      ? `<@&${reminder.role_id}> ${reminder.message}`
      : reminder.message;

    await channel.send(content);
    logger.info(`[SCHEDULER] Sent reminder "${reminder.name}" to ${guild.name}`);
  } catch (error) {
    handleEventError("Execute custom reminder", error, {
      reminderId: reminder.id, reminderName: reminder.name, guildId: reminder.guild_id,
    });
  }
}

function reloadCustomReminders(client) {
  logger.info("[SCHEDULER] Reloading custom reminders from database...");
  for (const [id, job] of activeReminderJobs.entries()) {
    job.stop();
    activeReminderJobs.delete(id);
  }
  initializeCustomReminders(client);
}

async function cleanupExpiredWatches() {
  try {
    const result = deleteExpiredWatchesStmt.run(new Date().toISOString());
    if (result.changes > 0) {
      logger.info(`[SCHEDULER] Removed ${result.changes} expired watch(es).`);
    }
  } catch (error) {
    handleEventError("Cleanup expired watches", error, {});
  }
}

module.exports = { startScheduler, reloadCustomReminders };

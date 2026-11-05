const {
  Events,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { sendLog } = require("../lib/logging");
const db = require("../lib/database");
const { config, guildValue } = require("../lib/config");
const logger = require("../lib/logger");

const getGuildStmt = db.prepare("SELECT * FROM guilds WHERE id = ?");
const createUserNoteStmt = db.prepare(
  "INSERT INTO user_notes (guild_id, user_id, moderator_id, content, created_at) VALUES (@guild_id, @user_id, @moderator_id, @content, CURRENT_TIMESTAMP)",
);
const createModmailTicketStmt = db.prepare(
  `INSERT INTO modmail_tickets (guild_id, channel_id, user_id, status, created_at)
   VALUES (@guild_id, @channel_id, @user_id, 'OPEN', CURRENT_TIMESTAMP)`,
);
const getWatchedUserStmt = db.prepare(
  "SELECT * FROM watched_users WHERE guild_id = ? AND user_id = ?",
);
const deleteWatchedUserStmt = db.prepare(
  "DELETE FROM watched_users WHERE id = ?",
);

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const guildConfig = getGuildStmt.get(member.guild.id);
    if (!guildConfig) return;

    if (
      guildConfig.module_welcome_enabled !== false &&
      guildConfig.welcome_channel_id
    ) {
      const welcomeChannel = member.guild.channels.cache.get(
        guildConfig.welcome_channel_id,
      );

      if (welcomeChannel && welcomeChannel.isTextBased()) {
        const memberCount = member.guild.memberCount;
        const getOrdinal = (n) => {
          const s = ["th", "st", "nd", "rd"];
          const v = n % 100;
          return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };

        const message = `Hello, ${member}, welcome to ${member.guild.name
          }. You are the ${getOrdinal(memberCount)} member to join.`;

        await welcomeChannel.send(message).catch(logger.error);
      }
    }

    const accountAgeTimestamp = Math.floor(member.user.createdTimestamp / 1000);
    const accountAgeMs = Date.now() - member.user.createdTimestamp;
    const sevenDaysMs = guildValue(
      guildConfig,
      "new_account_threshold_days",
      config.newAccountThresholdMs,
      24 * 60 * 60 * 1000,
    );

    if (
      guildConfig.module_new_account_guard_enabled !== false &&
      accountAgeMs < sevenDaysMs
    ) {
      try {
        createUserNoteStmt.run({
          guild_id: member.guild.id,
          user_id: member.id,
          moderator_id: member.client.user.id,
          content:
            "Auto-Note: Account is less than 30 days old upon joining.",
        });
        logger.info(
          `[INFO] Added auto-note for new account: ${member.user.tag} (${member.id})`,
        );

        const guardMuteRoleId =
          guildConfig.new_account_guard_mute_role_id ||
          guildConfig.mute_role_id;
        if (guardMuteRoleId) {
          const muteRole = member.guild.roles.cache.get(guardMuteRoleId);
          if (muteRole) {
            await member.roles
              .add(muteRole)
              .catch((err) =>
                logger.error(
                  `Failed to add mute role to ${member.user.tag}:`,
                  err,
                ),
              );
          }
        }

        if (
          guildConfig.module_modmail_enabled !== false &&
          guildConfig.modmail_category_id
        ) {
          const category = member.guild.channels.cache.get(
            guildConfig.modmail_category_id,
          );

          if (category && category.type === ChannelType.GuildCategory) {
            const existingChannel = category.children.cache.find(
              (c) => c.topic && c.topic.includes(member.id),
            );

            if (!existingChannel) {
              const permissionOverwrites = [
                {
                  id: member.guild.id,
                  deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                  id: member.id,
                  allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.AttachFiles,
                    PermissionsBitField.Flags.ReadMessageHistory,
                  ],
                },
                {
                  id: member.client.user.id,
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

              const ticketChannel = await member.guild.channels.create({
                name: `ticket-${member.user.username}`,
                type: ChannelType.GuildText,
                parent: guildConfig.modmail_category_id,
                topic: `Modmail Ticket for ${member.id} | Auto-Opened (New Account)`,
                permissionOverwrites: permissionOverwrites,
              });

              createModmailTicketStmt.run({
                guild_id: member.guild.id,
                channel_id: ticketChannel.id,
                user_id: member.id,
              });

              const embed = new EmbedBuilder()
                .setTitle("New Account Verification")
                .setDescription(
                  `Hello ${member}, your account is less than 30 days old.\n\n` +
                    `To protect our community, you have been automatically muted. This is precaution for new accounts to avoid bots, raids and ban evasion. ` +
                    `Please explain why you have joined with a new account. A staff member will review your case shortly.`,
                )
                .setColor("#E67E22")
                .setTimestamp();

              const closeButton = new ButtonBuilder()
                .setCustomId("modmail_close")
                .setLabel("Close Ticket")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🔒");

              const row = new ActionRowBuilder().addComponents(closeButton);

              let pings = `${member}`;
              if (guildConfig.admin_role_id)
                pings += ` <@&${guildConfig.admin_role_id}>`;
              if (guildConfig.moderator_role_id)
                pings += ` <@&${guildConfig.moderator_role_id}>`;
              if (guildConfig.trial_moderator_role_id)
                pings += ` <@&${guildConfig.trial_moderator_role_id}>`;

              await ticketChannel.send({
                content: pings,
                embeds: [embed],
                components: [row],
              });
            }
          }
        }

        if (
          guildConfig.module_logging_enabled &&
          guildConfig.moderator_role_id
        ) {
          const warningEmbed = new EmbedBuilder()
            .setColor(0xffcc00)
            .setTitle("⚠️ New Account Alert")
            .setDescription(
              `**User:** ${member} (${member.id})\n**Account Created:** <t:${accountAgeTimestamp}:R>\n\nAn auto-note has been added.`,
            )
            .setTimestamp();

          await sendLog(member.guild, "joinLeave", warningEmbed);
        }
      } catch (error) {
        logger.error("Failed to add auto-note for new member:", error);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setAuthor({
        name: `${member.user.tag} (${member.id})`,
        iconURL: member.user.displayAvatarURL(),
      })
      .setTitle("Member Joined")
      .setDescription(`<@${member.id}> has joined the server.`)
      .addFields(
        {
          name: "Account Created",
          value: `<t:${accountAgeTimestamp}:F> (<t:${accountAgeTimestamp}:R>)`,
          inline: true,
        },
        {
          name: "Member Count",
          value: `${member.guild.memberCount}`,
          inline: true,
        },
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: `ID: ${member.id}` })
      .setTimestamp();

    await sendLog(member.guild, "joinLeave", embed);

    try {
      const watchEntry = getWatchedUserStmt(member.guild.id, member.id);

      if (watchEntry) {
        if (
          watchEntry.expires_at &&
          new Date(watchEntry.expires_at) < new Date()
        ) {
          deleteWatchedUserStmt.run(watchEntry.id);
          return;
        }

        const watchEmbed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle("👁️ Watched User Alert: Member Joined")
          .setDescription(`${member} has joined the server.`)
          .addFields(
            {
              name: "User",
              value: `${member.user.tag} (${member.id})`,
              inline: false,
            },
            {
              name: "Watch Reason",
              value: watchEntry.reason || "No reason provided",
              inline: false,
            },
            {
              name: "Account Created",
              value: `<t:${accountAgeTimestamp}:R>`,
              inline: true,
            },
          )
          .setThumbnail(member.user.displayAvatarURL())
          .setTimestamp();

        const pings = [
          guildConfig.admin_role_id ? `<@&${guildConfig.admin_role_id}>` : null,
          guildConfig.moderator_role_id
            ? `<@&${guildConfig.moderator_role_id}>`
            : null,
        ]
          .filter(Boolean)
          .join(" ");

        await sendLog(
          member.guild,
          "joinLeave",
          watchEmbed,
          [],
          null,
          pings || undefined,
        );
      }
    } catch (error) {
      logger.error(
        "[ERROR] Failed to check watch list on member join:",
        error,
      );
    }
  },
};

// Minimal fake of a Discord chat-input interaction, recording replies.
function makeInteraction({
  userId = "user-1",
  guildId = "guild-1",
  channelId = "chan-1",
  integers = {},
  strings = {},
} = {}) {
  const interaction = {
    guildId,
    channelId,
    user: {
      id: userId,
      username: "tester",
      displayAvatarURL: () => "https://example.invalid/avatar.png",
      toString: () => `<@${userId}>`,
    },
    options: {
      getInteger: (name) => integers[name],
      getString: (name) => strings[name],
    },
    replied: false,
    deferred: false,
    replies: [],
    edits: [],
    reply: async (payload) => {
      interaction.replied = true;
      interaction.replies.push(payload);
      return interaction.replyResult;
    },
    editReply: async (payload) => {
      interaction.edits.push(payload);
    },
    followUp: async (payload) => {
      interaction.replies.push(payload);
    },
  };
  return interaction;
}

module.exports = { makeInteraction };

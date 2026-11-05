const {
  initializeVoiceTracking,
  stopVoiceTracking,
  handleVoiceTracking,
} = require("../lib/voiceTracking");
const {
  handleTtsAutoLeave,
  logVoiceStateChange,
} = require("../lib/voiceLogging");
const { handleUserJoinedVC, handleUserLeftVC } = require("../lib/tempVoice");

module.exports = {
  name: "voiceStateUpdate",
  initializeVoiceTracking,
  stopVoiceTracking,
  async execute(oldState, newState) {
    await handleTtsAutoLeave(oldState);

    await handleVoiceTracking(oldState, newState);

    await logVoiceStateChange(oldState, newState);

    if (!oldState.channel && newState.channel) {
      await handleUserJoinedVC(newState);
    }

    if (oldState.channel && !newState.channel) {
      await handleUserLeftVC(oldState);
    }

    if (
      oldState.channel &&
      newState.channel &&
      oldState.channel.id !== newState.channel.id
    ) {
      await handleUserJoinedVC(newState);
      await handleUserLeftVC(oldState);
    }
  },
};

const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require("@discordjs/voice");
const { Readable } = require("stream");
const wav = require("wav-decoder");
const db = require("./database");
const { handleEventError } = require("./errors");
const logger = require("./logger");

const sessions = new Map();

async function joinChannel(channel, textChannel) {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

    const player = createAudioPlayer();
    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
      processQueue(channel.guild.id);
    });

    player.on("error", (error) => {
      handleEventError("TTS audio player", error, {
        guildId: channel.guild.id,
      });
      processQueue(channel.guild.id);
    });

    sessions.set(channel.guild.id, {
      connection,
      player,
      queue: [],
      isPlaying: false,
      textChannelId: textChannel.id,
      lastSpeaker: null,
    });

    return true;
  } catch (error) {
    connection.destroy();
    throw error;
  }
}

function leaveChannel(guildId) {
  const session = sessions.get(guildId);
  if (session) {
    session.connection.destroy();
    sessions.delete(guildId);
    return true;
  }
  return false;
}

async function addToQueue(guildId, username, text, opts = {}) {
  const session = sessions.get(guildId);
  if (!session) return false;

  try {
    const guildConfig = db
      .prepare(
        "SELECT module_automod_enabled, auto_mod_bad_words FROM guilds WHERE id = ?",
      )
      .get(guildId);

    if (
      guildConfig &&
      guildConfig.module_automod_enabled &&
      guildConfig.auto_mod_bad_words
    ) {
      const badWords = JSON.parse(guildConfig.auto_mod_bad_words);
      if (badWords.length > 0) {
        const content = text.toLowerCase();
        const hasBadWord = badWords.some((word) =>
          content.includes(word.toLowerCase()),
        );

        if (hasBadWord) {
          return false;
        }
      }
    }
  } catch (error) {
    handleEventError("TTS banned words check", error, { guildId });
  }

  let speechText;
  if (opts.skipSpeaker) {
    speechText = text;
  } else if (session.lastSpeaker === username) {
    speechText = text;
  } else {
    speechText = `${username} says: ${text}`;
    session.lastSpeaker = username;
  }

  session.queue.push(speechText);

  if (!session.isPlaying) {
    processQueue(guildId);
  }

  return true;
}

async function processQueue(guildId) {
  const session = sessions.get(guildId);
  if (!session) return;

  if (session.queue.length === 0) {
    session.isPlaying = false;
    return;
  }

  session.isPlaying = true;
  const text = session.queue.shift();

  try {
    const { stream: audioStream, duration: audioSeconds } = await generateAudioWithDuration(text);
    const resource = createAudioResource(audioStream);
    session.player.play(resource);

    try {
      db.prepare(
        "INSERT INTO tts_logs (guild_id, user_id, character_count, audio_seconds, timestamp) VALUES (@guild_id, @user_id, @character_count, @audio_seconds, CURRENT_TIMESTAMP)",
      ).run({
        guild_id: guildId,
        user_id: session.lastSpeaker || "unknown",
        character_count: text.length,
        audio_seconds: audioSeconds,
      });
    } catch (logErr) {
      handleEventError("TTS usage logging", logErr, { guildId });
    }
  } catch (error) {
    handleEventError("TTS audio generation/playback", error, { guildId });
    session.isPlaying = false;
    processQueue(guildId);
  }
}

async function generateAudioWithDuration(text) {
  const apiUrl = process.env.TTS_API_URL || "http://localhost:8004";
  const url = `${apiUrl}/tts`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voice_mode: "predefined",
      predefined_voice_id: "Emily.wav",
      output_format: "wav",
      split_text: false,
      chunk_size: 120,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chatterbox TTS API error: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let duration = 0;
  try {
    const decoded = await wav.decode(buffer);
    if (decoded && decoded.sampleRate && decoded.length) {
      duration = decoded.length / decoded.sampleRate;
    }
  } catch (err) {
    handleEventError("TTS WAV decode for duration", err);
  }

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  return { stream, buffer, duration };
}

function getSession(guildId) {
  return sessions.get(guildId);
}

async function sendTTSShutdownWarnings(client) {
  for (const [guildId, session] of sessions) {
    if (client && session.textChannelId) {
      try {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
          const textChannel = guild.channels.cache.get(session.textChannelId);
          if (textChannel && textChannel.send) {
            await textChannel.send(
              ":warning: Bot is restarting for an update. TTS will be back soon!",
            );
          }
        }
      } catch (err) {
        handleEventError("TTS shutdown message", err, { guildId });
      }
    }
  }
}

async function leaveAllChannels(client) {
  for (const [guildId, session] of sessions) {
    try {
      session.connection.destroy();
      logger.info(`[TTS] Left voice channel in guild ${guildId}`);
    } catch (error) {
      handleEventError("TTS leave voice channel", error, { guildId });
    }
  }
  sessions.clear();
}

module.exports = {
  joinChannel,
  leaveChannel,
  addToQueue,
  getSession,
  leaveAllChannels,
  sendTTSShutdownWarnings,
};

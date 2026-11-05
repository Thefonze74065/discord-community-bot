-- SQLite schema for discord-community-bot (public lite repo)
-- All ID columns are TEXT (Discord snowflakes or sqlite randomblob IDs).
-- Booleans are stored as INTEGER (0/1).
-- JSON arrays/objects are stored as TEXT (SQLite JSON1 extension).

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Guild configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guilds (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Channel / role IDs (TEXT, nullable)
    birthday_announcement_channel_id TEXT,
    birthday_role_id TEXT,
    level_up_channel_id TEXT,
    giveaway_channel_id TEXT,
    gamble_channel_id TEXT,
    tts_channel_id TEXT,
    welcome_channel_id TEXT,
    moderator_role_id TEXT,
    trial_moderator_role_id TEXT,
    admin_role_id TEXT,
    mute_role_id TEXT,
    moderation_logs_channel_id TEXT,
    message_logs_channel_id TEXT,
    join_leave_logs_channel_id TEXT,
    image_logs_channel_id TEXT,
    vc_transcript_channel_id TEXT,
    modmail_category_id TEXT,
    modmail_logs_channel_id TEXT,
    reset_reminder_channel_id TEXT,
    temp_vc_channel_id TEXT,
    temp_vc_category_id TEXT,

    -- Strings
    temp_vc_name_format TEXT DEFAULT "{username}'s VC",

    -- Integers
    house_cut_percent INTEGER DEFAULT 10,
    casino_min_bet INTEGER DEFAULT 10,
    casino_max_bet INTEGER DEFAULT 5000,
    casino_cooldown_seconds INTEGER DEFAULT 5,
    casino_starting_balance INTEGER DEFAULT 500,
    casino_daily_amount INTEGER DEFAULT 250,
    casino_streak_bonus INTEGER DEFAULT 25,
    casino_daily_loss_cap INTEGER DEFAULT 0,
    auto_mod_ping_limit INTEGER DEFAULT 5,
    auto_mod_attachment_limit INTEGER DEFAULT 3,

    -- Feature flags (0/1)
    module_leveling_enabled INTEGER DEFAULT 1,
    module_logging_enabled INTEGER DEFAULT 0,
    module_reminders_enabled INTEGER DEFAULT 1,
    module_temp_vc_enabled INTEGER DEFAULT 0,
    module_automod_enabled INTEGER DEFAULT 0,
    module_giveaways_enabled INTEGER DEFAULT 1,
    module_birthdays_enabled INTEGER DEFAULT 1,
    module_welcome_enabled INTEGER DEFAULT 1,
    module_modmail_enabled INTEGER DEFAULT 1,
    module_reaction_roles_enabled INTEGER DEFAULT 1,
    module_role_menus_enabled INTEGER DEFAULT 1,
    module_tts_enabled INTEGER DEFAULT 1,
    module_new_account_guard_enabled INTEGER DEFAULT 1,
    module_casino_enabled INTEGER DEFAULT 0,

    -- Tunable overrides (nullable)
    message_xp_cooldown_seconds INTEGER,
    reaction_xp_cooldown_seconds INTEGER,
    casino_chat_drip_amount INTEGER,
    watch_message_alert_cooldown_minutes INTEGER,
    new_account_threshold_days INTEGER,
    alms_threshold INTEGER,
    alms_amount INTEGER,
    alms_interval_hours INTEGER,
    max_streak_days INTEGER,
    blackjack_hand_timeout_seconds INTEGER,
    slots_spin_frames INTEGER,
    slots_frame_delay_ms INTEGER,

    -- JSON config (TEXT, SQLite JSON1)
    casino_games_enabled TEXT DEFAULT '["coinflip","dice","slots","blackjack"]',
    logging_ignore_channel_ids TEXT DEFAULT '[]',
    tts_name_overrides TEXT,
    birthday_pronoun_roles TEXT,
    auto_mod_bad_words TEXT DEFAULT '["nigg","cunt"]',
    auto_mod_strict_words TEXT DEFAULT '[]'
);

-- ---------------------------------------------------------------------------
-- Wallets / economy (Golden Needles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    balance INTEGER DEFAULT 0,
    last_daily_at DATETIME,
    daily_streak INTEGER DEFAULT 0,
    last_alms_at DATETIME,
    total_wagered INTEGER DEFAULT 0,
    total_won INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, guild_id)
);

CREATE INDEX IF NOT EXISTS idx_wallets_guild_balance ON wallets(guild_id, balance);

-- ---------------------------------------------------------------------------
-- Levels / XP
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_levels (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,
    messages INTEGER DEFAULT 0,
    reactions INTEGER DEFAULT 0,
    voice_time INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, guild_id)
);

-- ---------------------------------------------------------------------------
-- User daily activity
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_daily_activities (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    date TEXT NOT NULL, -- stored as YYYY-MM-DD
    messages INTEGER DEFAULT 0,
    voice_time INTEGER DEFAULT 0,
    reactions INTEGER DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    UNIQUE(user_id, guild_id, date)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_activities_guild_date ON user_daily_activities(guild_id, date);

-- ---------------------------------------------------------------------------
-- Level rewards
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS level_rewards (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    guild_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    role_id TEXT NOT NULL,
    color_role_id TEXT,
    UNIQUE(guild_id, level)
);

-- ---------------------------------------------------------------------------
-- Modmail tickets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modmail_tickets (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    guild_id TEXT NOT NULL,
    channel_id TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'OPEN',
    transcript_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_modmail_tickets_guild ON modmail_tickets(guild_id);
CREATE INDEX IF NOT EXISTS idx_modmail_tickets_user ON modmail_tickets(user_id);

-- ---------------------------------------------------------------------------
-- Giveaways
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS giveaways (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    channel_name TEXT,
    message_id TEXT,
    prize TEXT NOT NULL,
    sponsors TEXT, -- JSON array
    end_time DATETIME NOT NULL,
    winner_count INTEGER DEFAULT 1,
    winners TEXT, -- JSON array
    description TEXT,
    created_by TEXT NOT NULL,
    ended INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Giveaway entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS giveaway_entries (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    giveaway_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(giveaway_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Gamble logs (casino game history)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gamble_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    game TEXT NOT NULL,
    bet INTEGER NOT NULL,
    payout INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gamble_logs_guild_created ON gamble_logs(guild_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gamble_logs_guild_user_created ON gamble_logs(guild_id, user_id, created_at);

-- ---------------------------------------------------------------------------
-- Warnings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warnings (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id, user_id);

-- ---------------------------------------------------------------------------
-- User notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_notes (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_notes_guild_user ON user_notes(guild_id, user_id);

-- ---------------------------------------------------------------------------
-- Birthdays
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS birthdays (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, guild_id)
);

CREATE INDEX IF NOT EXISTS idx_birthdays_guild_month_day ON birthdays(guild_id, month, day);

-- ---------------------------------------------------------------------------
-- Global reminders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS global_reminders (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    guild_id TEXT,
    channel_id TEXT,
    role_id TEXT,
    name TEXT NOT NULL,
    cron TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Todo items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS todo_items (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    priority TEXT DEFAULT 'medium',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_todo_items_guild_user ON todo_items(guild_id, user_id);

-- ---------------------------------------------------------------------------
-- Watched users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watched_users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT,
    expires_at DATETIME,
    last_message_alert_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_watched_users_guild ON watched_users(guild_id);
CREATE INDEX IF NOT EXISTS idx_watched_users_expires ON watched_users(expires_at);

-- ---------------------------------------------------------------------------
-- TTS logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tts_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    character_count INTEGER NOT NULL,
    audio_seconds REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tts_logs_guild ON tts_logs(guild_id);
CREATE INDEX IF NOT EXISTS idx_tts_logs_user ON tts_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_tts_logs_timestamp ON tts_logs(timestamp);

-- ---------------------------------------------------------------------------
-- Temp voice channels
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS temp_voice_channels (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    channel_id TEXT UNIQUE NOT NULL,
    guild_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_temp_voice_channels_guild ON temp_voice_channels(guild_id);
CREATE INDEX IF NOT EXISTS idx_temp_voice_channels_channel ON temp_voice_channels(channel_id);

-- ---------------------------------------------------------------------------
-- Voice sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice_sessions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT UNIQUE NOT NULL,
    guild_id TEXT NOT NULL,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Reaction roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reaction_roles (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    role_id TEXT NOT NULL,
    UNIQUE(message_id, emoji)
);

-- ---------------------------------------------------------------------------
-- Role menus
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_menus (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT UNIQUE NOT NULL,
    placeholder TEXT,
    min_values INTEGER DEFAULT 1,
    max_values INTEGER DEFAULT 1
);

-- ---------------------------------------------------------------------------
-- Role menu options
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_menu_options (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    menu_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    emoji TEXT,
    value TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Saved embeds
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_embeds (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT UNIQUE NOT NULL,
    data TEXT NOT NULL, -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Dashboard messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dashboard_messages (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT UNIQUE NOT NULL,
    data TEXT NOT NULL, -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- User game accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_game_accounts (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    game TEXT NOT NULL,
    uid TEXT NOT NULL,
    region TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, guild_id, game)
);

CREATE INDEX IF NOT EXISTS idx_user_game_accounts_guild_game_region ON user_game_accounts(guild_id, game, region);

-- ---------------------------------------------------------------------------
-- Moderator actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS moderator_actions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    guild_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT,
    target_tag TEXT,
    reason TEXT,
    details TEXT, -- JSON
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_moderator_actions_guild ON moderator_actions(guild_id);
CREATE INDEX IF NOT EXISTS idx_moderator_actions_moderator ON moderator_actions(moderator_id);
CREATE INDEX IF NOT EXISTS idx_moderator_actions_timestamp ON moderator_actions(timestamp);
CREATE INDEX IF NOT EXISTS idx_moderator_actions_guild_mod ON moderator_actions(guild_id, moderator_id);
CREATE INDEX IF NOT EXISTS idx_moderator_actions_guild_ts ON moderator_actions(guild_id, timestamp);

<img src="assets/icon.svg" width="64" height="64" alt="">

# discord-community-bot

A sanitized, zero-config Discord bot template based on Divine-Buddha.

Built with discord.js v14, better-sqlite3, Express, and Passport Discord OAuth. Includes moderation, casino economy, leveling, modmail tickets, giveaways, birthdays, reminders, reaction roles, and a web-based config dashboard.

> ⚠️ This is a community template, not a plug-and-play product. Server-specific configuration (guild IDs, channel IDs, role names, hardcoded staff references) has been removed and replaced with database-driven settings and .env placeholders. Use it as a starting point for your own Discord server, or hire me to customize it for you.

---

## Features

| Category | Features |
|----------|----------|
| Moderation | Ban, kick, mute, timeout, untimeout, warn, purge, mod logs, watched users, user notes |
| Tickets / Modmail | Modmail ticket channels, modmail logs, category-based ticket creation |
| Economy / Casino | Golden Needles wallet, daily, coinflip, dice, slots, blackjack, leaderboards, giveaways, per-server tunable bet limits |
| Leveling | XP from messages, reactions, and voice time; level-up announcements; level roles; leaderboards |
| Social | Birthdays with announcements, cron-based reminders, reaction roles, role menus, welcome messages |
| Dashboard | Express web dashboard, Discord OAuth2 login, embed builder, server config, activity viewer, TTS stats |
| Utility | Ping, info, TTS, UID lookup, todo lists, emergency commands |

## Tech stack

- Runtime: Node.js 18+ (CommonJS)
- Discord API: discord.js v14
- Database: SQLite via better-sqlite3 — zero setup, single file
- Web dashboard: Express 5, Passport.js + passport-discord, express-session
- Testing: Node node --test
- Linting/Format: ESLint 9, Prettier
- Deployment: Docker, Docker Compose, GitHub Actions CI/CD

## Repository structure

commands/         Slash command files (one per command)
events/           Discord client events (ready, interactionCreate, etc.)
lib/              Shared logic: database, leveling, economy, logging, process handlers
schema.sql        SQLite schema (all tables)
dashboard/        Express web app (auth, routes, public HTML/JS/CSS)
test/             Unit tests (node --test)
.env.example      Copy to .env and fill in your values
index.js          Bot entry point
deploy-commands.js Slash command registration

## Quick start

### 1. Clone and install

git clone https://github.com/Thefonze74065/discord-community-bot.git
cd discord-community-bot
npm install

### 2. Configure environment

Copy .env.example to .env and fill in your Discord app credentials:

cp .env.example .env

Required variables:

| Variable | Description |
|----------|-------------|
| DISCORD_TOKEN | Your Discord bot token |
| CLIENT_ID | Your Discord application Client ID |
| DISCORD_CLIENT_SECRET | Your Discord application client secret |
| BASE_URL | Public URL of your dashboard (e.g. https://bot.yourdomain.com) |
| DASHBOARD_CALLBACK_URL | OAuth redirect URL (e.g. https://bot.yourdomain.com/auth/discord/callback) |
| SESSION_SECRET | Random string for Express sessions |
| DATABASE_PATH | Path to SQLite file (default: ./database.sqlite) |

Create a Discord application at discord.com/developers/applications and enable the Message Content Intent.

### 3. Register slash commands

npm run deploy

### 4. Start the bot

npm start

The bot and dashboard start together. Visit http://localhost:3000 (or your BASE_URL) to access the web dashboard.

### 5. Deploy with Docker

docker-compose up -d

A named volume persists database.sqlite across container restarts.

## Environment variables (.env.example)

# Discord
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_discord_app_client_id
DISCORD_CLIENT_ID=your_discord_app_client_id
DISCORD_CLIENT_SECRET=your_discord_app_client_secret
BASE_URL=http://localhost:3000
DASHBOARD_CALLBACK_URL=http://localhost:3000/auth/discord/callback

# Database (SQLite - no setup required)
DATABASE_PATH=./database.sqlite

# Session
SESSION_SECRET=change_this_to_a_random_string

# Optional
TTS_API_URL=http://localhost:8004
NODE_ENV=development
PORT=3000

## Testing

npm test

Uses Node's built-in test runner (node --test).

## Linting

npm run lint

## Screenshots

Add screenshots here of:
- The bot in a Discord server (moderation commands, economy games)
- The web dashboard (login, embed builder, server config)
- The modmail ticket system

---

## Hire me

I built this bot and maintain a production version with unit tests, CI/CD, Docker, and a full web dashboard. I can:

- Install and configure this bot in your Discord server
- Add custom commands or features specific to your community
- Set up hosting (Railway, Render, VPS, Docker)
- Provide ongoing maintenance and updates

Stack: discord.js v14 · JavaScript · SQLite · PostgreSQL · Express · Docker · GitHub Actions

Order a custom Discord bot on VGen https://vgen.co/Thefonze7
Contact me for a free quote

---

## License

ISC License. See LICENSE.

You may use this code for your own Discord server(s). You may not resell or redistribute this template as your own product.

---

## Roadmap / Contributing

This is a template, not a product. Open issues for bugs or feature suggestions. Pull requests welcome.

Maintained by Thefonze74065 — Godot (GDScript/C#), discord.js (JS/TS), Rust, Python, C++.
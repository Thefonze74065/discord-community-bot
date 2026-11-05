(function () {
  const { createApp } = Vue;

  // Global fetch interceptor for 401s
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401) {
      window.location.href = "/login.html";
    }
    return response;
  };

  createApp({
    data() {
      return {
        user: null,
        loading: true,
        saving: false,
        adminGuilds: [],
        selectedGuildId: "",

        // Guild Data
        config: null,
        textChannels: [],
        voiceChannels: [],
        categories: [],
        roles: [],

        // Modmail
        modmailPanelChannelId: "",
        sendingPanel: false,

        // Level Rewards UI
        newLevelReward: { level: "", roleId: "", colorRoleId: "" },
        levelRewardError: null,
      };
    },
    watch: {
      selectedGuildId(newVal) {
        if (newVal) {
          this.fetchGuildData(newVal);
        } else {
          this.config = null;
          // Only reset properties, never replace object
          this.newLevelReward.level = "";
          this.newLevelReward.roleId = "";
          this.newLevelReward.colorRoleId = "";
        }
      },
    },
    async mounted() {
      await this.fetchUser();
      await this.fetchAdminGuilds();
      this.loading = false;
    },
    methods: {
      createConfigDefaults() {
        return {
          autoModBadWords: [],
          autoModStrictWords: [],
          loggingIgnoreChannelIds: [],
          levelRewards: [],
          moduleLevelingEnabled: true,
          moduleTempVcEnabled: false,
          moduleLoggingEnabled: false,
          moduleAutoModEnabled: false,
          moduleRemindersEnabled: true,
          moduleGiveawaysEnabled: true,
          moduleBirthdaysEnabled: true,
          moduleWelcomeEnabled: true,
          moduleModmailEnabled: true,
          moduleReactionRolesEnabled: true,
          moduleRoleMenusEnabled: true,
          moduleTtsEnabled: true,
          moduleNewAccountGuardEnabled: true,
          moduleCasinoEnabled: false,
          casinoMinBet: 10,
          casinoMaxBet: 5000,
          casinoCooldownSeconds: 5,
          casinoStartingBalance: 500,
          casinoDailyAmount: 250,
          casinoStreakBonus: 25,
          casinoDailyLossCap: 0,
          casinoTransfersEnabled: false,
          casinoChatDripEnabled: false,
          casinoGamesEnabled: ["coinflip", "dice", "slots", "blackjack"],
          newAccountGuardMuteRoleId: null,
          ttsNameOverrides: [],
          birthdayPronounRoles: [],
        };
      },
      async fetchUser() {
        try {
          const res = await fetch("/api/user");
          if (res.ok) {
            this.user = await res.json();
          }
        } catch (e) {
          console.error("Failed to fetch user", e);
        }
      },
      async fetchAdminGuilds() {
        try {
          const res = await fetch("/api/admin-guilds");
          if (res.ok) {
            this.adminGuilds = await res.json();
          }
        } catch (e) {
          console.error("Failed to fetch admin guilds", e);
        }
      },
      async fetchGuildData(guildId) {
        this.loading = true;
        try {
          // Fetch Config
          const configRes = await fetch(`/api/guilds/${guildId}/config`);
          const defaults = this.createConfigDefaults();
          if (configRes.ok) {
            this.config = {
              ...defaults,
              ...(await configRes.json()),
            };
          } else {
            // If config doesn't exist, initialize with defaults
            this.config = { ...defaults };
          }

          if (!Array.isArray(this.config.loggingIgnoreChannelIds)) {
            this.config.loggingIgnoreChannelIds = [];
          }
          if (!Array.isArray(this.config.levelRewards)) {
            this.config.levelRewards = [];
          }
          if (
            typeof this.config.ttsNameOverrides === "object" &&
            this.config.ttsNameOverrides !== null
          ) {
            this.config.ttsNameOverrides = JSON.stringify(
              this.config.ttsNameOverrides,
              null,
              2,
            );
          } else if (typeof this.config.ttsNameOverrides !== "string") {
            this.config.ttsNameOverrides = "[]";
          }
          if (
            typeof this.config.birthdayPronounRoles === "object" &&
            this.config.birthdayPronounRoles !== null
          ) {
            this.config.birthdayPronounRoles = JSON.stringify(
              this.config.birthdayPronounRoles,
              null,
              2,
            );
          } else if (typeof this.config.birthdayPronounRoles !== "string") {
            this.config.birthdayPronounRoles = "[]";
          }

          // Convert bad words array to string for textarea
          if (Array.isArray(this.config.autoModBadWords)) {
            this.config.autoModBadWords =
              this.config.autoModBadWords.join(", ");
          } else {
            this.config.autoModBadWords = "";
          }
          if (Array.isArray(this.config.autoModStrictWords)) {
            this.config.autoModStrictWords =
              this.config.autoModStrictWords.join(", ");
          } else {
            this.config.autoModStrictWords = "";
          }

          // Only reset properties, never replace object
          this.newLevelReward.level = "";
          this.newLevelReward.roleId = "";
          this.newLevelReward.colorRoleId = "";

          // Fetch Channels & Roles
          const metaRes = await fetch(`/api/guilds/${guildId}/metadata`);
          if (metaRes.ok) {
            const data = await metaRes.json();
            this.textChannels = data.textChannels;
            this.voiceChannels = data.voiceChannels;
            this.categories = data.categories;
            this.roles = data.roles;
          }
        } catch (e) {
          console.error("Failed to fetch guild data", e);
          alert("Failed to load guild configuration.");
        } finally {
          this.loading = false;
        }
      },
      addLevelReward() {
        if (!this.newLevelReward.level || !this.newLevelReward.roleId) return;
        const colorSelectValue =
          this.$refs.newLevelRewardColorRoleSelect?.value || "";
        const colorRoleId =
          String(
            this.newLevelReward.colorRoleId || colorSelectValue || "",
          ).trim() || null;
        // Prevent duplicate level only
        const exists = this.config.levelRewards.some(
          (r) => r.level === this.newLevelReward.level,
        );
        if (exists) {
          this.levelRewardError = "A reward for this level already exists.";
          return;
        }
        this.config.levelRewards.push({
          level: this.newLevelReward.level,
          roleId: this.newLevelReward.roleId,
          colorRoleId,
        });
        // Reset properties, not object reference (keep reactivity)
        this.newLevelReward.level = "";
        this.newLevelReward.roleId = "";
        this.newLevelReward.colorRoleId = "";
        this.levelRewardError = null;
      },
      async saveConfig(silent = false) {
        if (!this.selectedGuildId || !this.config) return false;

        this.saving = true;
        try {
          // Clone config to avoid modifying UI state during save
          const payload = { ...this.config };

          // Convert bad words string back to array
          if (typeof payload.autoModBadWords === "string") {
            payload.autoModBadWords = payload.autoModBadWords
              .split(",")
              .map((w) => w.trim())
              .filter((w) => w.length > 0);
          }
          if (typeof payload.autoModStrictWords === "string") {
            payload.autoModStrictWords = payload.autoModStrictWords
              .split(",")
              .map((w) => w.trim())
              .filter((w) => w.length > 0);
          }
          const parseJsonField = (fieldName) => {
            if (typeof payload[fieldName] !== "string") return;
            const value = payload[fieldName].trim();
            if (!value) {
              payload[fieldName] = [];
              return;
            }
            try {
              payload[fieldName] = JSON.parse(value);
            } catch (error) {
              throw new Error(`Invalid JSON in ${fieldName}`);
            }
          };

          parseJsonField("ttsNameOverrides");
          parseJsonField("birthdayPronounRoles");
          // Clean up levelRewards: remove invalid entries, sort by level ascending
          if (Array.isArray(payload.levelRewards)) {
            payload.levelRewards = payload.levelRewards
              .filter((r) => r.level && r.roleId)
              .map((r) => ({
                level: r.level,
                roleId: r.roleId,
                colorRoleId: String(r.colorRoleId || "").trim() || null,
              }))
              .sort((a, b) => a.level - b.level);
          }

          const res = await fetch(
            `/api/guilds/${this.selectedGuildId}/config`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );

          if (res.ok) {
            if (!silent) alert("Configuration saved successfully!");
            return true;
          } else {
            const err = await res.json();
            if (!silent)
              alert(
                "Error saving configuration: " + (err.error || "Unknown error"),
              );
            return false;
          }
        } catch (e) {
          console.error("Failed to save config", e);
          if (!silent)
            alert(e && e.message ? e.message : "Failed to save configuration.");
          return false;
        } finally {
          this.saving = false;
        }
      },
      async sendModmailPanel() {
        if (!this.selectedGuildId || !this.modmailPanelChannelId) return;

        // Auto-save config before sending panel
        const saved = await this.saveConfig(true);
        if (!saved) {
          alert(
            "Failed to save configuration before sending panel. Please try saving manually.",
          );
          return;
        }

        this.sendingPanel = true;
        try {
          const res = await fetch(
            `/api/guilds/${this.selectedGuildId}/modmail/send`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ channelId: this.modmailPanelChannelId }),
            },
          );

          if (res.ok) {
            alert("Modmail panel sent successfully!");
            this.modmailPanelChannelId = "";
          } else {
            const err = await res.json();
            alert("Error sending panel: " + (err.error || "Unknown error"));
          }
        } catch (e) {
          console.error("Failed to send panel", e);
          alert("Failed to send modmail panel.");
        } finally {
          this.sendingPanel = false;
        }
      },
    },
  }).mount("#app");
})();

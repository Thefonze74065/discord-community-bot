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
        adminGuilds: [],
        selectedGuildId: "",
        isAdmin: false,
        activeTab: "modmail",
        modmailTranscripts: [],
        vcTranscripts: [],
        searchQuery: "",
        sortOrder: "desc",
        vcSearchQuery: "",
        vcSortOrder: "desc",
      };
    },
    computed: {
      filteredModmailTranscripts() {
        let result = [...this.modmailTranscripts];

        // Filter
        if (this.searchQuery) {
          const q = this.searchQuery.toLowerCase();
          result = result.filter((t) => t.userId.includes(q));
        }

        // Sort
        result.sort((a, b) => {
          const dateA = new Date(a.createdAt);
          const dateB = new Date(b.createdAt);
          return this.sortOrder === "desc" ? dateB - dateA : dateA - dateB;
        });

        return result;
      },
      filteredVCTranscripts() {
        let result = [...this.vcTranscripts];

        // Filter
        if (this.vcSearchQuery) {
          const q = this.vcSearchQuery.toLowerCase();
          result = result.filter(
            (t) =>
              t.channelName.toLowerCase().includes(q) ||
              t.channelId.includes(q),
          );
        }

        // Sort
        result.sort((a, b) => {
          const dateA = new Date(a.deletedAt);
          const dateB = new Date(b.deletedAt);
          return this.vcSortOrder === "desc" ? dateB - dateA : dateA - dateB;
        });

        return result;
      },
    },
    async mounted() {
      await this.fetchUser();
      await this.fetchAdminGuilds();

      // Check URL params
      const urlParams = new URLSearchParams(window.location.search);
      const guildId = urlParams.get("guild_id");
      if (guildId) {
        this.selectedGuildId = guildId;
        this.fetchTranscripts();
      }

      this.loading = false;
    },
    methods: {
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
      async fetchTranscripts() {
        if (!this.selectedGuildId) return;

        this.loading = true;
        try {
          // Check if user is admin for this guild
          const adminCheckRes = await fetch(
            `/api/guilds/${this.selectedGuildId}/is-admin`,
          );
          if (adminCheckRes.ok) {
            const adminData = await adminCheckRes.json();
            this.isAdmin = adminData.isAdmin;
          } else {
            this.isAdmin = false;
          }

          // Reset to modmail tab if user is not admin and currently on VC tab
          if (!this.isAdmin && this.activeTab === "vc") {
            this.activeTab = "modmail";
          }

          // Fetch modmail transcripts
          const modmailRes = await fetch(
            `/api/guilds/${this.selectedGuildId}/modmail/transcripts`,
          );
          if (modmailRes.ok) {
            this.modmailTranscripts = await modmailRes.json();
          } else {
            this.modmailTranscripts = [];
          }

          // Fetch VC transcripts (only if admin)
          if (this.isAdmin) {
            const vcRes = await fetch(
              `/api/guilds/${this.selectedGuildId}/vc/transcripts`,
            );
            if (vcRes.ok) {
              this.vcTranscripts = await vcRes.json();
            } else {
              this.vcTranscripts = [];
            }
          } else {
            this.vcTranscripts = [];
          }
        } catch (e) {
          console.error("Failed to fetch transcripts", e);
          this.modmailTranscripts = [];
          this.vcTranscripts = [];
          this.isAdmin = false;
        } finally {
          this.loading = false;
        }
      },
    },
  }).mount("#app");
})();

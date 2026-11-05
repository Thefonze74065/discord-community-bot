const { createApp } = Vue;

createApp({
  data() {
    return {
      loading: true,
      error: null,
      stats: {
        totalActions: 0,
        byModerator: {},
        actionTypes: {},
        recentActions: [],
      },
      timeline: [],
      selectedRange: 30,
      sortBy: "total", // 'total' or 'recent'
      userCache: {}, // Cache Discord user data
      chart: null,
    };
  },
  computed: {
    mostCommonAction() {
      if (
        !this.stats.actionTypes ||
        Object.keys(this.stats.actionTypes).length === 0
      ) {
        return "N/A";
      }
      const entries = Object.entries(this.stats.actionTypes);
      entries.sort((a, b) => b[1] - a[1]);
      return entries[0][0];
    },
    avgDailyActions() {
      if (this.stats.totalActions === 0) return 0;
      return Math.round(this.stats.totalActions / this.selectedRange);
    },
    sortedModerators() {
      const mods = Object.entries(this.stats.byModerator).map(([id, data]) => ({
        id,
        ...data,
      }));

      if (this.sortBy === "total") {
        mods.sort((a, b) => b.total - a.total);
      } else {
        mods.sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));
      }

      return mods;
    },
  },
  async mounted() {
    // Check auth
    const response = await fetch("/auth/check");
    if (!response.ok) {
      window.location.href = "/login.html";
      return;
    }

    await this.fetchStats();
  },
  methods: {
    async fetchStats() {
      this.loading = true;
      this.error = null;

      try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - this.selectedRange);

        const [statsRes, timelineRes] = await Promise.all([
          fetch(
            `/api/moderator/stats?startDate=${startDate.toISOString()}&endDate=${new Date().toISOString()}`,
          ),
          fetch(`/api/moderator/timeline?days=${this.selectedRange}`),
        ]);

        if (!statsRes.ok || !timelineRes.ok) {
          throw new Error("Failed to fetch moderator stats");
        }

        this.stats = await statsRes.json();
        this.timeline = await timelineRes.json();

        // Fetch user data for all moderators
        const moderatorIds = Object.keys(this.stats.byModerator);
        await this.fetchUserData(moderatorIds);

        // Update chart
        await this.$nextTick();
        this.renderChart();
      } catch (err) {
        console.error("Error fetching stats:", err);
        this.error = err.message;
      } finally {
        this.loading = false;
      }
    },
    async fetchUserData(userIds) {
      const idsToFetch = userIds.filter((id) => !this.userCache[id]);
      if (idsToFetch.length === 0) return;

      try {
        const res = await fetch("/api/users/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: idsToFetch }),
        });

        if (res.ok) {
          const users = await res.json();
          users.forEach((user) => {
            this.userCache[user.id] = user;
          });
        }
      } catch (err) {
        console.error("Error fetching user data:", err);
      }
    },
    getUserDisplay(userId) {
      const user = this.userCache[userId];
      if (user) {
        return user.discriminator === "0"
          ? `@${user.username}`
          : `${user.username}#${user.discriminator}`;
      }
      return userId;
    },
    getUserAvatar(userId) {
      const user = this.userCache[userId];
      if (user && user.avatar) {
        return `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png?size=64`;
      }
      return `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5)}.png`;
    },
    formatDate(timestamp) {
      if (!timestamp) return "Never";
      const date = new Date(timestamp);
      return date.toLocaleString();
    },
    formatTimestamp(timestamp) {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      return `${Math.floor(diff / (1000 * 60))}m ago`;
    },
    getActionBadgeClass(action) {
      const classes = {
        ban: "bg-danger",
        kick: "bg-warning",
        warn: "bg-warning",
        timeout: "bg-warning",
        mute: "bg-warning",
        unban: "bg-success",
        unmute: "bg-success",
        untimeout: "bg-success",
        purge: "bg-info",
        note: "bg-secondary",
      };
      return classes[action] || "bg-secondary";
    },
    renderChart() {
      const ctx = document.getElementById("activityChart");
      if (!ctx) return;

      if (this.chart) {
        this.chart.destroy();
      }

      const labels = this.timeline.map((t) => {
        const date = new Date(t.date);
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      });

      const data = this.timeline.map((t) => t.total);

      this.chart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Actions per Day",
              data,
              borderColor: "rgb(75, 192, 192)",
              backgroundColor: "rgba(75, 192, 192, 0.2)",
              tension: 0.3,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: false,
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                precision: 0,
              },
            },
          },
        },
      });
    },
  },
}).mount("#app");

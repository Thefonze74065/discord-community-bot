(function () {
  const { createApp } = Vue;

  createApp({
    data() {
      return {
        guilds: [],
        selectedGuildId: "",
        days: "30",
        loading: false,
        serverActivity: [],
        topUsers: [],
        topMetric: "xpEarned",
        searchUserId: "",
        selectedUserId: "",

        // Chart instances
        activityChart: null,
        xpChart: null,
        userChart: null,
      };
    },
    async mounted() {
      await this.fetchGuilds();
    },
    methods: {
      async fetchGuilds() {
        try {
          const res = await fetch("/api/admin-guilds");
          if (res.ok) {
            this.guilds = await res.json();
            if (this.guilds.length > 0) {
              this.selectedGuildId = this.guilds[0].id;
              this.loadData();
            }
          } else if (res.status === 401) {
            window.location.href = "/login.html";
          }
        } catch (error) {
          console.error("Failed to fetch guilds:", error);
        }
      },
      async loadData() {
        if (!this.selectedGuildId) return;
        this.loading = true;
        await Promise.all([this.fetchServerActivity(), this.loadTopUsers()]);
        this.loading = false;
        this.$nextTick(() => {
          this.renderServerCharts();
        });
      },
      async fetchServerActivity() {
        try {
          const res = await fetch(
            `/api/activity/server?guildId=${this.selectedGuildId}&days=${this.days}`,
          );
          if (res.ok) {
            this.serverActivity = await res.json();
          }
        } catch (error) {
          console.error("Failed to fetch server activity:", error);
        }
      },
      async loadTopUsers() {
        try {
          const res = await fetch(
            `/api/activity/top?guildId=${this.selectedGuildId}&days=${this.days}&metric=${this.topMetric}`,
          );
          if (res.ok) {
            this.topUsers = await res.json();
          }
        } catch (error) {
          console.error("Failed to fetch top users:", error);
        }
      },
      renderServerCharts() {
        const ctxActivity = document.getElementById("activityChart");
        const ctxXp = document.getElementById("xpChart");

        if (!ctxActivity || !ctxXp) return;

        const labels = this.serverActivity.map((d) => d.date);
        const messages = this.serverActivity.map((d) => d.messages);
        const voiceTime = this.serverActivity.map((d) => d.voiceTime);
        const xp = this.serverActivity.map((d) => d.xpEarned);

        // Destroy existing charts
        if (this.activityChart) this.activityChart.destroy();
        if (this.xpChart) this.xpChart.destroy();

        // Activity Chart (Messages & Voice)
        this.activityChart = new Chart(ctxActivity, {
          type: "line",
          data: {
            labels: labels,
            datasets: [
              {
                label: "Messages",
                data: messages,
                borderColor: "#5865F2",
                backgroundColor: "rgba(88, 101, 242, 0.1)",
                tension: 0.3,
                fill: true,
              },
              {
                label: "Voice (mins)",
                data: voiceTime,
                borderColor: "#2ecc71",
                backgroundColor: "rgba(46, 204, 113, 0.1)",
                tension: 0.3,
                fill: true,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: { labels: { color: "#fff" } },
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: "#444" },
                ticks: { color: "#ccc" },
              },
              x: {
                grid: { color: "#444" },
                ticks: { color: "#ccc" },
              },
            },
          },
        });

        // XP Chart
        this.xpChart = new Chart(ctxXp, {
          type: "bar",
          data: {
            labels: labels,
            datasets: [
              {
                label: "XP Earned",
                data: xp,
                backgroundColor: "#f1c40f",
              },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: { labels: { color: "#fff" } },
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: "#444" },
                ticks: { color: "#ccc" },
              },
              x: {
                grid: { color: "#444" },
                ticks: { color: "#ccc" },
              },
            },
          },
        });
      },
      async viewUser(userId) {
        if (!userId) return;
        this.selectedUserId = userId;

        try {
          const res = await fetch(
            `/api/activity/user/${userId}?guildId=${this.selectedGuildId}&days=${this.days}`,
          );
          if (res.ok) {
            const data = await res.json();
            this.renderUserChart(data);

            // Show Modal
            const modal = new bootstrap.Modal(
              document.getElementById("userModal"),
            );
            modal.show();
          } else {
            alert("User not found or no data available.");
          }
        } catch (error) {
          console.error("Failed to fetch user data:", error);
          alert("Error fetching user data.");
        }
      },
      renderUserChart(data) {
        const ctx = document.getElementById("userChart");
        if (!ctx) return;

        if (this.userChart) this.userChart.destroy();

        const labels = data.map((d) => d.date);
        const messages = data.map((d) => d.messages);
        const voice = data.map((d) => d.voiceTime);

        this.userChart = new Chart(ctx, {
          type: "line",
          data: {
            labels: labels,
            datasets: [
              {
                label: "Messages",
                data: messages,
                borderColor: "#5865F2",
                tension: 0.3,
              },
              {
                label: "Voice (mins)",
                data: voice,
                borderColor: "#2ecc71",
                tension: 0.3,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: { labels: { color: "#fff" } },
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: "#444" },
                ticks: { color: "#ccc" },
              },
              x: {
                grid: { color: "#444" },
                ticks: { color: "#ccc" },
              },
            },
          },
        });
      },
      formatValue(val, metric) {
        if (metric === "voiceTime") {
          const hours = Math.floor(val / 60);
          const mins = val % 60;
          return `${hours}h ${mins}m`;
        }
        return val.toLocaleString();
      },
    },
  }).mount("#app");
})();

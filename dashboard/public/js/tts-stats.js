(function () {
  const { createApp } = Vue;

  createApp({
    data() {
      return {
        guilds: [],
        selectedGuildId: "",
        days: "30",
        loading: false,
        overallStats: {
          totalMessages: 0,
          totalChars: 0,
          avgChars: 0,
          totalAudio: 0,
          avgAudio: 0,
        },
        userStats: [],
        chartInstance: null,
      };
    },
    async mounted() {
      // Global fetch interceptor for 401s
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        if (response.status === 401) {
          window.location.href = "/login.html";
        }
        return response;
      };

      await this.fetchGuilds();
      // If a guild is already selected, load data immediately
      if (this.selectedGuildId) {
        this.loadData();
      }
    },
    methods: {
      async fetchGuilds() {
        try {
          const res = await fetch("/api/admin-guilds");
          if (res.ok) {
            this.guilds = await res.json();
            if (this.guilds.length > 0) {
              this.selectedGuildId = this.guilds[0].id;
            }
          }
        } catch (error) {
          console.error("Failed to fetch guilds:", error);
        }
      },
      async loadData() {
        if (!this.selectedGuildId) return;
        this.loading = true;

        try {
          const res = await fetch(
            `/api/tts/stats?guild_id=${this.selectedGuildId}&days=${this.days}`
          );
          if (res.ok) {
            const data = await res.json();

            // Calculate Overall Stats from the usage data
            const usage = data.dailyUsage || [];
            const totalMessages = usage.reduce(
              (acc, cur) => acc + cur.count,
              0
            );
            const totalChars = usage.reduce((acc, cur) => acc + cur.chars, 0);
            const totalAudio = usage.reduce(
              (acc, cur) => acc + (cur.audioSeconds || 0),
              0
            );
            const avgChars =
              totalMessages > 0 ? Math.round(totalChars / totalMessages) : 0;
            const avgAudio = totalMessages > 0 ? totalAudio / totalMessages : 0;

            this.overallStats = {
              totalMessages,
              totalChars,
              avgChars,
              totalAudio,
              avgAudio,
            };

            // Defensive: fallback to empty array if not present
            this.userStats = Array.isArray(data.userStats)
              ? data.userStats
              : [];

            // Wait for DOM update before rendering chart
            this.$nextTick(() => {
              this.renderChart(usage, data.resolution);
            });
          } else {
            console.error("Failed to fetch stats");
          }
        } catch (error) {
          console.error("Error loading data:", error);
        } finally {
          this.loading = false;
        }
      },
      renderChart(usageData, resolution) {
        // Wait for DOM update if canvas is missing
        let ctx = document.getElementById("ttsChart");
        if (!ctx) {
          // Try again after nextTick (Vue may not have rendered it yet)
          this.$nextTick(() => {
            ctx = document.getElementById("ttsChart");
            if (!ctx) {
              console.error(
                "TTS Chart canvas still not found in DOM after nextTick"
              );
              return;
            }
            this.renderChart(usageData, resolution); // Try again
          });
          return;
        }
        ctx.height = 400;

        if (this.chartInstance) {
          this.chartInstance.destroy();
        }

        // Always show at least a zero baseline, even if all data is zero or missing
        let safeUsage =
          Array.isArray(usageData) && usageData.length > 0 ? usageData : [];
        if (
          safeUsage.length === 0 ||
          safeUsage.every((d) => d.count === 0 && d.chars === 0)
        ) {
          if (resolution === "hour") {
            safeUsage = Array.from({ length: 25 }, (_, i) => ({
              label: `${i}:00`,
              count: 0,
              chars: 0,
            }));
          } else {
            const days = this.days ? parseInt(this.days) : 7;
            const today = new Date();
            safeUsage = Array.from({ length: days + 1 }, (_, i) => {
              const d = new Date(today);
              d.setUTCDate(today.getUTCDate() - days + i);
              const label = d.toISOString().split("T")[0];
              return { label, count: 0, chars: 0 };
            });
          }
        }

        const labels = safeUsage.map((d) => d.label);
        const messageData = safeUsage.map((d) => d.count);
        const charData = safeUsage.map((d) => d.chars);
        const audioData = safeUsage.map((d) => d.audioSeconds || 0);

        // Debug log
        console.log("Rendering chart", {
          labels,
          messageData,
          charData,
          resolution,
        });

        this.chartInstance = new Chart(ctx, {
          type: "line",
          data: {
            labels: labels,
            datasets: [
              {
                label: "Messages",
                data: messageData,
                borderColor: "#0d6efd",
                backgroundColor: "rgba(13, 110, 253, 0.1)",
                yAxisID: "y",
                tension: 0.3,
                fill: true,
              },
              {
                label: "Characters",
                data: charData,
                borderColor: "#198754",
                backgroundColor: "rgba(25, 135, 84, 0.1)",
                yAxisID: "y1",
                tension: 0.3,
                fill: true,
              },
              {
                label: "Audio Seconds",
                data: audioData,
                borderColor: "#ffc107",
                backgroundColor: "rgba(255, 193, 7, 0.1)",
                yAxisID: "y2",
                tension: 0.3,
                fill: true,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              mode: "index",
              intersect: false,
            },
            plugins: {
              legend: {
                labels: { color: "#adb5bd" },
              },
              tooltip: {
                callbacks: {
                  title: (context) => {
                    const label = context[0].label;
                    return resolution === "hour"
                      ? `Time: ${label}`
                      : `Date: ${label}`;
                  },
                },
              },
            },
            scales: {
              x: {
                ticks: { color: "#adb5bd" },
                grid: { color: "#495057" },
                title: {
                  display: true,
                  text: resolution === "hour" ? "Time (Hour)" : "Date",
                  color: "#adb5bd",
                },
              },
              y: {
                type: "linear",
                display: true,
                position: "left",
                ticks: { color: "#adb5bd" },
                grid: { color: "#495057" },
                title: { display: true, text: "Messages", color: "#0d6efd" },
                suggestedMin: 0,
              },
              y1: {
                type: "linear",
                display: true,
                position: "right",
                ticks: { color: "#adb5bd" },
                grid: { drawOnChartArea: false },
                title: { display: true, text: "Characters", color: "#198754" },
                suggestedMin: 0,
              },
              y2: {
                type: "linear",
                display: true,
                position: "right",
                offset: true,
                ticks: { color: "#ffc107" },
                grid: { drawOnChartArea: false },
                title: {
                  display: true,
                  text: "Audio Seconds",
                  color: "#ffc107",
                },
                suggestedMin: 0,
              },
            },
          },
        });
      },
      formatNumber(num) {
        return new Intl.NumberFormat().format(num);
      },
    },
  }).mount("#app");
})();

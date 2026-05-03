module.exports = {
  apps: [
    {
      name: "nis2-platform",
      script: "./dist/backend/_core/index.js",

      // Cluster mode: 2 workers on a Hetzner CX22 (2 vCPU).
      // Increase to "max" on larger instances.
      instances: 2,
      exec_mode: "cluster",

      autorestart: true,
      watch: false,
      max_memory_restart: "512M",

      // Graceful shutdown — wait for in-flight requests
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true,

      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      // Log rotation handled by pm2-logrotate module
      error_file: "/var/log/nis2/err.log",
      out_file: "/var/log/nis2/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,

      // Exponential back-off restart: prevents crash loops from hammering DB
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};

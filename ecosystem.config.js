module.exports = {
  apps: [
    {
      name: 'vip-crm-api',
      script: './backend/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      max_memory_restart: '500M',
      exp_backoff_restart_delay: 100,
      watch: false,
    },
  ],
};

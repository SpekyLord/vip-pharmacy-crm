module.exports = {
  apps: [
    {
      name: 'vip-crm-api',
      script: './backend/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        ENABLE_SCHEDULER: 'false',
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      max_memory_restart: '500M',
      exp_backoff_restart_delay: 100,
      watch: false,
    },
    {
      name: 'vip-crm-worker',
      script: './backend/worker.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        ENABLE_SCHEDULER: 'true',
      },
      error_file: './logs/worker-err.log',
      out_file: './logs/worker-out.log',
      log_file: './logs/worker-combined.log',
      time: true,
      max_memory_restart: '300M',
      exp_backoff_restart_delay: 100,
      watch: false,
    },
  ],
};

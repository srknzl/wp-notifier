// PM2 Process Manager Configuration
module.exports = {
  apps: [
    {
      name: 'wp-notifier',
      script: 'src/index.js',
      autorestart: true,
      restart_delay: 10000,
      exp_backoff_restart_delay: 5000,
      max_memory_restart: '700M', // Automatically restart on Chromium memory leak
      time: true,
    },
  ],
};

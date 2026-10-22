// PM2 Süreç Yöneticisi Yapılandırması
module.exports = {
  apps: [
    {
      name: 'wp-notifier',
      script: 'src/index.js',
      autorestart: true,
      restart_delay: 10000,
      exp_backoff_restart_delay: 5000,
      max_memory_restart: '700M', // Chromium bellek sızıntısına karşı otomatik yeniden başlatma sınırı
      time: true,
    },
  ],
};

module.exports = {
  apps: [
    {
      name: 'bagas-share',
      cwd: __dirname,
      script: 'apps/server/dist/index.js',
      node_args: '--max-old-space-size=192',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        HOST: '127.0.0.1',
        TRUST_PROXY: '1',
        TZ: 'Asia/Makassar',
        DB_PATH: '/var/www/bagas-share/data/state.sqlite',
      },
    },
  ],
};

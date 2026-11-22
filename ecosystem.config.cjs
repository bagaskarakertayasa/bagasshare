module.exports = {
  apps: [
    {
      name: 'bagas-share',
      cwd: __dirname,
      script: 'apps/server/dist/start.js',
      node_args: '--max-old-space-size=192',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        HOST: '127.0.0.1',
        TRUST_PROXY: '1',
        TZ: 'Asia/Makassar',
        DB_PATH: '/var/www/bagas-share/data/state.sqlite',
        R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || '',
        R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
        R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',
        R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || 'bagas-share',
      },
    },
  ],
};

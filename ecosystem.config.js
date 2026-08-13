module.exports = {
  apps: [
    {
      name: 'ubisafe-tcp',
      script: 'src/tcp-server.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'ubisafe-api',
      script: 'src/api-server.js',
      env: { NODE_ENV: 'production' },
    },
  ],
};

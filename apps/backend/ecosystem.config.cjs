module.exports = {
  apps: [
    {
      name: process.env.PM2_APP_NAME || "trail-production-api",
      script: "dist/server.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 5018,
      },
    },
  ],
};

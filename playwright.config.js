// @ts-check
require("dotenv").config({ path: ".env.local" });
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.API_URL || "http://localhost:5001/api",
    extraHTTPHeaders: {
      "Content-Type": "application/json",
    },
  },
});

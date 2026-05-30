import { saveApiKey, readConfig, defaultConfigPath, redactKey } from "../../lib/reasonix-core/config.js";

const key = process.argv[2];

if (!key) {
  const cfg = readConfig();
  if (cfg.apiKey) {
    console.log(`Current key: ${redactKey(cfg.apiKey)}`);
    console.log(`Config file: ${defaultConfigPath()}`);
  } else {
    console.log("No API key configured.");
    console.log("Usage: npx tsx src/server/setup-key.ts <your-deepseek-api-key>");
  }
  process.exit(0);
}

saveApiKey(key);
console.log(`API key saved to ${defaultConfigPath()}`);
console.log(`Key: ${redactKey(key)}`);

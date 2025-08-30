// In production (e.g., Vercel), prefer the precompiled JS to avoid ts-node
if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
  try {
    require('./dist/tee-bot.js');
  } catch (err) {
    console.error('Failed to load compiled script. Did build:scripts run?', err);
    process.exit(1);
  }
} else {
  // Local/dev: run the TypeScript directly via ts-node (faster iteration)
  require('ts-node/register/transpile-only');
  require('./tee-bot.ts');
}

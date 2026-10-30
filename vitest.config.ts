import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          // Test fixture only — production uses `wrangler secret put TRACKING_KEY`.
          bindings: {
            TRACKING_KEY: 'test_tracking_key_fixture',
          },
        },
      },
    },
  },
});

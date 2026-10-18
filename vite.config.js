import { defineConfig } from 'vite';
import fs from 'node:fs';

// relative base so the build works at any path (e.g. username.github.io/darkride/)
export default defineConfig({
  base: './',
  server: { port: 5174 },
  plugins: [
    {
      // dev only: the trailer recorder (?test&reel) posts its .webm here
      name: 'reel-sink',
      configureServer(server) {
        server.middlewares.use('/__reel', (req, res) => {
          if (req.method !== 'POST') return res.end();
          const name = String(new URL(req.url, 'http://x').searchParams.get('name') || 'reel').replace(/[^\w-]/g, '');
          fs.mkdirSync('../promo', { recursive: true });
          const out = fs.createWriteStream(`../promo/reel-${name}.webm`);
          req.pipe(out);
          out.on('finish', () => res.end('ok'));
        });
      },
    },
  ],
});

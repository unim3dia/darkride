import { defineConfig } from 'vite';

// relative base so the build works at any path (e.g. username.github.io/darkride/)
export default defineConfig({
  base: './',
  server: { port: 5174 },
});

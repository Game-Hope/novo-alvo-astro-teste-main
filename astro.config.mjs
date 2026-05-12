import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap, { ChangeFreqEnum } from '@astrojs/sitemap';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://portalnovoalvo.com.br',
  output: 'static',

  integrations: [
    react(),
    sitemap({
      filter(page) {
        return !page.includes('/admin/') && !page.includes('/redacao/');
      },
      serialize(item) {
        if (item.url.endsWith('/')) {
          item.changefreq = ChangeFreqEnum.DAILY;
          item.priority = item.url === 'https://portalnovoalvo.com.br/' ? 1 : 0.8;
        }
        if (item.url.includes('/noticia/')) {
          item.changefreq = ChangeFreqEnum.WEEKLY;
          item.priority = 0.9;
        }
        return item;
      },
    }),
  ],

  vite: {
    resolve: {
      tsconfigPaths: false,
    },
    plugins: [tailwindcss()],
  },

  adapter: cloudflare(),
});
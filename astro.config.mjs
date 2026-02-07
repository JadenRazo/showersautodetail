// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://showersautodetail.com',
  trailingSlash: 'never',
  vite: {
    plugins: [tailwindcss()]
  },
  integrations: [
    react(),
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
      filter: (page) => !page.includes('/pay') && !page.includes('/test-payment') && !page.includes('/manage'),
      serialize(item) {
        if (item.url === 'https://showersautodetail.com/') {
          item.priority = 1.0;
          item.changefreq = 'daily';
        }
        if (item.url.includes('/services')) {
          item.priority = 0.9;
          item.changefreq = 'weekly';
        }
        return item;
      }
    })
  ]
});

// scripts/ingest-news.mjs
import { fetchArticleImages } from './fetch-article-images.mjs';
import { fetchImageWithCrawl4AI } from './fetch-image-crawl4ai.mjs';
import { uploadImageToR2 } from './upload-image-to-r2.mjs';
import { isR2Configured } from './r2-config.mjs';

/**
 * Função para salvar no D1 via API (Para GitHub Actions)
 * ou via Binding (Para Cloudflare Pages)
 */
async function saveToD1(article) {
  const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, EDITORIAL_DB_ID } = process.env;

  // 1. Tentativa via Binding (Se estiver rodando dentro do Cloudflare Pages)
  if (globalThis.D1 || (process.env.EDITORIAL_DB && !CLOUDFLARE_API_TOKEN)) {
    try {
      const db = process.env.EDITORIAL_DB; 
      await db.prepare('INSERT INTO articles (id, title, slug, description, body_html*

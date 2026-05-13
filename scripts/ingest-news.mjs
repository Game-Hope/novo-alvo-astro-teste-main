// scripts/ingest-news.mjs
import { fetchArticleImages } from './fetch-article-images.mjs';
import { fetchImageWithCrawl4AI } from './fetch-image-crawl4ai.mjs';
import { uploadImageToR2 } from './upload-image-to-r2.mjs';
import { isR2Configured } from './r2-config.mjs';

async function checkSecrets() {
  const required = {
    'CLOUDFLARE_API_TOKEN': process.env.CLOUDFLARE_API_TOKEN,
    'CLOUDFLARE_ACCOUNT_ID': process.env.CLOUDFLARE_ACCOUNT_ID,
    'EDITORIAL_DB_ID': process.env.EDITORIAL_DB_ID,
    'GROQ_API_KEY': process.env.GROQ_API_KEY,
    'R2_ACCOUNT_ID': process.env.R2_ACCOUNT_ID,
    'R2_ACCESS_KEY': process.env.R2_ACCESS_KEY,
    'R2_SECRET_KEY': process.env.R2_SECRET_KEY,
    'R2_BUCKET_NAME': process.env.R2_BUCKET_NAME,
    'R2_PUBLIC_URL': process.env.R2_PUBLIC_URL
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error(`\n❌ ERRO DE CONFIGURAÇÃO: As seguintes chaves estão faltando nos_

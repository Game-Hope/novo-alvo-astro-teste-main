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

  const missing = Object.entries(required).filter(([_, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    console.error(`\n❌ ERRO: Faltam as seguintes chaves nos Secrets do GitHub:\n👉 ${missing.join('\n👉 ')}`);
    process.exit(1);
  }
}

async function saveToD1(article) {
  const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, EDITORIAL_DB_ID } = process.env;

  try {
    const clean = (str) => (str || "").toString().replace(/'/g, "''");

    const query = `INSERT INTO articles (id, title, slug, description, body_html, cover_url, category, created_at) VALUES (
      '${clean(article.id)}', 
      '${clean(article.title)}', 
      '${clean(article.slug)}', 
      '${clean(article.description)}', 
      '${clean(article.body_html)}', 
      '${clean(article.cover_url)}', 
      '${clean(article.category)}', 
      '${new Date().toISOString()}')`;

    console.log(`[D1-API] Enviando dados para o banco Cloudflare...`);
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/endpoint/${EDITORIAL_DB_ID}/sql`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      }
    );

    const data = await res.json();

    if (res.ok) {
      console.log(`[D1] ✅ SUCESSO TOTAL: Artigo salvo via API: ${article.title}`);
      return true;
    } else {
      console.error(`[D1-API ERROR] O Cloudflare recusou o salvamento:`, JSON.stringify(data));
      if (res.status === 403 || res.status === 401) {
        console.error("👉 DICA: Seu CLOUDFLARE_API_TOKEN está incorreto ou não tem permissão de 'Edit' para o D1.");
      }
      return false;
    }
  } catch (e) {
    console.error(`[D1-EXCEPTION] Erro crítico: ${e.message}`);
    return false;
  }
}

export const enrichPitchImages = async (pitch) => {
  let candidateUrl = null;
  
  // GARANTE QUE SOURCES SEJA SEMPRE UM ARRAY DE STRINGS
  const sourcesList = (pitch.sources || []).map(s => typeof s === 'object' ? s.url : s).filter(Boolean);

  try {
    const images = await fetchArticleImages(sourcesList);
    candidateUrl = images[0]?.url ?? null;
  } catch (err) { console.warn('[IMAGE] Falha Camada 1:', err.message); }

  if (!candidateUrl && sourcesList.length > 0) {
    try {
      candidateUrl = await fetchImageWithCrawl4AI(sourcesList[0]);
    } catch (err) { console.warn('[IMAGE] Falha Camada 2:', err.message); }
  }

  let cover_url = null;
  if (candidateUrl && isR2Configured()) {
    try {
      cover_url = await uploadImageToR2(candidateUrl, pitch.clusterKey ?? pitch.id);
    } catch (err) {
      console.error(`[IMAGE] Falha Camada 3: ${err.message}`);
      cover_url = candidateUrl;
    }
  } else if (candidateUrl) {
    cover_url = candidateUrl;
  }

  return { ...pitch, cover_url };
};

// --- EXECUÇÃO DE TESTE ---
async function runIngest() {
  console.log("🚀 Iniciando Ingestão de Teste NEXA...");
  
  // VERIFICAÇÃO DE SEGREDOS
  const required = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'EDITORIAL_DB_ID', 'GROQ_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ ERRO: Faltam as seguintes chaves nos Secrets do GitHub:\n👉 ${missing.join('\n👉 ')}`);
    process.exit(1);
  }

  const mockArticle = {
    id: `test-${Date.now()}`,
    title: "Teste de Soberania Digital NEXA",
    slug: "teste-soberania-digital-nexa",
    description: "Validando o pipeline de imagens e banco de dados D1 via API",
    body_html: "<p>Este é um artigo de teste para validar o sistema de salvamento remoto.</p>",
    category: "Tecnologia",
    sources: ["https://www.google.com"], // ← CORRIGIDO: ARRAY DE STRINGS (NÃO OBJETO)
    clusterKey: "teste-nexa"
  };

  console.log("[INGEST] Processando artigo de teste...");
  const enriched = await enrichPitchImages(mockArticle);
  
  const success = await saveToD1({
    ...enriched,
    cover_url: enriched.cover_url
  });

  if (success) {
    console.log("🎉 SUCESSO TOTAL: Artigo e Imagem salvos no D1/R2!");
  } else {
    console.error("❌ FALHA FINAL: O artigo NÃO foi salvo no banco de dados.");
  }
}

runIngest().catch(err => console.error("ERRO FATAL NO SCRIPT:", err));

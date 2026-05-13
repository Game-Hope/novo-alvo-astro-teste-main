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
    console.error(`\n❌ ERRO DE CONFIGURAÇÃO: As seguintes chaves estão faltando nos Secrets do GitHub:`);
    console.error(`👉 ${missing.join('\n👉 ')}`);
    console.error(`\nPor favor, adicione-as em Settings -> Secrets and variables -> Actions\n`);
    process.exit(1);
  }
}

async function saveToD1(article) {
  const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, EDITORIAL_DB_ID } = process.env;

  try {
    const query = `INSERT INTO articles (id, title, slug, description, body_html, cover_url, category, created_at) VALUES (
      '${article.id}', 
      '${article.title.replace(/'/g, "''")}', 
      '${article.slug}', 
      '${article.description.replace(/'/g, "''")}', 
      '${article.body_html.replace(/'/g, "''")}', 
      '${article.cover_url}', 
      '${article.category}', 
      '${new Date().toISOString()}')`;

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

    if (res.ok) {
      console.log(`[D1] ✅ Artigo salvo com sucesso: ${article.title}`);
      return true;
    } else {
      const errData = await res.text();
      console.error(`[D1-API ERROR] Falha ao salvar no banco: ${errData}`);
    }
  } catch (e) {
    console.error(`[D1-EXCEPTION] ${e.message}`);
  }
  return false;
}

export const enrichPitchImages = async (pitch) => {
  let candidateUrl = null;
  try {
    const images = await fetchArticleImages(pitch.sources ?? []);
    candidateUrl = images[0]?.url ?? null;
  } catch (err) { console.warn('[IMAGE] Falha Camada 1:', err.message); }

  if (!candidateUrl && pitch.sources?.length > 0) {
    try {
      candidateUrl = await fetchImageWithCrawl4AI(pitch.sources[0].url);
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

async function runIngest() {
  console.log("🚀 Iniciando Ingestão de Teste NEXA...");
  
  await checkSecrets(); // Verifica se as chaves existem antes de começar

  const mockArticle = {
    id: `test-${Date.now()}`,
    title: "Teste de Soberania Digital NEXA",
    slug: "teste-soberania-digital-nexa",
    description: "Validando o pipeline de imagens e banco de dados D1",
    body_html: "<p>Este é um artigo de teste para validar o sistema.</p>",
    category: "Tecnologia",
    sources: ["https://www.google.com"],
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

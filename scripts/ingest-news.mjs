// scripts/ingest-news.mjs
import { fetchArticleImages } from './fetch-article-images.mjs';
import { fetchImageWithCrawl4AI } from './fetch-image-crawl4ai.mjs';
import { uploadImageToR2 } from './upload-image-to-r2.mjs';
import { isR2Configured } from './r2-config.mjs';

/**
 * Função para salvar no D1 via API (Necessário para GitHub Actions)
 * ou via Binding (Para Cloudflare Pages)
 */
async function saveToD1(article) {
  const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, EDITORIAL_DB_ID } = process.env;

  // 1. Tentativa via Binding (Se estiver rodando dentro do Cloudflare Pages)
  if (globalThis.D1 || (process.env.EDITORIAL_DB && !CLOUDFLARE_API_TOKEN)) {
    try {
      const db = process.env.EDITORIAL_DB; 
      await db.prepare('INSERT INTO articles (id, title, slug, description, body_html, cover_url, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(article.id, article.title, article.slug, article.description, article.body_html, article.cover_url, article.category, new Date().toISOString())
        .run();
      console.log(`[D1] ✅ Artigo salvo via Binding: ${article.title}`);
      return true;
    } catch (e) {
      console.error(`[D1-BINDING ERROR] ${e.message}`);
    }
  }

  // 2. Tentativa via API (Para GitHub Actions)
  if (CLOUDFLARE_API_TOKEN && CLOUDFLARE_ACCOUNT_ID && EDITORIAL_DB_ID) {
    try {
      // Sanitização rigorosa para evitar erros de SQL (troca ' por '')
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

      const responseData = await res.json();

      if (res.ok) {
        console.log(`[D1] ✅ SUCESSO TOTAL: Artigo salvo via API: ${article.title}`);
        return true;
      } else {
        console.error(`[D1-API ERROR] O Cloudflare recusou o salvamento:`, JSON.stringify(responseData));
      }
    } catch (e) {
      console.error(`[D1-EXCEPTION] Erro crítico na requisição: ${e.message}`);
    }
  } else {
    console.error("[D1] ❌ ERRO: Faltam credenciais de API (CLOUDFLARE_API_TOKEN, ACCOUNT_ID ou DB_ID).");
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
      // Garante que estamos pegando a URL da fonte corretamente
      const firstSourceUrl = typeof pitch.sources[0] === 'object' ? pitch.sources[0].url : pitch.sources[0];
      candidateUrl = await fetchImageWithCrawl4AI(firstSourceUrl);
    } catch (err) { console.warn('[IMAGE] Falha Camada 2:', err.message); }
  }

  let cover_url = null;
  if (candidateUrl && isR2Configured()) {
    try {
      cover_url = await uploadImageToR2(candidateUrl, pitch.clusterKey ?? pitch.id);
    } catch (err) {
      console.error(`[IMAGE] Falha Camada 3 (R2): ${err.message}`);
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
  
  // Verificação de Segredos
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
    sources: [{ url: "https://www.google.com" }], 
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

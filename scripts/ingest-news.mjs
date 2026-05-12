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
      // IMPORTANTE: Usando aspas simples (') para valores de texto, exigido pelo SQLite/D1
      const query = `INSERT INTO articles (id, title, slug, description, body_html, cover_url, category, created_at) VALUES (
        '${article.id}', 
        '${article.title.replace(/'/g, "''")}', 
        '${article.slug}', 
        '${article.description.replace(/'/g, "''")}', 
        '${article.body_html.replace(/'/g, "''")}', 
        '${article.cover_url}', 
        '${article.category}', 
        '${new Date().toISOString()}')`;

      console.log(`[D1-API] Enviando query para a API do Cloudflare...`);
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
        console.log(`[D1-API] ✅ SUCESSO: Artigo salvo via API: ${article.title}`);
        return true;
      } else {
        console.error(`[D1-API ERROR] A API do Cloudflare retornou erro:`, JSON.stringify(responseData));
      }
    } catch (e) {
      console.error(`[D1-API EXCEPTION] Erro crítico na requisição: ${e.message}`);
    }
  } else {
    console.error("[D1] ❌ ERRO CRÍTICO: Faltam credenciais de API (CLOUDFLARE_API_TOKEN, ACCOUNT_ID ou DB_ID).");
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

// --- EXECUÇÃO DE TESTE (SÓ RODA NO GITHUB ACTIONS) ---
async function runIngest() {
  console.log("🚀 Iniciando Ingestão de Teste NEXA...");
  
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

  console.log("[INGEST] Gerando imagem de capa...");
  const enriched = await enrichPitchImages(mockArticle);
  
  console.log("[INGEST] Tentando salvar no banco D1...");
  const success = await saveToD1({
    ...enriched,
    cover_url: enriched.cover_url
  });

  if (success) {
    console.log("🎉 PARABÉNS! O artigo e a imagem foram salvos com sucesso no D1!");
  } else {
    console.error("❌ FALHA FINAL: O artigo NÃO foi salvo no banco de dados.");
  }
}

runIngest().catch(err => console.error("ERRO FATAL NO SCRIPT:", err));

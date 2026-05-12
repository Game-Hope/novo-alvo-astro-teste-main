// scripts/ingest-news.mjs
import { fetchArticleImages } from './fetch-article-images.mjs';
import { fetchImageWithCrawl4AI } from './fetch-image-crawl4ai.mjs';
import { uploadImageToR2 } from './upload-image-to-r2.mjs';
import { isR2Configured } from './r2-config.mjs';

/**
 * Enriquece uma pauta com imagens, seguindo a estratégia de 3 camadas:
 * 1. Fetch (método existente)
 * 2. Crawl4AI + Groq (fallback)
 * 3. Upload para R2 (salva no bucket próprio)
 */
export const enrichPitchImages = async (pitch) => {
  // --- CAMADA 1: Fetch existente (já funciona para 70-80% das fontes) ---
  let candidateUrl = null;
  try {
    const images = await fetchArticleImages(pitch.sources ?? []);
    candidateUrl = images[0]?.url ?? null;
    if (candidateUrl) {
      console.log(`[IMAGE] Camada 1 (Fetch) encontrou: ${candidateUrl}`);
    }
  } catch (err) {
    console.warn('[IMAGE] Falha na Camada 1 (Fetch):', err.message);
  }

  // --- CAMADA 2: Crawl4AI + Groq (fallback quando Fetch falha) ---
  if (!candidateUrl && pitch.sources?.length > 0) {
    try {
      console.log('[IMAGE] Iniciando Camada 2 (Crawl4AI/Groq) para:', pitch.sources[0].url);
      candidateUrl = await fetchImageWithCrawl4AI(pitch.sources[0].url);
      if (candidateUrl) {
        console.log(`[IMAGE] Camada 2 (Crawl4AI/Groq) encontrou: ${candidateUrl}`);
      }
    } catch (err) {
      console.warn('[IMAGE] Falha na Camada 2 (Crawl4AI/Groq):', err.message);
    }
  }

  // --- CAMADA 3: Upload para R2 (se houver URL válida e R2 configurado) ---
  let cover_url = null;
  if (candidateUrl && isR2Configured()) {
    try {
      console.log('[IMAGE] Iniciando Camada 3 (Upload R2) para:', candidateUrl);
      cover_url = await uploadImageToR2(candidateUrl, pitch.clusterKey ?? pitch.id);
      if (cover_url) {
        console.log(`[IMAGE] Camada 3 (R2) concluída. URL final: ${cover_url}`);
      }
    } catch (err) {
      console.error('[IMAGE] Falha na Camada 3 (Upload R2):', err.message);
      // Mantemos candidateUrl como fallback caso o R2 falhe
      cover_url = candidateUrl;
    }
  } else if (candidateUrl) {
    // R2 não configurado — mantemos a URL original (mas avisamos)
    console.warn('[IMAGE] R2 não configurado. Mantendo URL original (risco de 404):', candidateUrl);
    cover_url = candidateUrl;
  }

  // --- Resultado final ---
  return {
    ...pitch,
    cover_url, // URL final que será salva no banco (R2 ou original)
    imageCandidates: [
      ...(candidateUrl ? [{ url: candidateUrl, source: 'fetch' }] : []),
      ...(cover_url && cover_url !== candidateUrl ? [{ url: cover_url, source: 'r2' }] : [])
    ].filter(Boolean) // Remove null/undefined
  };
};

// scripts/fetch-image-crawl4ai.mjs
import Crawl4AI from '@crawl4ai/client';

const GROQ_KEY = process.env.GROQ_API_KEY ?? '';

/**
 * Camada 2: Extrai a imagem principal usando Crawl4AI (Chrome headless) + Groq (LLM).
 * Só é chamada quando a Camada 1 (Fetch) falha.
 */
export const fetchImageWithCrawl4AI = async (articleUrl) => {
  if (!GROQ_KEY) {
    console.warn('[CRAWL4AI] GROQ_API_KEY não configurada. Pulando Camada 2.');
    return null;
  }

  try {
    console.log(`[CRAWL4AI] Iniciando análise para: ${articleUrl}`);

    const crawler = new Crawl4AI({
      llm: {
        provider: 'groq/deepseek-r1-distill-llama-70b',
        api_key: GROQ_KEY,
      },
      // Foco em containers de conteúdo para reduzir tokens e evitar lixo (ads/menus)
      css_selector: 'article, main, .article-body, .content, #content, .post',
      headless: true,
      // Timeout adequado para sites pesados
      page_renderer: {
        wait_until: 'networkidle',
        timeout: 30000
      }
    });

    const result = await crawler.arun({
      url: articleUrl,
      extraction_strategy: {
        type: 'llm',
        instruction: 
          'EXTRAÍMOS APENAS A URL DA IMAGEM PRINCIPAL DA MATÉRIA JORNALÍSTICA. ' +
          'IGNORE LOGOS, ÍCONES, AVATARS, BANNERS DE PUBLICIDADE, IMAGENS DE REDES SOCIAIS E ELEMENTOS DECORATIVOS. ' +
          'SE NÃO HOUVER IMAGEM PRINCIPAL CLARA, RETORNE NULL. ' +
          'RESPOSTA DEVE SER JSON PURA: { "image_url": "https://example.com/image.jpg" }',
        schema: { image_url: 'string' },
      },
    });

    const extracted = result.extracted_content ?? 'null';
    let data = null;
    try {
      data = JSON.parse(extracted);
    } catch (e) {
      console.warn('[CRAWL4AI] Resposta não é JSON válido:', extracted);
      return null;
    }

    const url = data?.image_url ?? null;
    if (!url) {
      console.log('[CRAWL4AI] Nenhuma imagem principal encontrada.');
      return null;
    }

    // Validação final: garantir que é uma URL de imagem válida
    if (isValidImageUrl(url)) {
      console.log(`[CRAWL4AI] Imagem válida encontrada: ${url}`);
      return url;
    }

    console.warn('[CRAWL4AI] URL encontrada não parece ser uma imagem:', url);
    return null;
  } catch (err) {
    console.error('[CRAWL4AI] Erro inesperado:', err.message);
    return null;
  }
};

/**
 * Valida se uma URL parece ser de imagem (extensão ou content-type comum)
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  // Verifica extensões comuns de imagem
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg'];
  const hasImageExtension = imageExtensions.some(ext => 
    url.toLowerCase().endsWith(ext)
  );
  
  // Se não tiver extensão, ainda pode ser válida (alguns CDNs sem extensão)
  // Mas para nosso caso, exigimos extensão para evitar falsos positivos
  return hasImageExtension;
}

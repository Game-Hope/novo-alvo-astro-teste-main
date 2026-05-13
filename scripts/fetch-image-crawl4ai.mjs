// scripts/fetch-image-crawl4ai.mjs
const GROQ_KEY = process.env.GROQ_API_KEY ?? '';

/**
 * Camada 2: Extrai a imagem principal usando Fetch + IA do Groq (com limpeza de caracteres).
 * Remove todos os caracteres não-ASCII para evitar erros de ByteString.
 */
export const fetchImageWithCrawl4AI = async (articleUrl) => {
  if (!GROQ_KEY) {
    console.warn('[NEXA-IA] GROQ_API_KEY não configurada. Pulando fallback de IA.');
    return null;
  }

  try {
    console.log(`[NEXA-IA] Analisando HTML da fonte: ${articleUrl}`);

    // Busca o HTML com User-Agent comum para evitar bloqueios
    const response = await fetch(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) throw new Error(`Erro ao acessar site: ${response.status}`);
    let html = await response.text();

    // 🔑 CORREÇÃO CRÍTICA: Remove TUDO o que pode causar ByteString
    html = html
      .replace(/[^\x00-\x7F]/g, "")    // Remove todos os caracteres não-ASCII (acentos, emojis, etc.)
      .replace(/<script.*?>.*?<\/script>/gs, '') // Remove scripts
      .replace(/<style.*?>.*?<\/style>/gs, '')   // Remove estilos
      .substring(0, 20000); // Limita tamanho para evitar estouro de token

    // Envia para o Groq analisar
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-r1-distill-llama-70b',
        messages: [
          {
            role: 'system',
            content: 'Você é um extrator de dados especializado em HTML. Sua única tarefa é encontrar a URL da imagem principal (capa) de um artigo de notícias. Retorne APENAS um JSON: {"image_url": "URL_AQUI"}'
          },
          {
            role: 'user',
            content: `HTML para análise:\n\n${html}`
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    const result = await groqResponse.json();
    const content = result.choices?.[0]?.message?.content;
    
    if (!content) return null;

    const data = JSON.parse(content);
    const url = data.image_url || data.url || null;

    if (url && typeof url === 'string' && url.startsWith('http')) {
      console.log(`[NEXA-IA] Imagem encontrada via Groq: ${url}`);
      return url;
    }

    return null;
  } catch (err) {
    console.error(`[NEXA-IA] Erro no fallback de IA: ${err.message}`);
    return null;
  }
};

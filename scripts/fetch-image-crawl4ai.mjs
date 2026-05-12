// scripts/fetch-image-crawl4ai.mjs

const GROQ_KEY = process.env.GROQ_API_KEY ?? '';

/**
 * Camada 2: Extrai a imagem principal usando Fetch simples + IA do Groq.
 * Sem dependências externas de navegadores, usando apenas a API do Groq.
 */
export const fetchImageWithCrawl4AI = async (articleUrl) => {
  if (!GROQ_KEY) {
    console.warn('[NEXA-IA] GROQ_API_KEY não configurada. Pulando fallback de IA.');
    return null;
  }

  try {
    console.log(`[NEXA-IA] Analisando HTML da fonte: ${articleUrl}`);

    // 1. Faz o fetch do HTML bruto da página
    const response = await fetch(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari으로 537.36'
      }
    });

    if (!response.ok) throw new Error(`Erro ao acessar site: ${response.status}`);
    const html = await response.text();

    // 2. Limpa o HTML para não estourar o limite de tokens da IA
    // Removemos scripts e estilos para focar no conteúdo
    const cleanHtml = html
      .replace(/<script.*?>.*?<\/script>/gs, '')
      .replace(/<style.*?>.*?<\/style>/gs, '')
      .substring(0, 30000); // Pega os primeiros 30k caracteres (suficiente para achar a imagem)

    // 3. Envia para o Groq analisar e extrair a URL da imagem
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
            content: 'Você é um extrator de dados especializado em HTML. Sua única tarefa é encontrar a URL da imagem principal (capa) de um artigo de notícias.'
          },
          {
            role: 'user',
            content: `Analise este HTML e retorne APENAS um JSON com a URL da imagem principal. Ignore logos e ícones. \n\nHTML: ${cleanHtml}`
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

    if (url && url.startsWith('http')) {
      console.log(`[NEXA-IA] Imagem encontrada via Groq: ${url}`);
      return url;
    }

    return null;
  } catch (err) {
    console.error(`[NEXA-IA] Erro no fallback de IA: ${err.message}`);
    return null;
  }
};

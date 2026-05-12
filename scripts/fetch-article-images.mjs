// scripts/fetch-article-images.mjs
/**
 * Fetches article HTML and extracts image candidates.
 * Returns an array of objects: { url: string, source: string }
 */
export async function fetchArticleImages(sources) {
  const allCandidates = [];

  for (const source of sources) {
    try {
      const response = await fetch(source);
      if (!response.ok) {
        console.warn(`[FETCH-IMAGE] Failed to fetch ${source}: ${response.status}`);
        continue;
      }
      const html = await response.text();

      const candidates = extractImageCandidates(html, source);
      allCandidates.push(...candidates);
    } catch (err) {
      console.warn(`[FETCH-IMAGE] Error processing ${source}: ${err.message}`);
    }
  }

  // Deduplicate by URL
  const unique = [];
  const seen = new Set();
  for (const cand of allCandidates) {
    if (!seen.has(cand.url)) {
      seen.add(cand.url);
      unique.push(cand);
    }
  }
  return unique;
}

/**
 * Extracts image URLs from HTML.
 * Prioritizes og:image, twitter:image, JSON-LD, then <img> tags.
 * Filters out likely logos, avatars, icons.
 */
function extractImageCandidates(html, sourceUrl) {
  const candidates = [];

  // Helper to push candidate if valid
  const addCandidate = (url) => {
    if (!url) return;
    try {
      const obj = new URL(url, sourceUrl); // resolve relative URLs
      const src = obj.href;
      // Filter out data URLs, SVG if needed? We'll accept all.
      // Filter out obvious non-content images by checking URL for known patterns
      const lower = src.toLowerCase();
      if (
        lower.includes('logo') ||
        lower.includes('icon') ||
        lower.includes('avatar') ||
        lower.includes('banner') ||
        lower.includes('ads') ||
        lower.includes('pixel') ||
        lower.includes('tracking') ||
        lower.includes('spacer')
      ) {
        return; // skip likely non-content
      }
      // Optionally, could check dimensions via HEAD but skip for speed.
      candidates.push({ url: src, source: sourceUrl });
    } catch (e) {
      // ignore invalid URLs
    }
  };

  // 1. og:image and twitter:image
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (ogImageMatch) addCandidate(ogImageMatch[1]);
  const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
  if (twitterImageMatch) addCandidate(twitterImageMatch[1]);

  // 2. JSON-LD
  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatches) {
    for (const match of jsonLdMatches) {
      try {
        const jsonMatch = match.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1];
          const data = JSON.parse(jsonStr);
          // Handle both single object and array
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (item.image) {
              const img = item.image;
              if (Array.isArray(img)) {
                for (const subImg of img) {
                  if (typeof subImg === 'string') addCandidate(subImg);
                }
              } else if (typeof img === 'string') {
                addCandidate(img);
              } else if (img && typeof img === 'object' && img.url) {
                addCandidate(img.url);
              }
            }
          }
        }
      } catch (e) {
        // ignore invalid JSON
      }
    }
  }

  // 3. <img> tags (limited to avoid too many)
  const imgMatches = html.match(/<img[^>]*src=["']([^"']+)["']/gi);
  if (imgMatches) {
    for (const match of imgMatches) {
      const match2 = match.match(/src=["']([^"']+)["']/i);
      if (match2) addCandidate(match2[1]);
    }
  }

  return candidates;
}

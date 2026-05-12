// scripts/upload-image-to-r2.mjs
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * Configura o cliente S3 para o Cloudflare R2.
 * As credenciais são lidas das variáveis de ambiente do GitHub Actions:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
 */
const s3Client = new S3Client({
  region: "auto", // obrigatório para o SDK, mas o R2 ignora
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY ?? "",
    secretAccessKey: process.env.R2_SECRET_KEY ?? "",
  },
});

/**
 * Faz o upload de uma imagem (baixada de uma URL externa) para o R2.
 * @param {string} imageUrl - URL pública da imagem a ser baixada.
 * @param {string} key - Chave (nome do objeto) a ser usada no bucket (ex: "images/slug-da-pauta.jpg").
 * @returns {Promise<string|null>} URL pública da imagem no R2 ou null em caso de erro.
 */
export async function uploadImageToR2(imageUrl, key) {
  if (!imageUrl) {
    console.warn("[R2] Nenhuma URL de imagem fornecida para upload.");
    return null;
  }

  try {
    console.log(`[R2] Iniciando download da imagem: ${imageUrl}`);

    // 1️⃣ Baixa a imagem (binária) da URL externa
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(
        `Falha ao baixar a imagem: ${response.status} ${response.statusText}`
      );
    }
    const buffer = await response.arrayBuffer(); // retorna Uint8Array

    // 2️⃣ Faz o upload para o R2
    console.log(
      `[R2] Fazendo upload para bucket "${process.env.R2_BUCKET_NAME}" com chave "${key}"`
    );
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: Buffer.from(buffer),
        ContentType:
          response.headers.get("content-type") ?? "application/octet-stream",
        // Se o bucket não estiver configurado como público por padrão,
        // você pode adicionar: ACL: "public-read",
      })
    );

    // 3️⃣ Monta a URL pública (assumindo que o bucket está configurado com acesso público
    // ou que você usa um domínio customizado apontando para o bucket)
    const publicUrl = `${process.env.R2_PUBLIC_URL.replace(
      /\/+$/,
      ""
    )}/${key}`;
    console.log(`[R2] Upload concluído. URL pública: ${publicUrl}`);

    return publicUrl;
  } catch (err) {
    console.error(`[R2] Falha no upload da imagem: ${err.message}`);
    return null;
  }
}

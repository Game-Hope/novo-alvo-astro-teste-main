// scripts/r2-config.mjs

/**
 * Verifica se todas as variáveis de ambiente necessárias para o R2
 * estão configuradas no GitHub Actions.
 * @returns {boolean} true se todas as chaves estiverem presentes.
 */
export function isR2Configured() {
  const requiredSecrets = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY',
    'R2_SECRET_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_URL'
  ];

  const missing = requiredSecrets.filter(secret => !process.env[secret]);

  if (missing.length > 0) {
    console.warn(`[R2-CONFIG] Faltam as seguintes chaves de ambiente: ${missing.join(', ')}`);
    return false;
  }

  return true;
}

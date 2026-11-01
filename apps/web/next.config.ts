import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@lms/course-schema', '@lms/course-engine', '@lms/db', '@lms/media', '@lms/ai'],
  serverExternalPackages: ['postgres'],
  // diretório de saída próprio por ambiente (o e2e usa NEXT_DIST_DIR=.next-e2e para rodar ao lado do dev server)
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'standalone',
  reactStrictMode: true,
  // textos legais públicos (src/content/legal/*.md) são lidos do disco em tempo de execução: entram no pacote standalone
  outputFileTracingIncludes: Object.fromEntries(['/privacidade', '/cookies', '/termos', '/seguranca'].map((r) => [r, ['./src/content/legal/**/*']])),
  agentRules: false,
  // dev: hosts extras que podem abrir o servidor de desenvolvimento (ex.: IP na rede local, para testar no celular)
  ...(process.env.DEV_ALLOWED_ORIGINS ? { allowedDevOrigins: process.env.DEV_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean) } : {}),
};

export default nextConfig;

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@lms/course-schema', '@lms/course-engine', '@lms/db', '@lms/media', '@lms/ai'],
  serverExternalPackages: ['postgres'],
  // diretório de saída próprio por ambiente (o e2e usa NEXT_DIST_DIR=.next-e2e para rodar ao lado do dev server)
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'standalone',
  reactStrictMode: true,
  agentRules: false,
};

export default nextConfig;

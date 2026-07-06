import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    output: 'standalone',
};

// Aumentar maxDuration para rotas de relatório e download (600s = 10 minutos)
export const maxDuration = 600;

export default nextConfig;

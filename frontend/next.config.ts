import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    output: 'standalone',
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'Referrer-Policy', value: 'no-referrer' },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=()',
                    },
                    {
                        key: 'Content-Security-Policy',
                        value: [
                            "default-src 'self'",
                            "base-uri 'self'",
                            "frame-ancestors 'none'",
                            "object-src 'none'",
                            "img-src 'self' data: blob: https:",
                            // blob: needed for FontFace/object-URL font loads (canvas/PDF/devtools patterns)
                            "font-src 'self' data: blob:",
                            "style-src 'self' 'unsafe-inline'",
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                            // https: for Stripe Checkout / Google OAuth redirects; ws:/wss: for Next HMR in dev
                            "connect-src 'self' https: http: ws: wss:",
                            "form-action 'self' https:",
                            "frame-src 'self' https:",
                        ].join('; '),
                    },
                ],
            },
        ];
    },
};

// Aumentar maxDuration para rotas de relatório e download (600s = 10 minutos)
export const maxDuration = 600;

export default nextConfig;

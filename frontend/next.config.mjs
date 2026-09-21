/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { proxyTimeout: 180_000 }, // Gemini extraction takes longer than the 30s default
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${process.env.BACKEND_URL || 'http://127.0.0.1:8000'}/api/v1/:path*` }]
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig

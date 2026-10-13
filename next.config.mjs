/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['qrdx.org'],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Addresses, blocks and transactions are each served by one prerendered page; the browser
  // reads which one from the URL (components/explorer/route-segment.ts). A server render per
  // request cost the Worker 7–13 ms of CPU, over Cloudflare's 10 ms limit (error 1102).
  async rewrites() {
    return [
      { source: '/address/:address', destination: '/address/_' },
      { source: '/block/:number', destination: '/block/_' },
      { source: '/tx/:hash', destination: '/tx/_' },
    ]
  },
}

export default nextConfig

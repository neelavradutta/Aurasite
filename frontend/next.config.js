/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    domains: ['localhost', 'aurasite.onrender.com'],
  },
};

module.exports = nextConfig;

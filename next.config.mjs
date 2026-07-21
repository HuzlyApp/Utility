/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: false,
  experimental: {
    serverComponentsExternalPackages: [
      "pdf-parse",
      "mammoth",
      "tesseract.js",
      "@neondatabase/serverless",
    ],
  },
};

export default nextConfig;

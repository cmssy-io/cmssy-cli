/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "assets.cmssy.io" }],
  },
};

export default nextConfig;

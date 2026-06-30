/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // cmssy media is served from arbitrary https hosts (your asset CDN).
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;

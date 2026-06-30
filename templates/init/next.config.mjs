/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // cmssy media is served from assets.cmssy.io. Add your own hosts here if
    // you reference images from other domains - avoid a wildcard hostname, which
    // turns the Next image optimizer into an SSRF vector.
    remotePatterns: [{ protocol: "https", hostname: "assets.cmssy.io" }],
  },
};

export default nextConfig;

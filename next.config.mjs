/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundle autocontenido para Docker en el VPS.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The API reads skills/*.md and data/*.md at runtime; make sure Vercel ships them.
  outputFileTracingIncludes: {
    "/api/**/*": ["./skills/**/*", "./data/**/*"],
  },
};

export default nextConfig;

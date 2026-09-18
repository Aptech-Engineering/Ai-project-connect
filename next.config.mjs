/**
 * The site is exported as static files and uploaded to public_html on Nairahost,
 * where the PHP API answers on the same domain at /api. For local work, point
 * NEXT_PUBLIC_API_BASE at the PHP dev server (see .env.example).
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  // Static hosting serves /apply as /apply/index.html.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;

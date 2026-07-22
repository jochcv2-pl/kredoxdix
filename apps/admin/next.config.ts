import type { NextConfig } from "next";
import { withSecurityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = withSecurityHeaders({
  reactStrictMode: true,
});

export default nextConfig;

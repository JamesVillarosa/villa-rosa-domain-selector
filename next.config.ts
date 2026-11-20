import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @libsql/client has native bindings we don't want Webpack/Turbopack
  // touching during the API-route bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;

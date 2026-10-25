import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@slay2/odds", "@slay2/game-schema"],
  typedRoutes: true,
};

export default config;

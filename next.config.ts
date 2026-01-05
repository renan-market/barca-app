import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/prenota",
        destination: "/?from=prenota",
        permanent: false,
      },
      {
        source: "/prenota/",
        destination: "/?from=prenota",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

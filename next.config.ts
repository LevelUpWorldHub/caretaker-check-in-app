import type { NextConfig } from "next";

const cors = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Content-Type" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/agent-manifest.json", headers: cors },
      { source: "/links.json", headers: cors },
      { source: "/agent-mcp.json", headers: cors },
      { source: "/caretaker_checkin.network.json", headers: cors },
      { source: "/care_glossary.network.json", headers: cors },
    ];
  },
};

export default nextConfig;

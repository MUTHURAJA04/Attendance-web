import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2];
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const rootDir = path.resolve(__dirname, "../../");
const envCandidates = [
  path.resolve(__dirname, ".env.local"),
  path.resolve(__dirname, ".env"),
  path.join(rootDir, ".env.local"),
  path.join(rootDir, ".env")
];

for (const filePath of envCandidates) {
  loadEnvFile(filePath);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  }
};

export default nextConfig;

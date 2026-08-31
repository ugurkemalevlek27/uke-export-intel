import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Ticaret veri dosyalari (Excel/CSV) varsayilan 1MB sinirindan buyuk olabilir.
    // V1 icin makul bir ust sinir; cok daha buyuk dosyalar (100K+ satir) icin
    // ileride streaming/chunked upload dusunulmeli (bkz. CLAUDE.md madde 19).
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;

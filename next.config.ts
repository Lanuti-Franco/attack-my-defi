import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * QVAC carga modelos a través del runtime Bare y de addons nativos (llama.cpp,
   * whisper). Nada de eso puede pasar por el bundler: Turbopack intenta resolver
   * sus assets como módulos y falla con "Unknown module type". Se resuelven en
   * runtime desde node_modules, como paquetes de Node normales.
   */
  serverExternalPackages: [
    '@qvac/sdk',
    '@qvac/llm-llamacpp',
    '@qvac/embed-llamacpp',
    '@qvac/registry-client',
    '@qvac/infer-base',
    '@qvac/fabric',
    'bare-runtime',
  ],
}

export default nextConfig

import { defineConfig } from 'tsup'

export default defineConfig([
  // ESM bundle
  {
    entry: { svgflow: 'src/index.ts' },
    format: ['esm'],
    outDir: 'dist',
    dts: true,
    sourcemap: true,
    clean: true,
    minify: false,
    outExtension: () => ({ js: '.js' }),
  },
  // IIFE / UMD bundle for CDN use
  {
    entry: { svgflow: 'src/index.ts' },
    format: ['iife'],
    outDir: 'dist',
    dts: false,
    sourcemap: true,
    clean: false,
    minify: false,
    globalName: 'SvgFlow',
    outExtension: () => ({ js: '.umd.js' }),
  },
])

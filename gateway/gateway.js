// API Gateway - Lab 11 (Dokumentasi API Otomatis)
// Dasar: gateway Lab 09. Urutan pemrosesan:
//   rate limiting -> /health -> /openapi.json dan /docs (ditangani gateway sendiri) -> routing (proxy) -> 404
// Pengecekan API key dari Lab 08 tetap dinonaktifkan (seperti Lab 09).
require('dotenv').config(); // membaca file .env (jika ada) ke process.env

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { rateLimit } = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const PORT = process.env.PORT || 8080;
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3000';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3001';

// Alamat spesifikasi OpenAPI milik masing-masing service (bisa diganti lewat environment variable)
const DOC_SOURCES = [
  { prefix: '/product-service', url: process.env.PRODUCT_DOC_URL || `${PRODUCT_SERVICE_URL}/openapi.json` },
  { prefix: '/order-service', url: process.env.ORDER_DOC_URL || `${ORDER_SERVICE_URL}/openapi.json` },
];

const app = express();
app.disable('x-powered-by');

// trust proxy: jumlah "lompatan" proxy tepercaya di depan gateway.
// - Lokal (tanpa proxy)      : TRUST_PROXY=0 (bawaan)
// - Render / hosting sejenis : TRUST_PROXY=1
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));

// 1) RATE LIMITING: maks. 20 request per 10 detik per alamat IP. Lewat batas -> HTTP 429.
//    Berkas statis Swagger UI di /docs tidak dihitung, karena satu kali buka halaman bisa memuat
//    belasan berkas dan akan cepat menghabiskan kuota.
app.use(
  rateLimit({
    windowMs: 10 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.startsWith('/docs'),
    message: { error: 'Terlalu banyak request. Coba lagi beberapa detik lagi.' },
  })
);

// Endpoint cek kesehatan gateway (dijawab gateway sendiri, tidak diteruskan ke service)
app.get('/health', (req, res) => res.json({ service: 'gateway', status: 'ok' }));

// 2) DOKUMENTASI GABUNGAN: ambil /openapi.json dari tiap service lalu gabungkan.
//    Harus dipasang SEBELUM proxy, supaya /docs dan /openapi.json ditangani gateway sendiri.
//    Gateway tidak menyimpan salinan: spesifikasi diambil setiap kali diminta.
async function buildSpec() {
  const merged = {
    openapi: '3.0.3',
    info: {
      title: 'Toko API (via Gateway)',
      version: '1.0.0',
      description: 'Dokumentasi gabungan product-service dan order-service',
    },
    servers: [{ url: '/' }], // "Try it out" memakai alamat gateway
    paths: {},
    components: { schemas: {} },
  };

  for (const source of DOC_SOURCES) {
    try {
      const res = await fetch(source.url, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const spec = await res.json();
      // tambahkan prefix pada setiap path, mis. /products -> /product-service/products
      for (const [path, operations] of Object.entries(spec.paths || {})) {
        merged.paths[source.prefix + path] = operations;
      }
      // skema dengan nama sama (mis. Error) ditimpa; definisinya sengaja dibuat identik di kedua service
      Object.assign(merged.components.schemas, (spec.components || {}).schemas);
    } catch (e) {
      console.warn('dokumentasi gagal diambil dari', source.url);
    }
  }
  return merged;
}

app.get('/openapi.json', async (req, res) => res.json(await buildSpec()));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(null, { swaggerOptions: { url: '/openapi.json' } }));

// 3) ROUTING: teruskan request berdasarkan prefix, lalu buang prefix-nya (pathRewrite).
//    /product-service/products -> product-service menerima /products
//    /order-service/orders     -> order-service menerima /orders
// CATATAN: jangan memasang express.json() sebelum proxy, nanti body POST tidak sampai ke service.
const proxyTo = (prefix, target) =>
  createProxyMiddleware({
    pathFilter: prefix,
    target,
    changeOrigin: true,
    pathRewrite: { [`^${prefix}`]: '' },
  });

app.use(proxyTo('/product-service', PRODUCT_SERVICE_URL));
app.use(proxyTo('/order-service', ORDER_SERVICE_URL));

// Route lain yang tidak dikenal
app.use((req, res) => res.status(404).json({ error: 'Route tidak ditemukan' }));

app.listen(PORT, () => {
  console.log(`Gateway berjalan di port ${PORT}`);
  console.log(`  /product-service/* -> ${PRODUCT_SERVICE_URL}`);
  console.log(`  /order-service/*   -> ${ORDER_SERVICE_URL}`);
  console.log(`  Dokumentasi        -> http://localhost:${PORT}/docs`);
});

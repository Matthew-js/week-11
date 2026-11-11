const express = require('express');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());

// ---------- Dokumentasi OpenAPI ----------
const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: { title: 'Product Service', version: '1.0.0', description: 'Data produk dan stok' },
    servers: [{ url: 'http://localhost:3000' }],
  },
  apis: [__filename], // baca anotasi @openapi dari file ini
});
app.get('/openapi.json', (req, res) => res.json(spec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

/**
 * @openapi
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 1 }
 *         name: { type: string, example: Kopi Arabika 250g }
 *         price: { type: integer, example: 85000 }
 *         stock: { type: integer, example: 10 }
 *         category: { type: string, example: Periferal }
 *     ReserveRequest:
 *       type: object
 *       required: [quantity]
 *       properties:
 *         quantity: { type: integer, minimum: 1, example: 2 }
 *     ReserveResponse:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 1 }
 *         name: { type: string, example: Kopi Arabika 250g }
 *         price: { type: integer, example: 85000 }
 *         reserved: { type: integer, example: 2 }
 *         remainingStock: { type: integer, example: 8 }
 *     Error:
 *       type: object
 *       properties:
 *         error: { type: string, example: Produk tidak ditemukan }
 */

// ---------- Data produk (milik product-service) ----------
const products = [
  { id: 1, name: 'Kopi Arabika 250g', price: 85000, stock: 10, category: 'Periferal' },
  { id: 2, name: 'Teh Hijau 100g', price: 45000, stock: 20, category: 'Periferal' },
  { id: 3, name: 'Gula Aren 500g', price: 32000, stock: 5, category: 'Periferal' },
];

const findProduct = (id) => products.find((p) => p.id === Number(id));

// GET /health -> cek service hidup
app.get('/health', (req, res) => {
  res.json({ service: 'product-service', status: 'ok' });
});

/**
 * @openapi
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: Daftar semua produk
 *     responses:
 *       200:
 *         description: Berhasil
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Product'
 */
app.get('/products', (req, res) => {
  res.json(products);
});

/**
 * @openapi
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Detail satu produk
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Berhasil
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       404:
 *         description: Produk tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/products/:id', (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });
  res.json(product);
});

/**
 * @openapi
 * /products/{id}/reserve:
 *   post:
 *     tags: [Products]
 *     summary: Cek dan kurangi stok produk (dipanggil order-service)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReserveRequest'
 *     responses:
 *       200:
 *         description: Stok berhasil dikurangi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReserveResponse'
 *       400:
 *         description: quantity tidak valid, atau body bukan JSON yang valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Produk tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Stok tidak cukup
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Error'
 *                 - type: object
 *                   properties:
 *                     available: { type: integer, example: 5 }
 */
// Body: { "quantity": 2 }
//   200 = stok berhasil dikurangi | 400 = body salah | 404 = produk tidak ada | 409 = stok tidak cukup
app.post('/products/:id/reserve', (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });

  const { quantity } = req.body || {};
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'quantity harus bilangan bulat > 0' });
  }
  if (product.stock < quantity) {
    return res.status(409).json({ error: 'Stok tidak cukup', available: product.stock });
  }

  product.stock -= quantity;
  res.json({
    id: product.id,
    name: product.name,
    price: product.price,
    reserved: quantity,
    remainingStock: product.stock,
  });
});

// 404 untuk route yang tidak dikenal
app.use((req, res) => res.status(404).json({ error: 'Endpoint product-service tidak ditemukan' }));

// Penanganan JSON rusak pada body request
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Body request bukan JSON yang valid' });
  }
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`product-service berjalan di port ${PORT}`));

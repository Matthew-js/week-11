const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

let lulus = 0;
let gagal = 0;

function cek(nama, kondisi, detail = '') {
  if (kondisi) {
    lulus++;
    console.log(`  PASS  ${nama}`);
  } else {
    gagal++;
    console.log(`  FAIL  ${nama}${detail ? '  -> ' + detail : ''}`);
  }
}

async function kirim(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // respons bukan JSON
  }
  return { status: res.status, data };
}

(async () => {
  console.log(`Smoke test lewat gateway: ${BASE}\n`);

  console.log('[1] Kesehatan gateway dan service');
  let r = await kirim('GET', '/health');
  cek('GET /health -> 200', r.status === 200, `status ${r.status}`);
  r = await kirim('GET', '/product-service/health');
  cek('GET /product-service/health -> 200', r.status === 200, `status ${r.status}`);
  r = await kirim('GET', '/order-service/health');
  cek('GET /order-service/health -> 200', r.status === 200, `status ${r.status}`);

  console.log('\n[2] product-service lewat gateway');
  r = await kirim('GET', '/product-service/products');
  cek('GET /product-service/products -> 200 dan berisi array', r.status === 200 && Array.isArray(r.data) && r.data.length > 0, `status ${r.status}`);
  r = await kirim('GET', '/product-service/products/2');
  cek('GET /product-service/products/2 -> 200', r.status === 200 && r.data && r.data.id === 2, `status ${r.status}`);
  const stokAwal = r.data && r.data.stock;

  console.log('\n[3] Buat pesanan (order-service memanggil product-service)');
  r = await kirim('POST', '/order-service/orders', { productId: 2, quantity: 1 });
  cek('POST /order-service/orders -> 201', r.status === 201, `status ${r.status} ${JSON.stringify(r.data)}`);
  const pesanan = r.data;
  cek('Pesanan berstatus confirmed dan total benar', !!pesanan && pesanan.status === 'confirmed' && pesanan.total === pesanan.unitPrice * 1);

  r = await kirim('GET', '/product-service/products/2');
  cek('Stok produk 2 berkurang 1', r.status === 200 && r.data.stock === stokAwal - 1, `stok awal ${stokAwal}, sekarang ${r.data && r.data.stock}`);

  r = await kirim('GET', '/order-service/orders');
  cek('GET /order-service/orders -> 200 dan memuat pesanan baru', r.status === 200 && Array.isArray(r.data) && !!pesanan && r.data.some((o) => o.id === pesanan.id), `status ${r.status}`);

  console.log('\n[4] Kasus gagal yang wajar');
  r = await kirim('POST', '/order-service/orders', { productId: 2, quantity: 999999 });
  cek('Stok tidak cukup -> 409', r.status === 409, `status ${r.status}`);
  r = await kirim('POST', '/order-service/orders', { productId: 999, quantity: 1 });
  cek('Produk tidak ada -> 404', r.status === 404, `status ${r.status}`);
  r = await kirim('POST', '/order-service/orders', { productId: 'abc' });
  cek('Body tidak valid -> 400', r.status === 400, `status ${r.status}`);
  r = await kirim('GET', '/tidak-ada');
  cek('Route tidak dikenal di gateway -> 404', r.status === 404, `status ${r.status}`);

  console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`);
  process.exit(gagal === 0 ? 0 : 1);
})().catch((err) => {
  console.error(`\nGagal menghubungi gateway di ${BASE}: ${err.cause?.code || err.message}`);
  console.error('Pastikan gateway (8080), product-service (3000), dan order-service (3001) sudah berjalan.');
  process.exit(1);
});

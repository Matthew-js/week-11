// Mengirim 30 request berurutan ke gateway untuk membuktikan rate limiting (dari Lab 08).
// Jalankan : node test-rate-limit.js
// Opsional : node test-rate-limit.js http://localhost:8080/product-service/products
// Butuh Node.js 18+ (fetch bawaan). Bawaan memakai /health sehingga hanya gateway yang perlu berjalan.
const url = process.argv[2] || 'http://localhost:8080/health';
const total = 30;

(async () => {
  const hitung = {};
  console.log(`Mengirim ${total} request ke ${url}\n`);

  for (let i = 1; i <= total; i++) {
    try {
      const res = await fetch(url);
      await res.text(); // habiskan body supaya koneksi bebas
      hitung[res.status] = (hitung[res.status] || 0) + 1;
      console.log(`Request ke-${String(i).padStart(2, '0')} -> status ${res.status}`);
    } catch (err) {
      console.error(`Request ke-${i} gagal: ${err.cause?.code || err.message}. Apakah gateway sudah berjalan?`);
      process.exit(1);
    }
  }

  console.log('\nRingkasan:');
  for (const [status, jumlah] of Object.entries(hitung)) {
    console.log(`  status ${status}: ${jumlah} request`);
  }
})();

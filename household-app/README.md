# Pager Gunung Household

Aplikasi pencatatan keuangan rumah tangga sederhana untuk uang masuk dan uang
keluar. Dashboard menampilkan saldo keseluruhan, ringkasan bulan terpilih, dan
riwayat transaksi. Pengeluaran menggunakan kategori teks bebas.

Data disimpan secara lokal di IndexedDB melalui Dexie. Peningkatan database ke
versi 2 menambahkan periode `YYYY-MM` pada transaksi lama berdasarkan tanggal
tersimpan; tabel dan relasi pembelian lama tetap dipertahankan. Transaksi
pengeluaran yang berasal dari pembelian PAID dihitung sekali melalui tabel
transaksi dan tetap dilindungi dari edit/hapus langsung.

## Development

```sh
npm install
npm run dev
```

## Checks

```sh
npm run test
npm run lint
npm run build
```

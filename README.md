# ComdataSheet — Toko Online Barang Import

Toko online statis yang di-hosting gratis di **GitHub Pages**. Harga jual dalam Rupiah
**dihitung ulang otomatis setiap 4 jam** mengikuti kurs USD/CNY terbaru dan harga dari
toko sumber import. Pelanggan memesan lewat keranjang → pesanan terkirim ke WhatsApp Anda.

## Cara kerja

```
data/products.json  ─┐
data/config.json    ─┼─► scripts/update_prices.py ─► data/katalog.json ─► website
kurs terbaru (API)  ─┤        (GitHub Actions,          (publik)
harga toko sumber   ─┘         tiap 4 jam)        ─► data/internal.json (modal & supplier)
```

### Rumus harga (sama dengan Excel costing)

**Supplier import**
```
Harga Barang = (harga supplier + shipping per unit) × kurs × (1 + buffer kurs 3%)
Harga Beli   = Harga Barang + biaya transaksi luar negeri (3%)
Harga Indo   = Harga Beli + Bea Masuk (default 30%, bisa diubah per produk)
Harga Jual   = Harga Indo + Profit (15%)
Harga Toko   = Harga Jual + PPN & PPh (12,5%)  → dibulatkan ke atas per Rp 1.000
```

**Supplier lokal** (harga dalam Rupiah, tanpa kurs & bea masuk)
```
Harga Beli   = harga supplier + ongkir per unit
Harga Jual   = Harga Beli + Profit
Harga Toko   = Harga Jual + PPN & PPh  → dibulatkan ke atas
```

Semua persentase, shipping default, dan margin per kategori diatur di **Admin → Pengaturan Toko**
(tersimpan di `data/config.json`). Margin: produk → kategori → default.

## Sumber harga supplier

| Toko sumber | Harga sumber | Kurs |
|---|---|---|
| Toko yang membuka harga di halaman (Shopify, Adafruit, Pimoroni, Mouser, toko lain dengan data schema.org) | **Otomatis** dibaca dari `url` | Otomatis |
| **Alibaba, 1688, Taobao, AliExpress** | Isi `harga_manual` (USD/CNY) — situs ini memblokir bot dengan captcha | Otomatis |
| Toko lain yang tidak terbaca | Isi `harga_manual`, atau tambahkan `regex_harga` | Otomatis |

Jadi walau harga Alibaba diisi manual, **harga Rupiah tetap ikut naik-turun mengikuti kurs**.
Ubah `harga_manual` hanya bila supplier mengubah harga USD-nya.

## Halaman Admin (tanpa edit file)

Buka `https://<username>.github.io/ComdataSheet/admin.html`.

- **Pertama kali di tiap perangkat:** tempel token GitHub, lalu buat PIN. Token disimpan
  terenkripsi di browser itu dan hanya bisa dibuka dengan PIN.
- **Berikutnya:** cukup masukkan PIN.
- **Tab Produk:** tambah/edit/hapus produk, unggah foto, dan unggah brosur/datasheet (PDF).
  File tersimpan di folder `files/<ID produk>/`.
- **Tab Update Harga (Excel):** unduh Excel harga per kategori, isi, unggah kembali, cek pratinjau, lalu simpan.
- **Tab Pengaturan Toko:** nomor WhatsApp, info pembayaran, margin default, margin per kategori, ongkir, pajak.

Membuat token: GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token →
Repository access: *Only select repositories* → `ComdataSheet` → Permissions: **Contents: Read and write**
dan **Actions: Read and write**.

Jika perangkat hilang: hapus token itu di GitHub (Settings → Fine-grained tokens → Delete), lalu buat token baru.

Urutan margin: **margin produk** → **margin kategori** → **margin default**.

## Menambah / mengubah produk secara manual

Edit `data/products.json` langsung di GitHub (klik file → ikon pensil → *Commit changes*).
Setelah disimpan, harga dihitung dan website diperbarui otomatis dalam ±1 menit.

```json
{
  "id": "CDS-004",
  "nama": "Nama produk",
  "kategori": "Servos",
  "gambar": "https://link-gambar.jpg",
  "deskripsi": "Keterangan produk",
  "spesifikasi": { "Tegangan": "5 V", "Torsi": "20 kg.cm" },
  "galeri": ["files/CDS-104/foto-2.jpg"],
  "unduhan": [{ "judul": "Brosur", "url": "files/CDS-104/brosur.pdf" }],
  "berat_kg": 0.25,
  "margin_persen": 30,
  "stok": true,
  "sumber": {
    "nama_toko": "Alibaba - blackcatmark",
    "url": "https://www.alibaba.com/product-detail/....html",
    "mata_uang": "USD",
    "harga_manual": 6.5
  }
}
```

`margin_persen` per produk boleh dihapus (pakai default). `stok: false` = tombol beli dimatikan.
Gambar bisa diunggah ke folder `assets/img/` lalu ditulis `"gambar": "assets/img/nama.jpg"`.

## Pemasangan di GitHub (sekali saja)

1. Buat akun di github.com, lalu **New repository** (misal `comdatasheet`), pilih *Public*.
2. Unggah semua file folder ini (*Add file → Upload files*, termasuk folder `.github`).
3. **Settings → Pages → Source: GitHub Actions.**
4. Buka tab **Actions** → *Update harga & publikasikan toko* → **Run workflow**.
5. Website tampil di `https://<username>.github.io/comdatasheet/`.
   Domain sendiri (misal `comdatasheet.com`) bisa dipasang di *Settings → Pages → Custom domain*.

Ganti dulu di `data/config.json`: nomor `whatsapp` (format 62…), `info_pembayaran`, dan `tokopedia_url`.

### Update harga manual / menyetujui lonjakan harga

Tab **Actions → Update harga & publikasikan toko → Run workflow**. Centang
*abaikan_batas* bila ada peringatan "melebihi batas" dan Anda sudah memastikan harga barunya benar.
Peringatan tampil di ringkasan setiap run.

## Catatan penting

- **Repo publik = file bisa dilihat orang.** Website hanya menampilkan harga jual, tapi
  `products.json` dan `internal.json` (modal & supplier) terlihat di repo publik.
  Agar rahasia, jadikan repo *Private* — GitHub Pages dari repo private butuh paket GitHub Pro (±US$4/bulan).
- Jadwal otomatis GitHub bisa terlambat beberapa menit; itu normal.
- Pembayaran saat ini lewat transfer + konfirmasi WhatsApp. Pembayaran otomatis (Midtrans/Xendit)
  bisa ditambahkan nanti memakai *payment link*.
- Uji di komputer sendiri: `python3 scripts/update_prices.py` lalu `python3 -m http.server`
  dan buka http://localhost:8000.

// ComdataSheet — toko statis. Data harga dibaca dari data/katalog.json
// yang diperbarui otomatis oleh GitHub Actions (scripts/update_prices.py).
(function () {
  const $ = (id) => document.getElementById(id);
  const rupiah = (n) => "Rp " + Math.round(n).toLocaleString("id-ID");
  const KEY = "cds-keranjang";

  let katalog = { toko: {}, produk: [] };
  let keranjang = bacaKeranjang(); // { id: qty } — harga selalu diambil dari katalog terbaru

  function bacaKeranjang() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function simpanKeranjang() {
    try { localStorage.setItem(KEY, JSON.stringify(keranjang)); } catch (e) { /* abaikan */ }
  }
  function waktu(iso) {
    return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function muat() {
    try {
      const res = await fetch("data/katalog.json?t=" + Date.now(), { cache: "no-store" });
      katalog = await res.json();
    } catch (e) {
      $("kurs-box").textContent = "Gagal memuat katalog. Coba muat ulang halaman.";
      return;
    }
    const t = katalog.toko || {};
    if (t.nama_toko) { $("nama-toko").textContent = t.nama_toko; document.title = t.nama_toko + " — Toko Barang Import"; }
    if (t.slogan) $("slogan").textContent = t.slogan;
    if (t.info_pembayaran) $("info-bayar").textContent = t.info_pembayaran;
    if (t.tokopedia_url) $("link-tokopedia").innerHTML = 'Kami juga ada di <a href="' + esc(t.tokopedia_url) + '" target="_blank" rel="noopener">Tokopedia</a>.';

    const k = katalog.kurs || {};
    $("kurs-box").innerHTML =
      '<span>Kurs hari ini: <strong>1 USD = ' + rupiah(k.usd_idr || 0) + "</strong></span>" +
      "<span>Harga diperbarui: " + esc(waktu(katalog.diperbarui)) + "</span>";

    const kats = [...new Set(katalog.produk.map((p) => p.kategori).filter(Boolean))].sort();
    $("kategori").innerHTML += kats.map((x) => '<option value="' + esc(x) + '">' + esc(x) + "</option>").join("");

    // buang item keranjang yang produknya sudah tidak ada
    for (const id of Object.keys(keranjang)) if (!cariProduk(id)) delete keranjang[id];
    simpanKeranjang();
    tampilkanProduk();
    tampilkanKeranjang();
  }

  function cariProduk(id) { return katalog.produk.find((p) => p.id === id); }

  function tampilkanProduk() {
    const q = $("cari").value.trim().toLowerCase();
    const kat = $("kategori").value;
    const list = katalog.produk.filter((p) =>
      (!kat || p.kategori === kat) &&
      (!q || (p.nama + " " + (p.deskripsi || "") + " " + p.id).toLowerCase().includes(q)));

    $("kosong").hidden = list.length > 0;
    $("daftar-produk").innerHTML = list.map((p) => {
      let tren = "";
      if (p.harga_sebelumnya && p.harga_sebelumnya !== p.harga_idr) {
        const turun = p.harga_idr < p.harga_sebelumnya;
        const pct = Math.abs((p.harga_idr - p.harga_sebelumnya) / p.harga_sebelumnya * 100).toFixed(1);
        tren = '<span class="tren ' + (turun ? "turun" : "naik") + '">' + (turun ? "▼" : "▲") + " " + pct + "%</span>";
      }
      return '<article class="card">' +
        '<img loading="lazy" src="' + esc(p.gambar) + '" alt="' + esc(p.nama) + '">' +
        '<div class="card-body">' +
        '<span class="kat">' + esc(p.kategori) + "</span>" +
        "<h3>" + esc(p.nama) + "</h3>" +
        '<p class="desk" title="' + esc(p.deskripsi) + '">' + esc(p.deskripsi) + "</p>" +
        '<div class="harga">' + rupiah(p.harga_idr) + tren + "</div>" +
        '<span class="asal">Import · harga ' + esc(p.mata_uang_sumber) + " mengikuti kurs</span>" +
        '<button class="btn" data-tambah="' + esc(p.id) + '"' + (p.stok === false ? " disabled>Stok habis" : ">+ Keranjang") + "</button>" +
        "</div></article>";
    }).join("");
  }

  function tampilkanKeranjang() {
    const ids = Object.keys(keranjang);
    let total = 0, jumlah = 0;
    $("isi-keranjang").innerHTML = ids.length ? ids.map((id) => {
      const p = cariProduk(id), q = keranjang[id];
      total += p.harga_idr * q; jumlah += q;
      return '<div class="item"><div><strong>' + esc(p.nama) + '</strong><div class="sub">' + rupiah(p.harga_idr) + " × " + q + "</div></div>" +
        '<div class="qty"><button data-kurang="' + esc(id) + '">−</button><span>' + q + '</span><button data-tambah="' + esc(id) + '">+</button></div></div>';
    }).join("") : '<p class="kosong">Keranjang masih kosong.</p>';
    $("total").textContent = rupiah(total);
    $("jumlah-keranjang").textContent = jumlah;
    $("form-checkout").querySelector("button").disabled = !ids.length;
  }

  function bukaKeranjang(buka) {
    $("keranjang").classList.toggle("buka", buka);
    $("keranjang").setAttribute("aria-hidden", String(!buka));
    $("overlay").hidden = !buka;
  }

  document.addEventListener("click", (e) => {
    const tambah = e.target.closest("[data-tambah]");
    const kurang = e.target.closest("[data-kurang]");
    if (tambah) {
      const id = tambah.dataset.tambah;
      keranjang[id] = (keranjang[id] || 0) + 1;
      if (!tambah.closest(".drawer")) bukaKeranjang(true);
    } else if (kurang) {
      const id = kurang.dataset.kurang;
      if (--keranjang[id] <= 0) delete keranjang[id];
    } else return;
    simpanKeranjang();
    tampilkanKeranjang();
  });
  $("buka-keranjang").onclick = () => bukaKeranjang(true);
  $("tutup-keranjang").onclick = () => bukaKeranjang(false);
  $("overlay").onclick = () => bukaKeranjang(false);
  $("cari").oninput = tampilkanProduk;
  $("kategori").onchange = tampilkanProduk;

  $("form-checkout").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    let total = 0;
    const baris = Object.entries(keranjang).map(([id, q], i) => {
      const p = cariProduk(id); total += p.harga_idr * q;
      return (i + 1) + ". " + p.nama + " (" + p.id + ")\n   " + q + " × " + rupiah(p.harga_idr) + " = " + rupiah(p.harga_idr * q);
    });
    const pesan =
      "Halo " + (katalog.toko.nama_toko || "") + ", saya mau pesan:\n\n" + baris.join("\n") +
      "\n\n*Total: " + rupiah(total) + "*\n(kurs 1 USD = " + rupiah(katalog.kurs.usd_idr) + ", harga per " + waktu(katalog.diperbarui) + ")" +
      "\n\nNama: " + f.get("nama") + "\nHP: " + f.get("hp") + "\nAlamat: " + f.get("alamat") +
      (f.get("catatan") ? "\nCatatan: " + f.get("catatan") : "") +
      "\n\nMohon info ongkir & total pembayaran. Terima kasih.";
    window.open("https://wa.me/" + katalog.toko.whatsapp + "?text=" + encodeURIComponent(pesan), "_blank");
  };

  muat();
})();

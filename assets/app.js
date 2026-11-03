// ComdataSheet — toko statis. Data harga dibaca dari data/katalog.json
// yang diperbarui otomatis oleh GitHub Actions (scripts/update_prices.py).
(function () {
  const $ = (id) => document.getElementById(id);
  const rupiah = (n) => "Rp " + Math.round(n).toLocaleString("id-ID");
  const KEY = "cds-keranjang";
  const KEY_BAHASA = "cds-bahasa";
  const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // ------------------------------------------------------------ Bahasa
  const TEKS = {
    id: {
      semua: "Semua", cari: "Cari produk…", semua_supplier: "Semua supplier", supplier_import: "Supplier import", supplier_lokal: "Supplier lokal",
      memuat: "Memuat kurs…", gagal_muat: "Gagal memuat katalog. Coba muat ulang halaman.",
      kurs_hari_ini: "Kurs hari ini", diperbarui: "Harga diperbarui",
      detail: "Detail", keranjang_tambah: "+ Keranjang", stok_habis: "Stok habis",
      ready: "Ready stock", ready_detail: "Ready stock — siap dikirim",
      indent: "Indent ±{hari} hari", indent_detail: "Indent / PO — estimasi {hari} hari setelah pembayaran",
      label_import: "Import", label_lokal: "Lokal",
      beranda: "Beranda", kembali: "Kembali", tanya_wa: "Tanya via WhatsApp", unduh: "Unduh dokumen", dokumen: "Dokumen",
      deskripsi: "Deskripsi", spesifikasi: "Spesifikasi",
      keranjang: "Keranjang", keranjang_kosong: "Keranjang masih kosong.", total: "Total",
      f_nama: "Nama lengkap", f_hp: "No. HP / WhatsApp", f_alamat: "Alamat lengkap pengiriman", f_catatan: "Catatan (opsional)",
      pesan_wa: "Pesan via WhatsApp",
      foto: "Foto", foto_sebelum: "Foto sebelumnya", foto_berikut: "Foto berikutnya",
      wa_tanya: "Halo, saya mau tanya produk {nama} ({id})",
      wa_halo: "Halo {toko}, saya mau pesan:", wa_kurs: "kurs 1 USD = {kurs}, harga per {waktu}",
      wa_nama: "Nama", wa_hp: "HP", wa_alamat: "Alamat", wa_catatan: "Catatan", wa_penutup: "Mohon info ongkir & total pembayaran. Terima kasih.",
    },
    en: {
      semua: "All", cari: "Search products…", semua_supplier: "All suppliers", supplier_import: "Imported", supplier_lokal: "Local supplier",
      memuat: "Loading exchange rate…", gagal_muat: "Could not load the catalog. Please reload the page.",
      kurs_hari_ini: "Today's rate", diperbarui: "Prices updated",
      detail: "Details", keranjang_tambah: "+ Add to cart", stok_habis: "Out of stock",
      ready: "In stock", ready_detail: "In stock — ready to ship",
      indent: "Pre-order ±{hari} days", indent_detail: "Pre-order — approx. {hari} days after payment",
      label_import: "Import", label_lokal: "Local",
      beranda: "Home", kembali: "Back", tanya_wa: "Ask via WhatsApp", unduh: "Downloads", dokumen: "Document",
      deskripsi: "Description", spesifikasi: "Specifications",
      keranjang: "Cart", keranjang_kosong: "Your cart is empty.", total: "Total",
      f_nama: "Full name", f_hp: "Phone / WhatsApp", f_alamat: "Full shipping address", f_catatan: "Notes (optional)",
      pesan_wa: "Order via WhatsApp",
      foto: "Photo", foto_sebelum: "Previous photo", foto_berikut: "Next photo",
      wa_tanya: "Hello, I'd like to ask about {nama} ({id})",
      wa_halo: "Hello {toko}, I'd like to order:", wa_kurs: "rate 1 USD = {kurs}, prices as of {waktu}",
      wa_nama: "Name", wa_hp: "Phone", wa_alamat: "Address", wa_catatan: "Notes", wa_penutup: "Please let me know the shipping cost & total payment. Thank you.",
    },
  };
  // teks bawaan untuk isian Admin → Konten Halaman yang belum diisi
  const KONTEN_BAWAAN = {
    id: {
      judul_beranda: "Barang import original, harga mengikuti kurs hari ini", subjudul_beranda: "",
      keterangan_import: "Barang import · harga {mata_uang} mengikuti kurs hari ini (1 USD = {kurs})",
      keterangan_lokal: "Supplier lokal (Indonesia)", teks_kosong: "Belum ada produk di kategori ini.",
      teks_footer: "Harga dihitung otomatis dari harga supplier luar negeri dan kurs terbaru, sehingga dapat berubah sewaktu-waktu. Harga final mengikuti konfirmasi pesanan.",
      teks_tokopedia: "Kami juga ada di Tokopedia.",
    },
    en: {
      judul_beranda: "Original imported electronics, priced at today's exchange rate", subjudul_beranda: "",
      keterangan_import: "Imported · {mata_uang} price follows today's exchange rate (1 USD = {kurs})",
      keterangan_lokal: "Local supplier (Indonesia)", teks_kosong: "No products in this category yet.",
      teks_footer: "Prices are calculated automatically from overseas supplier prices and the latest exchange rate, so they may change at any time. Final price is confirmed when you order.",
      teks_tokopedia: "Also available on Tokopedia.",
    },
  };

  let bahasa = (() => {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "en" || q === "id") return q;
    try { return localStorage.getItem(KEY_BAHASA) === "en" ? "en" : "id"; } catch (e) { return "id"; }
  })();
  function t(kunci, isi) {
    let s = TEKS[bahasa][kunci] ?? TEKS.id[kunci] ?? kunci;
    for (const k in isi || {}) s = s.split("{" + k + "}").join(isi[k]);
    return s;
  }
  // teks konten: versi Inggris diisi di Admin (konten_en); kosong/undefined → bawaan bahasa itu
  function konten(kunci) {
    const toko = katalog.toko || {};
    const sumber = bahasa === "en" ? toko.konten_en || {} : toko.konten || {};
    if (sumber[kunci] !== undefined && sumber[kunci] !== null) return sumber[kunci];
    if (kunci === "info_kontak") return (toko.konten || {}).info_kontak || "";
    if (kunci === "tampilkan_kurs") return (toko.konten || {}).tampilkan_kurs;
    return KONTEN_BAWAAN[bahasa][kunci] ?? "";
  }
  const terjemah = (obj, kunci) => (bahasa === "en" && obj[kunci + "_en"]) || obj[kunci] || "";
  const namaProduk = (p) => terjemah(p, "nama");

  let katalog = { toko: {}, produk: [] };
  let keranjang = bacaKeranjang(); // { id: qty } — harga selalu diambil dari katalog terbaru

  function bacaKeranjang() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function simpanKeranjang() {
    try { localStorage.setItem(KEY, JSON.stringify(keranjang)); } catch (e) { /* abaikan */ }
  }
  function waktu(iso) {
    return new Date(iso).toLocaleString(bahasa === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeStyle: "short" });
  }
  const GAMBAR_KOSONG = "assets/logo-icon-512.png";
  const atributGambar = (src) => 'src="' + esc(src || GAMBAR_KOSONG) + '" onerror="this.onerror=null;this.src=\'' + GAMBAR_KOSONG + '\'"';
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function ikonFile(url) {
    const ext = (String(url).split("?")[0].split(".").pop() || "").toUpperCase();
    return ext.length <= 4 ? ext : "FILE";
  }

  async function muat() {
    terapkanBahasaStatis();
    try {
      const res = await fetch("data/katalog.json?t=" + Date.now(), { cache: "no-store" });
      katalog = await res.json();
    } catch (e) {
      $("kurs-box").textContent = t("gagal_muat");
      return;
    }
    for (const id of Object.keys(keranjang)) if (!cariProduk(id)) delete keranjang[id];
    simpanKeranjang();
    tampilkanSemua();
  }

  // teks di index.html yang ditandai data-i18n / data-i18n-ph
  function terapkanBahasaStatis() {
    document.documentElement.lang = bahasa;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll("[data-bahasa]").forEach((b) => b.classList.toggle("aktif", b.dataset.bahasa === bahasa));
  }

  function tampilkanSemua() {
    terapkanBahasaStatis();
    const tk = katalog.toko || {};
    if (tk.nama_toko) $("nama-toko").alt = tk.nama_toko;
    if (tk.info_pembayaran) $("info-bayar").textContent = terjemah(tk, "info_pembayaran");
    // teks yang bisa diubah dari Admin → Konten Halaman
    $("footer-teks").textContent = konten("teks_footer");
    $("footer-kontak").hidden = !konten("info_kontak");
    $("footer-kontak").textContent = konten("info_kontak");
    $("kosong").textContent = konten("teks_kosong");
    const teksToko = konten("teks_tokopedia");
    if (tk.tokopedia_url && teksToko) {
      const link = (isi) => '<a href="' + esc(tk.tokopedia_url) + '" target="_blank" rel="noopener">' + isi + "</a>";
      $("link-tokopedia").innerHTML = /Tokopedia/i.test(teksToko) ? esc(teksToko).replace(/Tokopedia/i, (m) => link(m)) : link(esc(teksToko));
    } else $("link-tokopedia").innerHTML = "";
    $("kurs-box").hidden = konten("tampilkan_kurs") === false;
    // gambar latar halaman depan dari Admin → Konten Halaman (kosong = gambar PCB bawaan)
    const hero = ((tk.konten || {}).gambar_hero || "").trim() || "assets/hero-pcb.svg?v=3";
    $("hero").style.setProperty("--gambar-hero", 'url("' + new URL(hero, location.href).href.replace(/"/g, "%22") + '")');

    // menu kategori dari config (fallback: menu bawaan di index.html)
    if (Array.isArray(tk.kategori) && tk.kategori.length) {
      $("menu").innerHTML = '<a href="#/" data-kat="">' + esc(t("semua")) + "</a>" + tk.kategori.map((k) =>
        '<a href="#/kategori/' + esc(k.slug) + '" data-kat="' + esc(k.slug) + '">' + esc(terjemah(k, "nama")) + "</a>").join("");
    }

    const k = katalog.kurs || {};
    $("kurs-box").innerHTML =
      "<span>" + esc(t("kurs_hari_ini")) + ": <strong>1 USD = " + rupiah(k.usd_idr || 0) + "</strong></span>" +
      "<span>" + esc(t("diperbarui")) + ": " + esc(waktu(katalog.diperbarui)) + "</span>";

    tampilkanKeranjang();
    rute();
  }

  function gantiBahasa(b) {
    if (b === bahasa) return;
    bahasa = b;
    try { localStorage.setItem(KEY_BAHASA, b); } catch (e) { /* abaikan */ }
    const url = new URL(location.href);
    if (url.searchParams.has("lang")) { url.searchParams.set("lang", b); history.replaceState(null, "", url); }
    tampilkanSemua();
  }

  function cariProduk(id) { return katalog.produk.find((p) => p.id === id); }
  function kategoriDari(slug) { return (katalog.toko.kategori || []).find((x) => x.slug === slug); }
  function namaKategoriProduk(p) {
    const k = kategoriDari(slugify(p.kategori));
    return k ? terjemah(k, "nama") : p.kategori;
  }

  // ---------------------------------------------------------- Routing
  function rute() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [jenis, nilai] = h.split("/");
    let aktif = "";
    clearInterval(timerSlide);
    if (jenis === "produk" && cariProduk(nilai)) {
      const p = cariProduk(nilai);
      aktif = slugify(p.kategori);
      tampilkanDetail(p);
      mulaiOtomatis();
    } else {
      aktif = jenis === "kategori" ? nilai : "";
      tampilkanDaftar(aktif);
    }
    document.querySelectorAll("#menu a").forEach((a) => a.classList.toggle("aktif", a.dataset.kat === aktif));
    const menuAktif = document.querySelector("#menu a.aktif");
    if (menuAktif) menuAktif.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  // Ingat posisi gulir daftar agar saat kembali dari detail, pengunjung berada di produk yang sama
  const posisiDaftar = {};
  let dariDaftar = false;
  const halProduk = (u) => /#\/?produk\//.test(u || "");
  window.addEventListener("hashchange", (e) => {
    const lama = (e.oldURL || "").split("#")[1] || "/", baru = location.hash.slice(1) || "/";
    if (!halProduk("#" + lama)) posisiDaftar[lama] = window.scrollY;
    dariDaftar = halProduk(location.hash) && !halProduk("#" + lama);
    rute();
    window.scrollTo(0, halProduk("#" + lama) && !halProduk(location.hash) ? posisiDaftar[baru] || 0 : 0);
  });
  function kembaliKeDaftar() {
    if (dariDaftar) return history.back();
    const p = cariProduk(decodeURIComponent(location.hash.split("/")[2] || ""));
    location.hash = p ? "#/kategori/" + slugify(p.kategori) : "#/";
  }

  // ------------------------------------------------------ Daftar produk
  let kategoriAktif = "";
  function tampilkanDaftar(slug) {
    kategoriAktif = slug || "";
    $("hal-daftar").hidden = false;
    $("hal-detail").hidden = true;
    document.body.classList.remove("di-detail");
    const kat = kategoriDari(kategoriAktif);
    $("judul-daftar").textContent = kat ? terjemah(kat, "judul") || terjemah(kat, "nama") : konten("judul_beranda");
    const sub = kat ? terjemah(kat, "deskripsi") : konten("subjudul_beranda");
    $("subjudul").hidden = !sub;
    $("subjudul").textContent = sub || "";
    document.title = (kat ? terjemah(kat, "nama") + " — " : "") + (katalog.toko.nama_toko || "ComdataSheet");
    renderGrid();
  }

  function renderGrid() {
    const q = $("cari").value.trim().toLowerCase(), jenis = $("filter-jenis").value;
    const list = katalog.produk.filter((p) =>
      (!kategoriAktif || slugify(p.kategori) === kategoriAktif) &&
      (!jenis || jenisSupplier(p) === jenis) &&
      (!q || [p.nama, p.nama_en, p.deskripsi, p.deskripsi_en, p.id].join(" ").toLowerCase().includes(q)));

    $("kosong").hidden = list.length > 0;
    $("daftar-produk").innerHTML = list.map((p) =>
      '<article class="card">' +
        '<a class="card-link" href="#/produk/' + encodeURIComponent(p.id) + '">' +
          slideshow([p.gambar].concat(p.galeri || []).filter(Boolean), namaProduk(p), { lazy: true }) +
          '<div class="card-body">' +
            '<div class="label-baris"><span class="kat">' + esc(namaKategoriProduk(p)) + "</span>" + labelJenis(p) + "</div>" +
            '<h3 title="' + esc(namaProduk(p)) + '">' + esc(namaProduk(p)) + "</h3>" +
            '<p class="desk">' + esc(terjemah(p, "deskripsi")) + "</p>" +
            '<div class="harga">' + rupiah(p.harga_idr) + tren(p) + "</div>" +
            labelKetersediaan(p) +
          "</div>" +
        "</a>" +
        '<div class="card-aksi">' +
          '<a class="btn btn-garis" href="#/produk/' + encodeURIComponent(p.id) + '">' + esc(t("detail")) + "</a>" +
          tombolBeli(p) +
        "</div>" +
      "</article>").join("");
  }

  // ------------------------------------------------------ Slideshow foto
  // {besar}: halaman detail (otomatis berganti), {thumb}: deretan foto kecil, {lazy}: kartu
  function slideshow(gambar, alt, o = {}) {
    if (gambar.length <= 1) {
      return "<img " + (o.lazy ? 'loading="lazy" ' : "") + (o.besar ? 'class="galeri-utama" ' : "") + atributGambar(gambar[0]) + ' alt="' + esc(alt) + '">';
    }
    const ke = (i) => ' data-ke="' + i + '"' + (i === 0 ? ' class="aktif"' : "") + ' aria-label="' + esc(t("foto")) + " " + (i + 1) + '"';
    return '<div class="slide' + (o.besar ? " besar" : "") + '" data-slide data-i="0"' + (o.besar ? " data-otomatis" : "") + ">" +
      '<div class="slide-bingkai"><div class="slide-track">' + gambar.map((g, i) =>
        "<img " + (o.lazy || i > 0 ? 'loading="lazy" ' : "") + (o.besar ? 'class="galeri-utama" ' : "") + atributGambar(g) + ' alt="' + esc(alt) + " – " + esc(t("foto")) + " " + (i + 1) + '">').join("") + "</div>" +
      '<button type="button" class="slide-nav kiri" data-geser="-1" aria-label="' + esc(t("foto_sebelum")) + '">‹</button>' +
      '<button type="button" class="slide-nav kanan" data-geser="1" aria-label="' + esc(t("foto_berikut")) + '">›</button>' +
      '<div class="slide-titik">' + gambar.map((g, i) => "<button type=\"button\"" + ke(i) + "></button>").join("") + "</div></div>" +
      (o.thumb ? '<div class="galeri-thumb">' + gambar.map((g, i) => '<button type="button"' + ke(i) + "><img " + atributGambar(g) + ' alt=""></button>').join("") + "</div>" : "") +
      "</div>";
  }
  function geserSlide(root, ke) {
    const n = root.querySelectorAll(".slide-track > img").length;
    const i = ((ke % n) + n) % n;
    root.dataset.i = i;
    root.querySelector(".slide-track").style.transform = "translateX(-" + i * 100 + "%)";
    root.querySelectorAll("[data-ke]").forEach((b) => b.classList.toggle("aktif", +b.dataset.ke === i));
  }
  let timerSlide = null;
  function mulaiOtomatis() {
    clearInterval(timerSlide);
    const root = document.querySelector("[data-slide][data-otomatis]");
    if (root) timerSlide = setInterval(() => { if (!root.matches(":hover") && !document.hidden) geserSlide(root, +root.dataset.i + 1); }, 4000);
  }
  // usap (swipe) di HP
  let sentuhX = null;
  document.addEventListener("touchstart", (e) => { sentuhX = e.target.closest("[data-slide]") ? e.touches[0].clientX : null; }, { passive: true });
  document.addEventListener("touchend", (e) => {
    const root = e.target.closest("[data-slide]");
    if (sentuhX === null || !root) return;
    const dx = e.changedTouches[0].clientX - sentuhX;
    if (Math.abs(dx) > 40) { geserSlide(root, +root.dataset.i + (dx < 0 ? 1 : -1)); clearInterval(timerSlide); }
    sentuhX = null;
  });

  function keteranganAsal(p) {
    const s = jenisSupplier(p) === "lokal" ? konten("keterangan_lokal") : konten("keterangan_import");
    return s.replace(/\{mata_uang\}/g, p.mata_uang_sumber || "USD").replace(/\{kurs\}/g, rupiah((katalog.kurs || {}).usd_idr || 0));
  }

  function jenisSupplier(p) { return p.jenis_supplier === "lokal" ? "lokal" : "import"; }
  function labelJenis(p) {
    const j = jenisSupplier(p);
    return '<span class="jenis ' + j + '">' + esc(t(j === "lokal" ? "label_lokal" : "label_import")) + "</span>";
  }
  function ketersediaan(p) { return p.ketersediaan || (p.stok === false ? "habis" : "ready"); }
  function teksKetersediaan(p, lengkap) {
    const k = ketersediaan(p);
    if (k === "habis") return t("stok_habis");
    if (k === "indent") return t(lengkap ? "indent_detail" : "indent", { hari: p.lama_indent_hari || 14 });
    return t(lengkap ? "ready_detail" : "ready");
  }
  function labelKetersediaan(p) {
    return '<p class="ketersediaan ' + ketersediaan(p) + '">' + esc(teksKetersediaan(p)) + "</p>";
  }

  function tren(p) {
    if (!p.harga_sebelumnya || p.harga_sebelumnya === p.harga_idr) return "";
    const turun = p.harga_idr < p.harga_sebelumnya;
    const pct = Math.abs((p.harga_idr - p.harga_sebelumnya) / p.harga_sebelumnya * 100).toFixed(1);
    return '<span class="tren ' + (turun ? "turun" : "naik") + '">' + (turun ? "▼" : "▲") + " " + pct + "%</span>";
  }
  function tombolBeli(p) {
    return '<button class="btn" data-tambah="' + esc(p.id) + '"' +
      (ketersediaan(p) === "habis" ? " disabled>" + esc(t("stok_habis")) : ">" + esc(t("keranjang_tambah"))) + "</button>";
  }

  // ------------------------------------------------------ Detail produk
  function tampilkanDetail(p) {
    $("hal-daftar").hidden = true;
    const el = $("hal-detail");
    el.hidden = false;
    document.body.classList.add("di-detail");
    const nama = namaProduk(p), desk = terjemah(p, "deskripsi");
    document.title = nama + " — " + (katalog.toko.nama_toko || "ComdataSheet");

    const gambar = [p.gambar].concat(p.galeri || []).filter(Boolean);
    const spekObj = (bahasa === "en" && p.spesifikasi_en && Object.keys(p.spesifikasi_en).length) ? p.spesifikasi_en : p.spesifikasi;
    const spek = spekObj && typeof spekObj === "object" ? Object.entries(spekObj) : [];
    const unduhan = (p.unduhan || []).filter((u) => u && u.url);
    const slug = slugify(p.kategori);

    el.innerHTML =
      '<nav class="remah"><button type="button" class="btn-kembali" data-kembali>‹ ' + esc(t("kembali")) + '</button><a href="#/">' + esc(t("beranda")) + '</a> › <a href="#/kategori/' + esc(slug) + '">' + esc(namaKategoriProduk(p)) + "</a> › <span>" + esc(nama) + "</span></nav>" +
      '<div class="detail-grid">' +
        '<div class="galeri">' + slideshow(gambar, nama, { besar: true, thumb: true }) + "</div>" +
        '<div class="info">' +
          '<div class="label-baris"><span class="kat">' + esc(namaKategoriProduk(p)) + " · " + esc(p.id) + "</span>" + labelJenis(p) + "</div>" +
          "<h1>" + esc(nama) + "</h1>" +
          '<div class="harga besar">' + rupiah(p.harga_idr) + tren(p) + "</div>" +
          '<p class="asal">' + esc(keteranganAsal(p)) + "</p>" +
          '<p class="stok ' + ketersediaan(p) + '">' + esc(teksKetersediaan(p, true)) + "</p>" +
          '<div class="aksi">' + tombolBeli(p) +
            '<a class="btn btn-wa-kecil" target="_blank" rel="noopener" href="https://wa.me/' + esc(katalog.toko.whatsapp) +
              "?text=" + encodeURIComponent(t("wa_tanya", { nama: nama, id: p.id })) + '">' + esc(t("tanya_wa")) + "</a>" +
          "</div>" +
          (unduhan.length ? '<div class="unduhan"><h2>' + esc(t("unduh")) + "</h2>" + unduhan.map((u) =>
            '<a class="file" href="' + esc(u.url) + '" target="_blank" rel="noopener" download>' +
              '<span class="file-ikon">' + esc(ikonFile(u.url)) + "</span><span>" + esc(terjemah(u, "judul") || t("dokumen")) + "</span>" +
              '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-5-5m5 5l5-5M4 21h16"/></svg></a>').join("") + "</div>" : "") +
        "</div>" +
      "</div>" +
      (desk ? '<section class="blok"><h2>' + esc(t("deskripsi")) + '</h2><p class="deskripsi-lengkap">' + esc(desk).replace(/\n/g, "<br>") + "</p></section>" : "") +
      (spek.length ? '<section class="blok"><h2>' + esc(t("spesifikasi")) + '</h2><table class="spek">' + spek.map(([k, v]) =>
        "<tr><th>" + esc(k) + "</th><td>" + esc(v) + "</td></tr>").join("") + "</table></section>" : "");
  }

  // ---------------------------------------------------------- Keranjang
  function tampilkanKeranjang() {
    const ids = Object.keys(keranjang);
    let total = 0, jumlah = 0;
    $("isi-keranjang").innerHTML = ids.length ? ids.map((id) => {
      const p = cariProduk(id), q = keranjang[id];
      total += p.harga_idr * q; jumlah += q;
      return '<div class="item"><div><strong>' + esc(namaProduk(p)) + '</strong><div class="sub">' + rupiah(p.harga_idr) + " × " + q +
        (ketersediaan(p) === "indent" ? ' · <span class="ketersediaan indent">' + esc(teksKetersediaan(p)) + "</span>" : "") + "</div></div>" +
        '<div class="qty"><button data-kurang="' + esc(id) + '">−</button><span>' + q + '</span><button data-tambah="' + esc(id) + '">+</button></div></div>';
    }).join("") : '<p class="kosong">' + esc(t("keranjang_kosong")) + "</p>";
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
    const pilihBahasa = e.target.closest("[data-bahasa]");
    if (pilihBahasa) return gantiBahasa(pilihBahasa.dataset.bahasa);
    // Halaman detail: klik tombol Kembali atau di latar belakang (di luar kotak produk) = kembali ke daftar
    if (!$("hal-detail").hidden && document.contains(e.target) &&
        (e.target.closest("[data-kembali]") || !e.target.closest(".detail-grid, .blok, .remah, .topbar, .footer, .drawer, #overlay"))) {
      return kembaliKeDaftar();
    }
    const geser = e.target.closest("[data-geser]"), keFoto = e.target.closest("[data-ke]");
    if (geser || keFoto) {
      e.preventDefault(); // tombol slideshow di dalam link kartu: jangan buka detail
      const root = (geser || keFoto).closest("[data-slide]");
      geserSlide(root, geser ? +root.dataset.i + +geser.dataset.geser : +keFoto.dataset.ke);
      if (root.hasAttribute("data-otomatis")) clearInterval(timerSlide); // berhenti otomatis setelah dipilih sendiri
      return;
    }
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
  $("cari").oninput = renderGrid;
  $("filter-jenis").onchange = renderGrid;

  $("form-checkout").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    let total = 0;
    const baris = Object.entries(keranjang).map(([id, q], i) => {
      const p = cariProduk(id); total += p.harga_idr * q;
      return (i + 1) + ". " + namaProduk(p) + " (" + p.id + ")" + (ketersediaan(p) === "indent" ? " — " + teksKetersediaan(p) : "") +
        "\n   " + q + " × " + rupiah(p.harga_idr) + " = " + rupiah(p.harga_idr * q);
    });
    const pesan =
      t("wa_halo", { toko: katalog.toko.nama_toko || "" }) + "\n\n" + baris.join("\n") +
      "\n\n*" + t("total") + ": " + rupiah(total) + "*\n(" + t("wa_kurs", { kurs: rupiah(katalog.kurs.usd_idr), waktu: waktu(katalog.diperbarui) }) + ")" +
      "\n\n" + t("wa_nama") + ": " + f.get("nama") + "\n" + t("wa_hp") + ": " + f.get("hp") + "\n" + t("wa_alamat") + ": " + f.get("alamat") +
      (f.get("catatan") ? "\n" + t("wa_catatan") + ": " + f.get("catatan") : "") +
      "\n\n" + t("wa_penutup");
    window.open("https://wa.me/" + katalog.toko.whatsapp + "?text=" + encodeURIComponent(pesan), "_blank");
  };

  muat();
})();

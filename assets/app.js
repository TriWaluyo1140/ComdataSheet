// ComdataSheet — toko statis. Data harga dibaca dari data/katalog.json
// yang diperbarui otomatis oleh GitHub Actions (scripts/update_prices.py).
(function () {
  const $ = (id) => document.getElementById(id);
  const rupiah = (n) => "Rp " + Math.round(n).toLocaleString("id-ID");
  const KEY = "cds-keranjang";
  const slugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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
  function ikonFile(url) {
    const ext = (String(url).split("?")[0].split(".").pop() || "").toUpperCase();
    return ext.length <= 4 ? ext : "FILE";
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
    if (t.nama_toko) $("nama-toko").alt = t.nama_toko;
    if (t.info_pembayaran) $("info-bayar").textContent = t.info_pembayaran;
    if (t.tokopedia_url) $("link-tokopedia").innerHTML = 'Kami juga ada di <a href="' + esc(t.tokopedia_url) + '" target="_blank" rel="noopener">Tokopedia</a>.';

    // menu kategori dari config (fallback: menu bawaan di index.html)
    if (Array.isArray(t.kategori) && t.kategori.length) {
      $("menu").innerHTML = '<a href="#/" data-kat="">Semua</a>' + t.kategori.map((k) =>
        '<a href="#/kategori/' + esc(k.slug) + '" data-kat="' + esc(k.slug) + '">' + esc(k.nama) + "</a>").join("");
    }

    const k = katalog.kurs || {};
    $("kurs-box").innerHTML =
      '<span>Kurs hari ini: <strong>1 USD = ' + rupiah(k.usd_idr || 0) + "</strong></span>" +
      "<span>Harga diperbarui: " + esc(waktu(katalog.diperbarui)) + "</span>";

    for (const id of Object.keys(keranjang)) if (!cariProduk(id)) delete keranjang[id];
    simpanKeranjang();
    tampilkanKeranjang();
    rute();
  }

  function cariProduk(id) { return katalog.produk.find((p) => p.id === id); }
  function namaKategori(slug) {
    const k = (katalog.toko.kategori || []).find((x) => x.slug === slug);
    return k ? k.nama : null;
  }

  // ---------------------------------------------------------- Routing
  function rute() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [jenis, nilai] = h.split("/");
    let aktif = "";
    if (jenis === "produk" && cariProduk(nilai)) {
      const p = cariProduk(nilai);
      aktif = slugify(p.kategori);
      tampilkanDetail(p);
    } else {
      aktif = jenis === "kategori" ? nilai : "";
      tampilkanDaftar(aktif);
    }
    document.querySelectorAll("#menu a").forEach((a) => a.classList.toggle("aktif", a.dataset.kat === aktif));
    const menuAktif = document.querySelector("#menu a.aktif");
    if (menuAktif) menuAktif.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  window.addEventListener("hashchange", () => { rute(); window.scrollTo(0, 0); });

  // ------------------------------------------------------ Daftar produk
  let kategoriAktif = "";
  function tampilkanDaftar(slug) {
    kategoriAktif = slug || "";
    $("hal-daftar").hidden = false;
    $("hal-detail").hidden = true;
    const nama = namaKategori(kategoriAktif);
    $("judul-daftar").textContent = nama || katalog.toko.slogan || "Barang import original";
    document.title = (nama ? nama + " — " : "") + (katalog.toko.nama_toko || "ComdataSheet");
    renderGrid();
  }

  function renderGrid() {
    const q = $("cari").value.trim().toLowerCase();
    const list = katalog.produk.filter((p) =>
      (!kategoriAktif || slugify(p.kategori) === kategoriAktif) &&
      (!q || (p.nama + " " + (p.deskripsi || "") + " " + p.id).toLowerCase().includes(q)));

    $("kosong").hidden = list.length > 0;
    $("daftar-produk").innerHTML = list.map((p) =>
      '<article class="card">' +
        '<a class="card-link" href="#/produk/' + encodeURIComponent(p.id) + '">' +
          '<img loading="lazy" src="' + esc(p.gambar) + '" alt="' + esc(p.nama) + '">' +
          '<div class="card-body">' +
            '<span class="kat">' + esc(p.kategori) + "</span>" +
            "<h3>" + esc(p.nama) + "</h3>" +
            '<p class="desk">' + esc(p.deskripsi) + "</p>" +
            '<div class="harga">' + rupiah(p.harga_idr) + tren(p) + "</div>" +
          "</div>" +
        "</a>" +
        '<div class="card-aksi">' +
          '<a class="btn btn-garis" href="#/produk/' + encodeURIComponent(p.id) + '">Detail</a>' +
          tombolBeli(p) +
        "</div>" +
      "</article>").join("");
  }

  function tren(p) {
    if (!p.harga_sebelumnya || p.harga_sebelumnya === p.harga_idr) return "";
    const turun = p.harga_idr < p.harga_sebelumnya;
    const pct = Math.abs((p.harga_idr - p.harga_sebelumnya) / p.harga_sebelumnya * 100).toFixed(1);
    return '<span class="tren ' + (turun ? "turun" : "naik") + '">' + (turun ? "▼" : "▲") + " " + pct + "%</span>";
  }
  function tombolBeli(p) {
    return '<button class="btn" data-tambah="' + esc(p.id) + '"' + (p.stok === false ? " disabled>Stok habis" : ">+ Keranjang") + "</button>";
  }

  // ------------------------------------------------------ Detail produk
  function tampilkanDetail(p) {
    $("hal-daftar").hidden = true;
    const el = $("hal-detail");
    el.hidden = false;
    document.title = p.nama + " — " + (katalog.toko.nama_toko || "ComdataSheet");

    const gambar = [p.gambar].concat(p.galeri || []).filter(Boolean);
    const spek = p.spesifikasi && typeof p.spesifikasi === "object" ? Object.entries(p.spesifikasi) : [];
    const unduhan = (p.unduhan || []).filter((u) => u && u.url);
    const slug = slugify(p.kategori);

    el.innerHTML =
      '<nav class="remah"><a href="#/">Beranda</a> › <a href="#/kategori/' + esc(slug) + '">' + esc(p.kategori) + "</a> › <span>" + esc(p.nama) + "</span></nav>" +
      '<div class="detail-grid">' +
        '<div class="galeri">' +
          '<img class="galeri-utama" id="galeri-utama" src="' + esc(gambar[0] || "") + '" alt="' + esc(p.nama) + '">' +
          (gambar.length > 1 ? '<div class="galeri-thumb">' + gambar.map((g, i) =>
            '<button data-gambar="' + esc(g) + '"' + (i === 0 ? ' class="aktif"' : "") + '><img src="' + esc(g) + '" alt=""></button>').join("") + "</div>" : "") +
        "</div>" +
        '<div class="info">' +
          '<span class="kat">' + esc(p.kategori) + " · " + esc(p.id) + "</span>" +
          "<h1>" + esc(p.nama) + "</h1>" +
          '<div class="harga besar">' + rupiah(p.harga_idr) + tren(p) + "</div>" +
          '<p class="asal">Barang import · harga ' + esc(p.mata_uang_sumber) + " mengikuti kurs hari ini (1 USD = " + rupiah(katalog.kurs.usd_idr) + ")</p>" +
          '<p class="stok ' + (p.stok === false ? "habis" : "ada") + '">' + (p.stok === false ? "Stok habis" : "Stok tersedia") + "</p>" +
          '<div class="aksi">' + tombolBeli(p) +
            '<a class="btn btn-wa-kecil" target="_blank" rel="noopener" href="https://wa.me/' + esc(katalog.toko.whatsapp) +
              "?text=" + encodeURIComponent("Halo, saya mau tanya produk " + p.nama + " (" + p.id + ")") + '">Tanya via WhatsApp</a>' +
          "</div>" +
          (unduhan.length ? '<div class="unduhan"><h2>Unduh dokumen</h2>' + unduhan.map((u) =>
            '<a class="file" href="' + esc(u.url) + '" target="_blank" rel="noopener" download>' +
              '<span class="file-ikon">' + esc(ikonFile(u.url)) + "</span><span>" + esc(u.judul || "Dokumen") + "</span>" +
              '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-5-5m5 5l5-5M4 21h16"/></svg></a>').join("") + "</div>" : "") +
        "</div>" +
      "</div>" +
      '<section class="blok"><h2>Deskripsi</h2><p class="deskripsi-lengkap">' + esc(p.deskripsi).replace(/\n/g, "<br>") + "</p></section>" +
      (spek.length ? '<section class="blok"><h2>Spesifikasi</h2><table class="spek">' + spek.map(([k, v]) =>
        "<tr><th>" + esc(k) + "</th><td>" + esc(v) + "</td></tr>").join("") + "</table></section>" : "");
  }

  // ---------------------------------------------------------- Keranjang
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
    const thumb = e.target.closest("[data-gambar]");
    if (thumb) {
      $("galeri-utama").src = thumb.dataset.gambar;
      document.querySelectorAll(".galeri-thumb button").forEach((b) => b.classList.toggle("aktif", b === thumb));
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

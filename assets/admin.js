// Admin ComdataSheet — mengubah data toko langsung di repo GitHub lewat GitHub API.
// Token GitHub disimpan terenkripsi (AES-GCM, kunci dari PIN via PBKDF2) di localStorage.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rupiah = (n) => (n || n === 0) ? "Rp " + Math.round(n).toLocaleString("id-ID") : "–";
  const SIMPAN_KEY = "cds-admin-kunci";
  const SESI_KEY = "cds-admin-sesi";

  let repo = { owner: "", repo: "", branch: "main" };
  let token = "";
  let produk = [], produkSha = null;
  let config = {}, configSha = null;
  let katalog = { produk: [] };

  // ------------------------------------------------------------ Util
  function status(pesan, jenis) {
    const el = $("status");
    el.hidden = !pesan;
    el.className = "status" + (jenis ? " " + jenis : "");
    el.innerHTML = pesan || "";
    if (pesan) el.scrollIntoView({ block: "nearest" });
  }
  const linkActions = () => 'https://github.com/' + repo.owner + "/" + repo.repo + "/actions";
  const pesanTerbit = (apa) => "✓ " + apa + " tersimpan. Website diperbarui otomatis dalam ±1–2 menit " +
    '(<a href="' + linkActions() + '" target="_blank" rel="noopener">lihat proses</a>).';

  function b64dariTeks(teks) {
    const bytes = new TextEncoder().encode(teks);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function teksDariB64(b64) {
    const bin = atob(b64.replace(/\n/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }
  const bufKeB64 = (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  const b64KeBuf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  function urlTampil(u) {
    if (!u) return "";
    if (/^https?:|^data:/.test(u)) return u;
    return "https://raw.githubusercontent.com/" + repo.owner + "/" + repo.repo + "/" + repo.branch + "/" + u.replace(/^\.?\//, "");
  }
  function namaAman(nama) {
    const titik = nama.lastIndexOf(".");
    const dasar = (titik > 0 ? nama.slice(0, titik) : nama).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "file";
    const ext = titik > 0 ? nama.slice(titik).toLowerCase().replace(/[^.a-z0-9]/g, "") : "";
    return dasar + ext;
  }
  function angka(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return v;
    let s = String(v).trim().replace(/[^\d.,-]/g, "");
    if (!s) return null;
    if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(".") > s.lastIndexOf(",") ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
    else if (s.includes(",")) s = s.replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  // ------------------------------------------------------- GitHub API
  async function gh(path, opsi = {}) {
    const res = await fetch("https://api.github.com/repos/" + repo.owner + "/" + repo.repo + path, {
      ...opsi,
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opsi.headers || {}) },
    });
    if (!res.ok) {
      let msg = res.status + "";
      try { msg += " " + (await res.json()).message; } catch (e) { /* abaikan */ }
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return res.status === 204 ? null : res.json();
  }
  async function ambilFile(path) {
    const d = await gh("/contents/" + path + "?ref=" + repo.branch + "&t=" + Date.now());
    return { sha: d.sha, teks: teksDariB64(d.content) };
  }
  async function shaFile(path) {
    try { return (await gh("/contents/" + path + "?ref=" + repo.branch)).sha; } catch (e) { if (e.status === 404) return null; throw e; }
  }
  async function tulisFile(path, b64, pesan, sha) {
    const body = { message: pesan, content: b64, branch: repo.branch };
    if (sha) body.sha = sha;
    const d = await gh("/contents/" + path, { method: "PUT", body: JSON.stringify(body) });
    return d.content.sha;
  }
  async function simpanProdukKeGitHub(pesan) {
    try {
      produkSha = await tulisFile("data/products.json", b64dariTeks(JSON.stringify(produk, null, 2) + "\n"), pesan, produkSha);
    } catch (e) {
      if (e.status === 409 || e.status === 422) {
        await muatData();
        throw new Error("Data produk baru saja berubah di tempat lain. Data sudah dimuat ulang, silakan ulangi perubahan Anda.");
      }
      throw e;
    }
  }
  // Simpan beberapa file dalam SATU commit (Git Data API), supaya workflow hanya jalan sekali.
  async function simpanSekaligus(files, pesan) {
    if ((await shaFile("data/products.json")) !== produkSha || (await shaFile("data/config.json")) !== configSha) {
      await muatData();
      throw new Error("Data baru saja berubah di tempat lain. Data sudah dimuat ulang, silakan unggah Excel lagi.");
    }
    for (let coba = 0; ; coba++) {
      const induk = (await gh("/git/ref/heads/" + repo.branch)).object.sha;
      const pohonInduk = (await gh("/git/commits/" + induk)).tree.sha;
      const pohon = await gh("/git/trees", { method: "POST", body: JSON.stringify({
        base_tree: pohonInduk, tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.teks })) }) });
      const commit = await gh("/git/commits", { method: "POST", body: JSON.stringify({ message: pesan, tree: pohon.sha, parents: [induk] }) });
      try {
        await gh("/git/refs/heads/" + repo.branch, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
        break;
      } catch (e) {
        // proses update harga otomatis baru saja menyimpan katalog — ulangi dari commit terbaru
        if (e.status !== 422 || coba >= 2) throw e;
      }
    }
    [produkSha, configSha] = await Promise.all([shaFile("data/products.json"), shaFile("data/config.json")]);
  }

  async function simpanConfigKeGitHub(pesan) {
    configSha = await tulisFile("data/config.json", b64dariTeks(JSON.stringify(config, null, 2) + "\n"), pesan, configSha);
  }

  // ------------------------------------------------------- Kunci / login
  async function kunciDariPin(pin, salt) {
    const dasar = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, dasar,
      { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function enkripsiToken(tok, pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await kunciDariPin(pin, salt), new TextEncoder().encode(tok));
    return { salt: bufKeB64(salt), iv: bufKeB64(iv), ct: bufKeB64(ct), repo: repo.owner + "/" + repo.repo };
  }
  async function dekripsiToken(data, pin) {
    const kunci = await kunciDariPin(pin, b64KeBuf(data.salt));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64KeBuf(data.iv) }, kunci, b64KeBuf(data.ct));
    return new TextDecoder().decode(pt);
  }
  function bacaSimpanan() { try { return JSON.parse(localStorage.getItem(SIMPAN_KEY)); } catch (e) { return null; } }

  async function cekToken(tok) {
    token = tok;
    const d = await gh("");
    if (!d.permissions || !d.permissions.push) throw new Error("Token tidak punya izin menulis (Contents: Read and write) ke repo " + repo.repo + ".");
    repo.branch = repo.branch || d.default_branch;
  }

  function errorKunci(pesan) { $("error-kunci").hidden = !pesan; $("error-kunci").textContent = pesan || ""; }
  function tampilKunci() {
    $("layar-kunci").hidden = false; $("panel").hidden = true; $("akun").hidden = true;
    const ada = !!bacaSimpanan();
    $("form-login").hidden = !ada; $("form-setup").hidden = ada;
    errorKunci("");
    (ada ? $("pin-login") : $("token-baru")).focus();
  }

  let gagal = 0;
  $("form-login").onsubmit = async (e) => {
    e.preventDefault();
    const tombol = e.target.querySelector("button[type=submit]");
    tombol.disabled = true; errorKunci("");
    try {
      if (gagal >= 3) await new Promise((r) => setTimeout(r, Math.min(30, 2 ** (gagal - 2)) * 1000));
      let tok;
      try { tok = await dekripsiToken(bacaSimpanan(), $("pin-login").value); }
      catch (err) { gagal++; throw new Error("PIN salah."); }
      gagal = 0;
      try { await cekToken(tok); }
      catch (err) { throw new Error("Token tidak bisa dipakai (" + err.message + "). Mungkin sudah kedaluwarsa — klik 'Lupa PIN / ganti token'."); }
      sessionStorage.setItem(SESI_KEY, tok);
      await masukPanel();
    } catch (err) { errorKunci(err.message); }
    finally { tombol.disabled = false; $("pin-login").value = ""; }
  };

  $("form-setup").onsubmit = async (e) => {
    e.preventDefault();
    const tombol = e.target.querySelector("button[type=submit]");
    errorKunci("");
    const tok = $("token-baru").value.trim(), pin = $("pin-baru").value;
    if (pin !== $("pin-ulang").value) return errorKunci("PIN tidak sama.");
    tombol.disabled = true;
    try {
      try { await cekToken(tok); }
      catch (err) { throw new Error(err.status === 401 ? "Token salah atau kedaluwarsa." : err.status === 404 ? "Token tidak punya akses ke repo " + repo.owner + "/" + repo.repo + "." : err.message); }
      localStorage.setItem(SIMPAN_KEY, JSON.stringify(await enkripsiToken(tok, pin)));
      sessionStorage.setItem(SESI_KEY, tok);
      e.target.reset();
      await masukPanel();
    } catch (err) { errorKunci(err.message); }
    finally { tombol.disabled = false; }
  };

  $("lupa").onclick = () => {
    if (!confirm("Hapus token tersimpan di perangkat ini? Anda perlu memasukkan token GitHub lagi dan membuat PIN baru.")) return;
    localStorage.removeItem(SIMPAN_KEY); sessionStorage.removeItem(SESI_KEY);
    tampilKunci();
  };
  $("keluar").onclick = () => { sessionStorage.removeItem(SESI_KEY); token = ""; tampilKunci(); };

  // ----------------------------------------------------------- Panel
  async function muatData() {
    const [p, c, k] = await Promise.all([ambilFile("data/products.json"), ambilFile("data/config.json"), ambilFile("data/katalog.json").catch(() => null)]);
    produk = JSON.parse(p.teks); produkSha = p.sha;
    config = JSON.parse(c.teks); configSha = c.sha;
    katalog = k ? JSON.parse(k.teks) : { produk: [] };
    config.kategori = config.kategori || [];
    isiFilterKategori();
    renderTabel();
    renderFormToko();
  }

  async function masukPanel() {
    $("layar-kunci").hidden = true; $("panel").hidden = false; $("akun").hidden = false;
    status("Memuat data dari GitHub…", "proses");
    try { await muatData(); status(""); }
    catch (err) { status("Gagal memuat data: " + esc(err.message), "error"); }
  }

  document.querySelectorAll(".tab button").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".tab button").forEach((x) => x.classList.toggle("aktif", x === b));
    document.querySelectorAll("[data-isi]").forEach((s) => s.hidden = s.dataset.isi !== b.dataset.tab);
    status("");
  });

  // ------------------------------------------------------- Tab produk
  const daftarKategori = () => config.kategori.map((k) => k.nama);
  function isiFilterKategori() {
    const lain = [...new Set(produk.map((p) => p.kategori).filter((k) => k && !daftarKategori().includes(k)))];
    $("filter-kategori").innerHTML = '<option value="">Semua kategori</option>' +
      daftarKategori().concat(lain).map((k) => '<option>' + esc(k) + "</option>").join("");
  }
  const hargaJual = (id) => (katalog.produk.find((x) => x.id === id) || {}).harga_idr;

  function renderTabel() {
    const kat = $("filter-kategori").value, q = $("cari-admin").value.trim().toLowerCase();
    const list = produk.filter((p) => (!kat || p.kategori === kat) && (!q || (p.id + " " + p.nama).toLowerCase().includes(q)));
    $("tabel-produk").querySelector("tbody").innerHTML = list.length ? list.map((p) => {
      const s = p.sumber || {};
      return "<tr>" +
        '<td><img src="' + esc(urlTampil(p.gambar)) + '" alt="" loading="lazy"></td>' +
        "<td>" + esc(p.id) + "</td><td>" + esc(p.nama) + "</td><td>" + esc(p.kategori) + "</td>" +
        '<td class="angka">' + esc(s.mata_uang || "USD") + " " + (s.harga_manual ?? "–") + "</td>" +
        '<td class="angka">' + rupiah(hargaJual(p.id)) + "</td>" +
        '<td><span class="lencana ' + (p.stok === false ? "tidak" : "ya") + '">' + (p.stok === false ? "Habis" : "Ada") + "</span></td>" +
        '<td class="aksi-baris"><button class="btn kecil" data-edit="' + esc(p.id) + '">Edit</button>' +
        '<button class="btn kecil bahaya" data-hapus="' + esc(p.id) + '">Hapus</button></td></tr>';
    }).join("") : '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">Belum ada produk.</td></tr>';
  }
  $("filter-kategori").onchange = renderTabel;
  $("cari-admin").oninput = renderTabel;

  $("tabel-produk").onclick = async (e) => {
    const edit = e.target.closest("[data-edit]"), hapus = e.target.closest("[data-hapus]");
    if (edit) bukaEditor(produk.find((p) => p.id === edit.dataset.edit));
    if (hapus) {
      const p = produk.find((x) => x.id === hapus.dataset.hapus);
      if (!confirm("Hapus produk \"" + p.nama + "\" dari toko?")) return;
      const cadangan = produk.slice();
      produk = produk.filter((x) => x !== p);
      status("Menghapus produk…", "proses");
      try { await simpanProdukKeGitHub("Hapus produk " + p.id); renderTabel(); status(pesanTerbit("Penghapusan " + esc(p.nama))); }
      catch (err) { produk = cadangan; renderTabel(); status("Gagal menghapus: " + esc(err.message), "error"); }
    }
  };

  function idBaru() {
    const n = produk.map((p) => parseInt(String(p.id).replace(/\D/g, ""), 10)).filter((x) => !isNaN(x));
    return "CDS-" + String((n.length ? Math.max(...n) : 100) + 1).padStart(3, "0");
  }

  // ------------------------------------------------------ Editor produk
  let draf = null, idAsli = null;
  function bukaEditor(p) {
    idAsli = p ? p.id : null;
    draf = JSON.parse(JSON.stringify(p || {
      id: idBaru(), nama: "", kategori: daftarKategori()[0] || "", gambar: "", galeri: [], deskripsi: "", spesifikasi: {},
      unduhan: [], berat_kg: 0.1, stok: true, sumber: { nama_toko: "", url: "", mata_uang: "USD", harga_manual: null },
    }));
    draf.sumber = draf.sumber || {}; draf.galeri = draf.galeri || []; draf.unduhan = draf.unduhan || [];
    $("judul-editor").textContent = p ? "Edit produk " + p.id : "Tambah produk";
    renderEditor();
    $("editor").hidden = false; $("overlay-editor").hidden = false;
  }
  function tutupEditor() { $("editor").hidden = true; $("overlay-editor").hidden = true; draf = null; }
  $("tutup-editor").onclick = tutupEditor;
  $("overlay-editor").onclick = () => { if (confirm("Tutup tanpa menyimpan?")) tutupEditor(); };

  function renderEditor() {
    const d = draf, s = d.sumber;
    const kat = daftarKategori().includes(d.kategori) || !d.kategori ? daftarKategori() : daftarKategori().concat(d.kategori);
    const spek = Object.entries(d.spesifikasi || {}).map(([k, v]) => k + ": " + v).join("\n");
    const mu = ["USD", "CNY", "EUR", "SGD", "HKD", "JPY", "GBP", "MYR", "TWD", "KRW", "AUD"];
    const foto = [d.gambar].concat(d.galeri).filter(Boolean);
    $("form-produk").innerHTML =
      '<label>ID produk<input name="id" required value="' + esc(d.id) + '"></label>' +
      '<label>Kategori<select name="kategori">' + kat.map((k) => "<option" + (k === d.kategori ? " selected" : "") + ">" + esc(k) + "</option>").join("") + "</select></label>" +
      '<label class="penuh-lebar">Nama produk<input name="nama" required value="' + esc(d.nama) + '"></label>' +
      '<label class="penuh-lebar">Deskripsi<textarea name="deskripsi" rows="4">' + esc(d.deskripsi) + "</textarea></label>" +
      '<label class="penuh-lebar">Spesifikasi <small>satu per baris, format <code>Nama: Nilai</code> (contoh: <code>Tegangan: 5 V</code>)</small><textarea name="spesifikasi" rows="5">' + esc(spek) + "</textarea></label>" +

      "<h3>Harga &amp; supplier</h3>" +
      '<label>Mata uang<select name="mata_uang">' + mu.map((m) => "<option" + (m === (s.mata_uang || "USD") ? " selected" : "") + ">" + m + "</option>").join("") + "</select></label>" +
      '<label>Harga supplier per unit<input name="harga_manual" inputmode="decimal" required value="' + esc(s.harga_manual ?? "") + '"></label>' +
      '<label>Berat per unit (gram)<input name="berat_g" inputmode="numeric" value="' + esc(Math.round((d.berat_kg || 0) * 1000)) + '"></label>' +
      '<label>Margin khusus (%) <small>kosong = margin kategori/default</small><input name="margin_persen" inputmode="decimal" value="' + esc(d.margin_persen ?? "") + '"></label>' +
      '<label>Nama supplier<input name="nama_toko" value="' + esc(s.nama_toko) + '"></label>' +
      '<label>Link produk supplier<input name="url" value="' + esc(s.url) + '"></label>' +
      '<label class="cek penuh-lebar"><input type="checkbox" name="stok"' + (d.stok === false ? "" : " checked") + "> Stok tersedia</label>" +

      "<h3>Foto produk</h3>" +
      '<div class="media-list">' + (foto.length ? foto.map((g, i) =>
        '<div class="media-item"><img src="' + esc(urlTampil(g)) + '" alt="">' +
        '<input data-foto="' + i + '" value="' + esc(g) + '">' + (i === 0 ? '<span class="utama">Foto utama</span>' : "") +
        '<button type="button" class="hapus" data-hapus-foto="' + i + '" title="Hapus">&times;</button></div>').join("") : '<p class="muted">Belum ada foto.</p>') + "</div>" +
      '<div class="penuh-lebar" style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<label class="btn btn-garis kecil unggah">Unggah foto<input type="file" id="unggah-foto" accept="image/*" multiple></label>' +
        '<button type="button" class="btn btn-garis kecil" id="tambah-link-foto">+ Pakai link foto</button></div>' +

      "<h3>Dokumen unduhan (brosur, datasheet, manual)</h3>" +
      '<div class="media-list">' + (d.unduhan.length ? d.unduhan.map((u, i) =>
        '<div class="media-item"><span class="file-ikon">' + esc((u.url.split(".").pop() || "FILE").slice(0, 4).toUpperCase()) + "</span>" +
        '<input data-unduhan-judul="' + i + '" value="' + esc(u.judul) + '" placeholder="Judul, contoh: Brosur">' +
        '<a href="' + esc(urlTampil(u.url)) + '" target="_blank" rel="noopener" class="muted">lihat</a>' +
        '<button type="button" class="hapus" data-hapus-unduhan="' + i + '" title="Hapus">&times;</button></div>').join("") : '<p class="muted">Belum ada dokumen.</p>') + "</div>" +
      '<div class="penuh-lebar"><label class="btn btn-garis kecil unggah">Unggah dokumen (PDF, dll)<input type="file" id="unggah-dok" multiple></label></div>' +

      '<div class="tombol-simpan"><button type="button" class="btn btn-garis" id="batal-editor">Batal</button><button type="submit" class="btn">Simpan produk</button></div>';
  }

  // salin isian form ke draf (dipanggil sebelum re-render & sebelum simpan)
  function bacaForm() {
    const f = $("form-produk");
    const v = (n) => f.elements[n].value.trim();
    draf.id = v("id"); draf.nama = v("nama"); draf.kategori = v("kategori"); draf.deskripsi = f.elements.deskripsi.value.trim();
    draf.spesifikasi = {};
    f.elements.spesifikasi.value.split("\n").forEach((baris) => {
      const i = baris.indexOf(":");
      if (i > 0) draf.spesifikasi[baris.slice(0, i).trim()] = baris.slice(i + 1).trim();
      else if (baris.trim()) draf.spesifikasi[baris.trim()] = "";
    });
    draf.sumber.mata_uang = v("mata_uang");
    draf.sumber.harga_manual = angka(v("harga_manual"));
    draf.sumber.nama_toko = v("nama_toko");
    draf.sumber.url = v("url");
    draf.berat_kg = (angka(v("berat_g")) || 0) / 1000;
    const m = angka(v("margin_persen"));
    if (m === null) delete draf.margin_persen; else draf.margin_persen = m;
    draf.stok = f.elements.stok.checked;
    const foto = [...f.querySelectorAll("[data-foto]")].map((i) => i.value.trim()).filter(Boolean);
    draf.gambar = foto[0] || ""; draf.galeri = foto.slice(1);
    f.querySelectorAll("[data-unduhan-judul]").forEach((i) => { draf.unduhan[+i.dataset.unduhanJudul].judul = i.value.trim(); });
  }

  async function unggahFile(file, folder) {
    if (file.size > 25 * 1024 * 1024) throw new Error(file.name + " lebih dari 25 MB.");
    const b64 = await new Promise((ok, gagal) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = () => gagal(r.error);
      r.readAsDataURL(file);
    });
    const path = "files/" + folder + "/" + namaAman(file.name);
    await tulisFile(path, b64, "Unggah " + path, await shaFile(path));
    return path;
  }

  $("form-produk").addEventListener("click", (e) => {
    const t = e.target;
    if (t.id === "batal-editor") return tutupEditor();
    if (t.id === "tambah-link-foto") {
      const url = prompt("Tempel link foto (klik kanan foto → Copy Image Address):");
      if (url) { bacaForm(); if (!draf.gambar) draf.gambar = url.trim(); else draf.galeri.push(url.trim()); renderEditor(); }
    }
    if (t.dataset.hapusFoto !== undefined) {
      bacaForm();
      const foto = [draf.gambar].concat(draf.galeri).filter(Boolean);
      foto.splice(+t.dataset.hapusFoto, 1);
      draf.gambar = foto[0] || ""; draf.galeri = foto.slice(1);
      renderEditor();
    }
    if (t.dataset.hapusUnduhan !== undefined) { bacaForm(); draf.unduhan.splice(+t.dataset.hapusUnduhan, 1); renderEditor(); }
  });

  $("form-produk").addEventListener("change", async (e) => {
    const t = e.target;
    if (t.id !== "unggah-foto" && t.id !== "unggah-dok") return;
    bacaForm();
    if (!draf.id) return alert("Isi ID produk terlebih dahulu.");
    const files = [...t.files];
    status("Mengunggah " + files.length + " file…", "proses");
    try {
      for (const file of files) {
        const path = await unggahFile(file, draf.id);
        if (t.id === "unggah-foto") { if (!draf.gambar) draf.gambar = path; else draf.galeri.push(path); }
        else draf.unduhan.push({ judul: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "), url: path });
      }
      status("✓ " + files.length + " file terunggah. Jangan lupa klik <b>Simpan produk</b>.");
    } catch (err) { status("Gagal mengunggah: " + esc(err.message), "error"); }
    renderEditor();
  });

  $("form-produk").onsubmit = async (e) => {
    e.preventDefault();
    bacaForm();
    if (draf.sumber.harga_manual === null && !draf.sumber.url) return alert("Isi harga supplier per unit.");
    if (produk.some((p) => p.id === draf.id && p.id !== idAsli)) return alert("ID " + draf.id + " sudah dipakai produk lain.");
    const cadangan = produk.slice();
    const i = produk.findIndex((p) => p.id === idAsli);
    if (i >= 0) produk[i] = draf; else produk.push(draf);
    const tombol = e.target.querySelector("button[type=submit]");
    tombol.disabled = true;
    status("Menyimpan produk…", "proses");
    try {
      await simpanProdukKeGitHub((i >= 0 ? "Ubah" : "Tambah") + " produk " + draf.id);
      const nama = draf.nama;
      tutupEditor(); isiFilterKategori(); renderTabel();
      status(pesanTerbit("Produk " + esc(nama)));
    } catch (err) { produk = cadangan; status("Gagal menyimpan: " + esc(err.message), "error"); }
    finally { tombol.disabled = false; }
  };
  $("tambah-produk").onclick = () => bukaEditor(null);

  // ------------------------------------------------ Tab update harga Excel
  const HEADER = ["ID", "Nama Produk", "Mata Uang", "Harga Supplier Sekarang", "Harga Supplier Baru", "Margin Produk (%)", "Stok (Ya/Tidak)", "Harga Jual Sekarang (Rp)"];
  const namaSheet = (s) => String(s).replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31);

  $("unduh-excel").onclick = () => {
    const wb = XLSX.utils.book_new();
    const def = (config.pengaturan_harga || {}).margin_persen;
    const petunjuk = [
      ["Update Harga ComdataSheet"], [],
      ["1. Setiap sheet = satu kategori produk."],
      ["2. Isi kolom 'Harga Supplier Baru' untuk produk yang harganya berubah (angka saja, tanpa $)."],
      ["3. ATAU isi 'Ubah semua harga supplier (%)' di atas tabel untuk mengubah semua produk di kategori itu sekaligus."],
      ["   Contoh: 5 = naik 5%, -3 = turun 3%. Hanya berlaku untuk produk yang kolom Harga Supplier Baru-nya kosong."],
      ["4. 'Margin kategori (%)' berlaku untuk semua produk di kategori tsb. Kosong = tidak diubah."],
      ["5. 'Margin Produk (%)' hanya untuk produk tertentu. Kosong = tidak diubah."],
      ["   Untuk menghapus margin khusus, pakai menu Pengaturan Toko / Edit produk."],
      ["6. Simpan, lalu unggah di halaman Admin → Update Harga (Excel)."],
      [], ["Harga jual dihitung ulang otomatis memakai kurs terbaru setelah file diunggah."],
    ];
    const ws0 = XLSX.utils.aoa_to_sheet(petunjuk); ws0["!cols"] = [{ wch: 110 }];
    XLSX.utils.book_append_sheet(wb, ws0, "Petunjuk");

    const kats = daftarKategori().concat([...new Set(produk.map((p) => p.kategori))].filter((k) => k && !daftarKategori().includes(k)));
    for (const k of kats) {
      const km = (config.kategori.find((x) => x.nama === k) || {}).margin_persen;
      const rows = [
        ["Kategori", k],
        ["Margin kategori (%)", km ?? "", "Kosong = tidak diubah (sekarang: " + (km ?? def + "% default") + (km != null ? "%" : "") + ")"],
        ["Ubah semua harga supplier (%)", "", "Contoh: 5 = naik 5%, -3 = turun 3%"],
        [],
        HEADER,
      ].concat(produk.filter((p) => p.kategori === k).map((p) => [
        p.id, p.nama, (p.sumber || {}).mata_uang || "USD", (p.sumber || {}).harga_manual ?? "", "",
        p.margin_persen ?? "", p.stok === false ? "Tidak" : "Ya", hargaJual(p.id) ?? "",
      ]));
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 28 }, { wch: 50 }, { wch: 11 }, { wch: 22 }, { wch: 20 }, { wch: 17 }, { wch: 15 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, ws, namaSheet(k));
    }
    XLSX.writeFile(wb, "Update_Harga_ComdataSheet_" + new Date().toISOString().slice(0, 10) + ".xlsx");
  };

  let rencana = null;
  $("file-excel").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      rencana = bacaExcel(wb);
      renderPratinjau();
    } catch (err) { $("pratinjau").innerHTML = '<p class="pesan-error">File tidak bisa dibaca: ' + esc(err.message) + "</p>"; }
    e.target.value = "";
  };

  function bacaExcel(wb) {
    const ubahProduk = new Map(); // id -> {harga_manual?, margin_persen?, stok?}
    const ubahKategori = new Map(); // nama -> margin
    const peringatan = [];
    for (const nama of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[nama], { header: 1, defval: "", raw: true });
      const hdr = rows.findIndex((r) => String(r[0]).trim().toUpperCase() === "ID");
      if (hdr < 0) continue;
      const cari = (awal) => rows.slice(0, hdr).find((r) => String(r[0]).toLowerCase().startsWith(awal)) || [];
      const kategori = String(cari("kategori")[1] || nama).trim();
      const mk = cari("margin kategori");
      if (angka(mk[1]) !== null && config.kategori.some((k) => k.nama === kategori)) ubahKategori.set(kategori, angka(mk[1]));
      const persen = angka(cari("ubah semua")[1]);

      for (const r of rows.slice(hdr + 1)) {
        const id = String(r[0]).trim();
        if (!id) continue;
        const p = produk.find((x) => x.id === id);
        if (!p) { peringatan.push("ID " + id + " (sheet " + nama + ") tidak ditemukan, dilewati."); continue; }
        const u = {};
        const baru = angka(r[4]);
        const lama = (p.sumber || {}).harga_manual;
        if (baru !== null) { if (baru <= 0) peringatan.push(id + ": harga baru harus lebih dari 0, dilewati."); else u.harga_manual = baru; }
        else if (persen !== null && persen !== 0 && typeof lama === "number") u.harga_manual = Math.round(lama * (1 + persen / 100) * 100) / 100;
        if (angka(r[5]) !== null) u.margin_persen = angka(r[5]);
        const st = String(r[6]).trim().toLowerCase();
        if (st) u.stok = !["tidak", "habis", "no", "0", "false"].includes(st);
        ubahProduk.set(id, u);
      }
    }
    return { ubahProduk, ubahKategori, peringatan };
  }

  function daftarPerubahan() {
    const baris = [];
    for (const [id, u] of rencana.ubahProduk) {
      const p = produk.find((x) => x.id === id), s = p.sumber || {};
      const mu = s.mata_uang || "USD";
      if ("harga_manual" in u && u.harga_manual !== s.harga_manual) baris.push([id, p.nama, "Harga supplier", mu + " " + (s.harga_manual ?? "–"), mu + " " + u.harga_manual]);
      if ("margin_persen" in u && u.margin_persen !== (p.margin_persen ?? null)) baris.push([id, p.nama, "Margin produk", (p.margin_persen ?? "ikut kategori") + (p.margin_persen != null ? "%" : ""), (u.margin_persen ?? "ikut kategori") + (u.margin_persen != null ? "%" : "")]);
      if ("stok" in u && u.stok !== (p.stok !== false)) baris.push([id, p.nama, "Stok", p.stok === false ? "Habis" : "Ada", u.stok ? "Ada" : "Habis"]);
    }
    for (const [nama, m] of rencana.ubahKategori) {
      const k = config.kategori.find((x) => x.nama === nama);
      if ((k.margin_persen ?? null) !== m) baris.unshift(["–", "SEMUA produk " + nama, "Margin kategori", (k.margin_persen ?? "default") + (k.margin_persen != null ? "%" : ""), m + "%"]);
    }
    return baris;
  }

  function renderPratinjau() {
    const baris = daftarPerubahan();
    $("pratinjau").innerHTML =
      rencana.peringatan.map((w) => '<p class="pesan-error">' + esc(w) + "</p>").join("") +
      (baris.length
        ? '<p><b>' + baris.length + " perubahan</b> akan disimpan:</p>" +
          '<div class="tabel-wrap"><table class="tabel"><thead><tr><th>ID</th><th>Produk</th><th>Yang diubah</th><th>Lama</th><th>Baru</th></tr></thead><tbody>' +
          baris.map((b) => "<tr><td>" + esc(b[0]) + "</td><td>" + esc(b[1]) + "</td><td>" + esc(b[2]) + '</td><td class="lama">' + esc(b[3]) + '</td><td class="baru">' + esc(b[4]) + "</td></tr>").join("") +
          '</tbody></table></div><p style="margin-top:12px"><button class="btn" id="terapkan-excel">Simpan &amp; terapkan ke toko</button></p>'
        : '<p class="muted">Tidak ada perubahan dibanding data sekarang.</p>');
  }

  $("pratinjau").onclick = async (e) => {
    if (e.target.id !== "terapkan-excel") return;
    e.target.disabled = true;
    const cadP = JSON.stringify(produk), cadC = JSON.stringify(config);
    for (const [id, u] of rencana.ubahProduk) {
      const p = produk.find((x) => x.id === id);
      p.sumber = p.sumber || {};
      if ("harga_manual" in u) p.sumber.harga_manual = u.harga_manual;
      if ("margin_persen" in u) p.margin_persen = u.margin_persen;
      if ("stok" in u) p.stok = u.stok;
    }
    let configBerubah = false;
    for (const [nama, m] of rencana.ubahKategori) {
      const k = config.kategori.find((x) => x.nama === nama);
      if ((k.margin_persen ?? null) !== m) { k.margin_persen = m; configBerubah = true; }
    }
    status("Menyimpan perubahan harga…", "proses");
    try {
      const files = [];
      if (JSON.stringify(produk) !== cadP) files.push({ path: "data/products.json", teks: JSON.stringify(produk, null, 2) + "\n" });
      if (configBerubah) files.push({ path: "data/config.json", teks: JSON.stringify(config, null, 2) + "\n" });
      if (files.length) await simpanSekaligus(files, "Update harga dari Excel");
      rencana = null; $("pratinjau").innerHTML = "";
      renderTabel();
      status(pesanTerbit("Perubahan harga"));
    } catch (err) {
      produk = JSON.parse(cadP); config = JSON.parse(cadC);
      status("Gagal menyimpan: " + esc(err.message), "error");
      e.target.disabled = false;
    }
  };

  $("jalankan-update").onclick = async () => {
    status("Menjalankan update kurs…", "proses");
    try {
      await gh("/actions/workflows/update-harga.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: repo.branch }) });
      status('✓ Update kurs & harga dimulai. Selesai dalam ±1–2 menit (<a href="' + linkActions() + '" target="_blank" rel="noopener">lihat proses</a>).');
    } catch (err) {
      status(err.status === 403 ? "Token belum punya izin <b>Actions: Read and write</b>. Tambahkan izin itu di pengaturan token GitHub Anda." : "Gagal: " + esc(err.message), "error");
    }
  };

  // ------------------------------------------------- Tab pengaturan toko
  function renderFormToko() {
    const c = config, h = c.pengaturan_harga || {};
    const field = (label, nama, nilai, opsi = {}) =>
      '<label class="' + (opsi.lebar ? "penuh-lebar" : "") + '">' + label + (opsi.ket ? " <small>" + opsi.ket + "</small>" : "") +
      (opsi.area ? '<textarea name="' + nama + '" rows="2">' + esc(nilai) + "</textarea>" : '<input name="' + nama + '" value="' + esc(nilai ?? "") + '"' + (opsi.angka ? ' inputmode="decimal"' : "") + ">") + "</label>";
    $("form-toko").innerHTML =
      "<h3>Informasi toko</h3>" +
      field("Nama toko", "nama_toko", c.nama_toko) +
      field("No. WhatsApp", "whatsapp", c.whatsapp, { ket: "format 62…, tanpa + atau spasi" }) +
      field("Slogan (judul halaman depan)", "slogan", c.slogan, { lebar: true }) +
      field("Link Tokopedia", "tokopedia_url", c.tokopedia_url, { lebar: true }) +
      field("Info pembayaran", "info_pembayaran", c.info_pembayaran, { lebar: true, area: true }) +
      "<h3>Rumus harga</h3>" +
      field("Margin default (%)", "h_margin_persen", h.margin_persen, { angka: true }) +
      field("Buffer kurs (%)", "h_buffer_kurs_persen", h.buffer_kurs_persen, { angka: true, ket: "cadangan bila kurs naik" }) +
      field("Ongkir import per kg (Rp)", "h_ongkir_impor_per_kg_idr", h.ongkir_impor_per_kg_idr, { angka: true }) +
      field("Pajak impor (%)", "h_pajak_impor_persen", h.pajak_impor_persen, { angka: true }) +
      field("Biaya tetap per produk (Rp)", "h_biaya_tetap_idr", h.biaya_tetap_idr, { angka: true }) +
      field("Pembulatan harga (Rp)", "h_pembulatan_idr", h.pembulatan_idr, { angka: true }) +
      field("Batas perubahan otomatis (%)", "h_batas_perubahan_persen", h.batas_perubahan_persen, { angka: true, ket: "pengaman lonjakan harga" }) +
      "<h3>Margin per kategori <small>(kosong = margin default)</small></h3>" +
      config.kategori.map((k, i) => field(esc(k.nama) + " (%)", "k_" + i, k.margin_persen, { angka: true })).join("") +
      '<div class="penuh-lebar"><button class="btn" type="submit">Simpan pengaturan</button></div>';
  }

  $("form-toko").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target.elements, cad = JSON.stringify(config);
    ["nama_toko", "whatsapp", "slogan", "tokopedia_url", "info_pembayaran"].forEach((n) => { config[n] = f[n].value.trim(); });
    config.whatsapp = config.whatsapp.replace(/\D/g, "").replace(/^0/, "62");
    const h = config.pengaturan_harga = config.pengaturan_harga || {};
    for (const n of ["margin_persen", "buffer_kurs_persen", "ongkir_impor_per_kg_idr", "pajak_impor_persen", "biaya_tetap_idr", "pembulatan_idr", "batas_perubahan_persen"]) {
      const v = angka(f["h_" + n].value);
      if (v === null) return alert("Isi angka untuk semua kolom rumus harga.");
      h[n] = v;
    }
    config.kategori.forEach((k, i) => { k.margin_persen = angka(f["k_" + i].value); });
    status("Menyimpan pengaturan…", "proses");
    try { await simpanConfigKeGitHub("Ubah pengaturan toko"); renderFormToko(); status(pesanTerbit("Pengaturan")); }
    catch (err) { config = JSON.parse(cad); status("Gagal menyimpan: " + esc(err.message), "error"); }
  };

  // ------------------------------------------------------------ Mulai
  async function mulai() {
    // repo diambil dari pengaturan toko; cadangan: dari alamat <user>.github.io/<repo>/
    try {
      const k = await fetch("data/katalog.json?t=" + Date.now()).then((r) => r.json());
      if (k.toko && k.toko.github) repo = { ...repo, ...k.toko.github };
    } catch (e) { /* abaikan */ }
    if (!repo.owner && location.hostname.endsWith(".github.io")) {
      repo.owner = location.hostname.split(".")[0];
      repo.repo = location.pathname.split("/").filter(Boolean)[0] || repo.owner + ".github.io";
    }
    $("nama-repo").textContent = repo.repo || "repo toko";
    if (!window.crypto || !crypto.subtle) { tampilKunci(); return errorKunci("Browser ini tidak mendukung enkripsi. Buka halaman admin lewat https."); }

    const sesi = sessionStorage.getItem(SESI_KEY);
    if (sesi && bacaSimpanan()) {
      try { await cekToken(sesi); return masukPanel(); } catch (e) { sessionStorage.removeItem(SESI_KEY); }
    }
    tampilKunci();
  }
  mulai();
})();

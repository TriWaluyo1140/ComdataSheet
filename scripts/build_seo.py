#!/usr/bin/env python3
"""
Membuat halaman agar produk ComdataSheet bisa ditemukan di Google.

Dari data/katalog.json dibuat (di folder website, default _site/):
- produk/<nama-produk>.html : satu halaman per produk, langsung terbaca Google
  (judul, deskripsi, foto, harga, data schema.org Product untuk harga & stok)
- sitemap.xml               : daftar semua halaman, dikirim ke Google Search Console
- robots.txt                : izin untuk mesin pencari (berlaku bila memakai domain sendiri)
- google-merchant.xml       : feed produk untuk Google Merchant Center (tab Shopping)

Alamat website diambil dari env SITE_URL (diisi otomatis oleh GitHub Actions),
lalu "url_situs" di config, lalu https://<owner>.github.io/<repo>/.

Hanya memakai library bawaan Python.
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from html import escape
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

sys.path.insert(0, str(Path(__file__).resolve().parent))
from update_prices import halaman_produk  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
KATALOG_FILE = ROOT / "data" / "katalog.json"


def e(teks):
    return escape(str(teks if teks is not None else ""), quote=True)


def slugify(teks):
    import re
    return re.sub(r"[^a-z0-9]+", "-", str(teks or "").lower()).strip("-")


def rupiah(n):
    return "Rp " + f"{int(n or 0):,}".replace(",", ".")


def url_situs(toko):
    url = os.environ.get("SITE_URL") or toko.get("url_situs") or ""
    if not url:
        gh = toko.get("github") or {}
        url = f"https://{gh.get('owner', '').lower()}.github.io/{gh.get('repo', '')}/"
    return url.rstrip("/") + "/"


def url_absolut(path, basis):
    if not path:
        return ""
    if path.startswith(("http://", "https://")):
        return path
    return basis + path.lstrip("/")


def ketersediaan(p):
    k = p.get("ketersediaan")
    if k in ("ready", "indent", "habis"):
        return k
    return "ready" if p.get("stok", True) else "habis"


def teks_ketersediaan(p):
    k = ketersediaan(p)
    if k == "habis":
        return "Stok habis"
    if k == "indent":
        return f"Indent / PO ± {p.get('lama_indent_hari') or 14} hari"
    return "Ready stock"


def merek(p):
    return (p.get("merek") or (p.get("nama") or "").split(" ")[0]).strip()


def ringkas(teks, maks=155):
    teks = " ".join(str(teks or "").split())
    if len(teks) <= maks:
        return teks
    return teks[:maks].rsplit(" ", 1)[0].rstrip(",.;:") + "…"


def nama_kategori(toko, p):
    for k in toko.get("kategori") or []:
        if k.get("nama") == p.get("kategori") or k.get("slug") == slugify(p.get("kategori")):
            return k.get("nama") or p.get("kategori")
    return p.get("kategori") or ""


def tanggal_tersedia(p):
    hari = int(p.get("lama_indent_hari") or 14)
    return (datetime.now(timezone.utc) + timedelta(days=hari)).strftime("%Y-%m-%dT00:00+0700")


def json_ld_produk(p, toko, basis, url_hal):
    k = ketersediaan(p)
    gambar = [url_absolut(g, basis) for g in [p.get("gambar")] + list(p.get("galeri") or []) if g]
    data = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": p.get("nama"),
        "sku": p.get("id"),
        "image": gambar,
        "description": " ".join(str(p.get("deskripsi") or p.get("nama")).split()),
        "brand": {"@type": "Brand", "name": merek(p)},
        "category": nama_kategori(toko, p),
        "offers": {
            "@type": "Offer",
            "url": url_hal,
            "priceCurrency": "IDR",
            "price": int(p.get("harga_idr") or 0),
            "availability": {"ready": "https://schema.org/InStock", "indent": "https://schema.org/PreOrder",
                             "habis": "https://schema.org/OutOfStock"}[k],
            "itemCondition": "https://schema.org/NewCondition",
            "seller": {"@type": "Organization", "name": toko.get("nama_toko") or "ComdataSheet"},
        },
    }
    if p.get("mpn"):
        data["mpn"] = p["mpn"]
    if p.get("berat_kg"):
        data["weight"] = {"@type": "QuantitativeValue", "value": p["berat_kg"], "unitCode": "KGM"}
    remah = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Beranda", "item": basis},
            {"@type": "ListItem", "position": 2, "name": nama_kategori(toko, p),
             "item": basis + "#/kategori/" + slugify(p.get("kategori"))},
            {"@type": "ListItem", "position": 3, "name": p.get("nama"), "item": url_hal},
        ],
    }
    # "</" di dalam <script> dihindari agar teks produk tidak bisa menutup tag script
    return [json.dumps(x, ensure_ascii=False).replace("</", "<\\/") for x in (data, remah)]


def halaman(p, toko, basis, versi_css):
    url_hal = basis + halaman_produk(p)
    nama = p.get("nama") or p.get("id")
    nama_toko = toko.get("nama_toko") or "ComdataSheet"
    kat = nama_kategori(toko, p)
    slug_kat = slugify(p.get("kategori"))
    k = ketersediaan(p)
    konten = toko.get("konten") or {}
    gambar = [g for g in [p.get("gambar")] + list(p.get("galeri") or []) if g]
    lokal = lambda g: g if g.startswith(("http://", "https://")) else "../" + g.lstrip("/")
    deskripsi_meta = ringkas(f"Jual {nama} original di {nama_toko}. Harga {rupiah(p.get('harga_idr'))}, "
                             f"{teks_ketersediaan(p).lower()}. " + str(p.get("deskripsi") or ""))
    spek = p.get("spesifikasi") if isinstance(p.get("spesifikasi"), dict) else {}
    unduhan = [u for u in p.get("unduhan") or [] if u and u.get("url")]
    wa_teks = f"Halo, saya mau tanya produk {nama} ({p.get('id')})"
    from urllib.parse import quote
    ld = json_ld_produk(p, toko, basis, url_hal)
    menu = ""
    for c in toko.get("kategori") or []:
        sc = c.get("slug") or slugify(c.get("nama"))
        aktif = ' class="aktif"' if sc == slug_kat else ""
        menu += f'<a href="../#/kategori/{e(sc)}"{aktif}>{e(c.get("nama"))}</a>'
    galeri = (f'<img class="galeri-utama" src="{e(lokal(gambar[0]))}" alt="{e(nama)}">' if gambar else "")
    if len(gambar) > 1:
        galeri += '<div class="seo-thumb">' + "".join(
            f'<a href="{e(lokal(g))}" target="_blank" rel="noopener"><img src="{e(lokal(g))}" alt="{e(nama)} foto {i + 2}" loading="lazy"></a>'
            for i, g in enumerate(gambar[1:])) + "</div>"
    harga_lama = ""
    if p.get("harga_sebelumnya") and p.get("harga_sebelumnya") != p.get("harga_idr"):
        harga_lama = f' <small class="seo-lama">{rupiah(p["harga_sebelumnya"])}</small>' if p["harga_sebelumnya"] > p.get("harga_idr", 0) else ""
    tombol_beli = ('<button class="btn" disabled>Stok habis</button>' if k == "habis" else
                   f'<a class="btn" href="../?tambah={e(p.get("id"))}#/produk/{e(p.get("id"))}">'
                   f'{"Pesan (Indent / PO)" if k == "indent" else "+ Keranjang"}</a>')
    return f"""<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Jual {e(nama)} | {e(nama_toko)}</title>
  <meta name="description" content="{e(deskripsi_meta)}">
  <link rel="canonical" href="{e(url_hal)}">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="{e(nama_toko)}">
  <meta property="og:title" content="{e(nama)} — {e(rupiah(p.get('harga_idr')))}">
  <meta property="og:description" content="{e(deskripsi_meta)}">
  <meta property="og:url" content="{e(url_hal)}">
  {f'<meta property="og:image" content="{e(url_absolut(gambar[0], basis))}">' if gambar else ''}
  <meta property="product:price:amount" content="{int(p.get('harga_idr') or 0)}">
  <meta property="product:price:currency" content="IDR">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/svg+xml" href="../assets/logo-icon.svg">
  <link rel="apple-touch-icon" href="../assets/logo-icon-512.png">
  <link rel="stylesheet" href="../assets/style.css?v={versi_css}">
  <script type="application/ld+json">{ld[0]}</script>
  <script type="application/ld+json">{ld[1]}</script>
</head>
<body class="di-detail">
  <header class="topbar">
    <div class="wrap topbar-inner">
      <a class="brand" href="../"><img src="../assets/logo-putih.svg?v=5" alt="{e(nama_toko)}"></a>
      <nav class="menu" aria-label="Kategori produk"><a href="../#/">Semua</a>{menu}</nav>
      <a class="cart-btn" href="../#/" aria-label="Keranjang">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
      </a>
    </div>
  </header>

  <main class="wrap detail">
    <nav class="remah"><a class="btn-kembali" href="../#/kategori/{e(slug_kat)}">‹ Kembali</a><a href="../">Beranda</a> › <a href="../#/kategori/{e(slug_kat)}">{e(kat)}</a> › <span>{e(nama)}</span></nav>
    <div class="detail-grid">
      <div class="galeri">{galeri}</div>
      <div class="info">
        <div class="label-baris"><span class="kat">{e(kat)} · {e(p.get('id'))}</span></div>
        <h1>{e(nama)}</h1>
        <div class="harga besar">{rupiah(p.get('harga_idr'))}{harga_lama}</div>
        <p class="stok {k}">{e(teks_ketersediaan(p))}</p>
        {f'<p class="asal">Merek: {e(merek(p))}' + (f' · Kode: {e(p.get("mpn"))}' if p.get("mpn") else "") + '</p>'}
        <div class="aksi">{tombol_beli}
          <a class="btn btn-wa-kecil" target="_blank" rel="noopener" href="https://wa.me/{e(toko.get('whatsapp'))}?text={e(quote(wa_teks))}">Tanya via WhatsApp</a>
        </div>
        {('<div class="unduhan"><h2>Unduh dokumen</h2>' + "".join(
            f'<a class="file" href="{e(lokal(u["url"]))}" target="_blank" rel="noopener" download><span>{e(u.get("judul") or "Dokumen")}</span></a>'
            for u in unduhan) + '</div>') if unduhan else ''}
      </div>
    </div>
    {f'<section class="blok"><h2>Deskripsi</h2><p class="deskripsi-lengkap">{e(p.get("deskripsi")).replace(chr(10), "<br>")}</p></section>' if p.get("deskripsi") else ''}
    {('<section class="blok"><h2>Spesifikasi</h2><table class="spek">' + "".join(
        f'<tr><th>{e(a)}</th><td>{e(b)}</td></tr>' for a, b in spek.items()) + '</table></section>') if spek else ''}
  </main>

  <footer class="footer">
    <div class="wrap">
      {f'<p class="footer-kontak">{e(konten.get("info_kontak"))}</p>' if konten.get("info_kontak") else ''}
      <p>{e(konten.get('teks_footer') or 'Harga dapat berubah mengikuti kurs. Harga final mengikuti konfirmasi pesanan.')}</p>
    </div>
  </footer>
  <script>
    // sama seperti di toko: klik latar di luar kotak produk = kembali ke daftar
    document.addEventListener("click", function (ev) {{
      if (!ev.target.closest(".detail-grid, .blok, .remah, .topbar, .footer")) location.href = "../#/kategori/{e(slug_kat)}";
    }});
  </script>
</body>
</html>
"""


def sitemap(produk, basis, waktu):
    url = [(basis, waktu)] + [(basis + halaman_produk(p), waktu) for p in produk]
    isi = "".join(f"  <url><loc>{xml_escape(u)}</loc><lastmod>{w}</lastmod></url>\n" for u, w in url)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + isi + "</urlset>\n")


def feed_merchant(produk, toko, basis):
    """Feed RSS 2.0 sesuai format Google Merchant Center."""
    def item(p):
        k = ketersediaan(p)
        gambar = [url_absolut(g, basis) for g in [p.get("gambar")] + list(p.get("galeri") or []) if g]
        baris = [
            ("g:id", p.get("id")),
            ("g:title", (p.get("nama") or "")[:150]),
            ("g:description", " ".join(str(p.get("deskripsi") or p.get("nama")).split())[:5000]),
            ("g:link", basis + halaman_produk(p)),
            ("g:image_link", gambar[0] if gambar else ""),
            *[("g:additional_image_link", g) for g in gambar[1:11]],
            ("g:availability", {"ready": "in_stock", "indent": "preorder", "habis": "out_of_stock"}[k]),
            ("g:price", f"{int(p.get('harga_idr') or 0)}.00 IDR"),
            ("g:brand", merek(p)),
            ("g:condition", "new"),
            ("g:product_type", nama_kategori(toko, p)),
        ]
        if k == "indent":
            baris.append(("g:availability_date", tanggal_tersedia(p)))
        if p.get("mpn"):
            baris.append(("g:mpn", p["mpn"]))
        else:
            baris.append(("g:identifier_exists", "no"))
        if p.get("berat_kg"):
            baris.append(("g:shipping_weight", f"{p['berat_kg']} kg"))
        return "    <item>\n" + "".join(f"      <{t}>{xml_escape(str(v))}</{t}>\n" for t, v in baris if v != "") + "    </item>\n"

    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n'
            f"    <title>{xml_escape(toko.get('nama_toko') or 'ComdataSheet')}</title>\n"
            f"    <link>{xml_escape(basis)}</link>\n"
            "    <description>Katalog produk</description>\n"
            + "".join(item(p) for p in produk if p.get("harga_idr")) +
            "  </channel>\n</rss>\n")


def main():
    keluar = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "_site")
    katalog = json.loads(KATALOG_FILE.read_text(encoding="utf-8"))
    toko, produk = katalog.get("toko") or {}, katalog.get("produk") or []
    basis = url_situs(toko)
    # versi style.css diambil dari index.html agar ikut cache-busting yang sama
    import re
    m = re.search(r"style\.css\?v=(\d+)", (ROOT / "index.html").read_text(encoding="utf-8"))
    versi_css = m.group(1) if m else "1"

    folder = keluar / "produk"
    folder.mkdir(parents=True, exist_ok=True)
    for p in produk:
        (keluar / halaman_produk(p)).write_text(halaman(p, toko, basis, versi_css), encoding="utf-8")

    waktu = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    (keluar / "sitemap.xml").write_text(sitemap(produk, basis, waktu), encoding="utf-8")
    (keluar / "robots.txt").write_text(f"User-agent: *\nDisallow: /admin.html\nSitemap: {basis}sitemap.xml\n", encoding="utf-8")
    (keluar / "google-merchant.xml").write_text(feed_merchant(produk, toko, basis), encoding="utf-8")
    print(f"{len(produk)} halaman produk dibuat untuk {basis}")
    print(f"Sitemap      : {basis}sitemap.xml")
    print(f"Feed Merchant: {basis}google-merchant.xml")


if __name__ == "__main__":
    main()

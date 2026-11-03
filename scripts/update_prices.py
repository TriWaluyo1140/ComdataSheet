#!/usr/bin/env python3
"""
Update harga otomatis ComdataSheet.

1. Ambil kurs terbaru (USD, CNY, dll -> IDR) dari API kurs gratis.
2. Ambil harga terbaru dari toko sumber import (jika url diisi).
3. Hitung harga jual dalam Rupiah sesuai rumus di data/config.json.
4. Tulis hasilnya ke data/katalog.json (dibaca oleh website).

Hanya memakai library bawaan Python, tidak perlu pip install.
"""
import json
import math
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CONFIG_FILE = DATA / "config.json"
PRODUCTS_FILE = DATA / "products.json"
KATALOG_FILE = DATA / "katalog.json"  # publik, dibaca website
INTERNAL_FILE = DATA / "internal.json"  # rincian modal & supplier, TIDAK ikut dipublikasikan
PUBLIK_FIELD = {"id", "nama", "kategori", "gambar", "deskripsi", "berat_kg", "stok",
                "mata_uang_sumber", "harga_idr", "harga_sebelumnya"}

# Situs yang memblokir bot (captcha). Untuk sumber ini harga USD diambil dari
# "harga_manual", tapi kurs tetap otomatis. URL tetap disimpan sebagai catatan.
SITUS_MANUAL = ("alibaba.com", "1688.com", "taobao.com", "tmall.com", "aliexpress.")

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)


def log(msg):
    print(msg, flush=True)


def fetch(url, timeout=25):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")


def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


# ---------------------------------------------------------------- Kurs

def ambil_kurs():
    """Kembalikan dict {KODE: jumlah per 1 USD}, misal {"IDR": 16500, "CNY": 7.1}."""
    sumber = [
        ("open.er-api.com", "https://open.er-api.com/v6/latest/USD", lambda d: d["rates"]),
        ("frankfurter.app", "https://api.frankfurter.app/latest?from=USD", lambda d: {**d["rates"], "USD": 1}),
        (
            "fawazahmed0/currency-api",
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
            lambda d: {k.upper(): v for k, v in d["usd"].items()},
        ),
    ]
    for nama, url, parse in sumber:
        try:
            rates = parse(json.loads(fetch(url)))
            if rates.get("IDR", 0) > 1000:
                log(f"Kurs dari {nama}: 1 USD = Rp {rates['IDR']:,.2f}")
                return rates, nama
        except Exception as e:  # noqa: BLE001
            log(f"  ! Gagal ambil kurs dari {nama}: {e}")
    return None, None


# ------------------------------------------------- Harga dari toko sumber

def _angka(val):
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = re.sub(r"[^\d.,]", "", str(val))
    if not s:
        return None
    # "1,299.00" -> 1299.00 ; "1.299,00" -> 1299.00 ; "12,50" -> 12.50
    if "," in s and "." in s:
        s = s.replace(",", "") if s.rfind(".") > s.rfind(",") else s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".") if len(s.split(",")[-1]) <= 2 else s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def _cari_offer(node):
    """Cari harga di struktur JSON-LD schema.org Product."""
    if isinstance(node, list):
        for n in node:
            hasil = _cari_offer(n)
            if hasil:
                return hasil
    elif isinstance(node, dict):
        if "offers" in node:
            offers = node["offers"]
            offers = offers if isinstance(offers, list) else [offers]
            for o in offers:
                if not isinstance(o, dict):
                    continue
                harga = _angka(o.get("price") or o.get("lowPrice"))
                if harga is None and isinstance(o.get("priceSpecification"), dict):
                    harga = _angka(o["priceSpecification"].get("price"))
                if harga:
                    return harga, o.get("priceCurrency")
        for v in node.values():
            if isinstance(v, (dict, list)):
                hasil = _cari_offer(v)
                if hasil:
                    return hasil
    return None


def harga_dari_sumber(sumber):
    """Kembalikan (harga, mata_uang, metode) atau raise Exception."""
    url = sumber["url"].strip()

    # 1. Toko Shopify: /products/<handle>.json
    if "/products/" in url:
        try:
            data = json.loads(fetch(url.split("?")[0].rstrip("/") + ".json"))
            harga = _angka(data["product"]["variants"][0]["price"])
            if harga:
                return harga, None, "shopify"
        except Exception:  # noqa: BLE001
            pass

    html = fetch(url)

    # 2. Pola khusus yang diisi sendiri di products.json ("regex_harga")
    if sumber.get("regex_harga"):
        m = re.search(sumber["regex_harga"], html, re.S)
        if m and _angka(m.group(1)):
            return _angka(m.group(1)), None, "regex"
        raise ValueError("regex_harga tidak cocok dengan halaman")

    # 3. JSON-LD schema.org (dipakai mayoritas toko online)
    for blok in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            hasil = _cari_offer(json.loads(unescape(blok.strip())))
        except ValueError:
            continue
        if hasil:
            return hasil[0], hasil[1], "json-ld"

    # 4. Meta tag harga
    for pola in (
        r'<meta[^>]+(?:property|name)=["\'](?:product|og):price:amount["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:product|og):price:amount',
        r'itemprop=["\']price["\'][^>]+content=["\']([^"\']+)',
    ):
        m = re.search(pola, html, re.I)
        if m and _angka(m.group(1)):
            return _angka(m.group(1)), None, "meta"

    if re.search(r"captcha|punish", html, re.I):
        raise ValueError("halaman diblokir captcha, isi harga_manual")
    raise ValueError("harga tidak ditemukan di halaman (toko mungkin memblokir bot)")


# ------------------------------------------------------------- Rumus

def hitung_harga_jual(harga_sumber, kurs_ke_idr, produk, atur):
    margin = produk.get("margin_persen", atur["margin_persen"])
    modal = harga_sumber * kurs_ke_idr * (1 + atur["buffer_kurs_persen"] / 100)
    ongkir = produk.get("berat_kg", 0) * atur["ongkir_impor_per_kg_idr"]
    dasar = (modal + ongkir) * (1 + atur["pajak_impor_persen"] / 100)
    jual = dasar * (1 + margin / 100) + atur["biaya_tetap_idr"]
    bulat = atur["pembulatan_idr"] or 1
    return int(math.ceil(jual / bulat) * bulat), {
        "modal_idr": round(modal),
        "ongkir_idr": round(ongkir),
        "margin_persen": margin,
    }


# -------------------------------------------------------------- Main

def main():
    config = load_json(CONFIG_FILE, {})
    atur = config["pengaturan_harga"]
    produk_list = load_json(PRODUCTS_FILE, [])
    lama = load_json(INTERNAL_FILE, {})
    lama_by_id = {p["id"]: p for p in lama.get("produk", [])}

    rates, sumber_kurs = ambil_kurs()
    if rates is None:
        if not lama.get("kurs"):
            log("GAGAL: kurs tidak bisa diambil dan belum ada kurs tersimpan.")
            sys.exit(1)
        log("Memakai kurs terakhir yang tersimpan.")
        rates, sumber_kurs = lama["kurs"]["rates"], lama["kurs"]["sumber"] + " (tersimpan)"
        kurs_waktu = lama["kurs"]["diperbarui"]
    else:
        kurs_waktu = datetime.now(timezone.utc).isoformat(timespec="seconds")

    hasil, peringatan = [], []
    for p in produk_list:
        src = p.get("sumber", {})
        mu = (src.get("mata_uang") or "USD").upper()
        prev = lama_by_id.get(p["id"], {})
        harga_src, metode = None, None

        url = (src.get("url") or "").lower()
        otomatis = bool(url) and not any(d in url for d in SITUS_MANUAL)
        if otomatis:
            try:
                harga_src, mu_web, metode = harga_dari_sumber(src)
                if mu_web:
                    mu = mu_web.upper()
            except Exception as e:  # noqa: BLE001
                peringatan.append(f"{p['id']}: gagal ambil harga dari sumber ({e})")
        if harga_src is None:
            if otomatis and prev.get("harga_sumber") and prev.get("mata_uang_sumber") == mu:
                harga_src, metode = prev["harga_sumber"], "terakhir-tersimpan"
            elif src.get("harga_manual") is not None:
                harga_src, metode = float(src["harga_manual"]), "manual"
            else:
                peringatan.append(f"{p['id']}: tidak ada harga sumber, produk disembunyikan")
                continue

        if mu not in rates:
            peringatan.append(f"{p['id']}: mata uang {mu} tidak dikenal, produk disembunyikan")
            continue
        kurs_ke_idr = rates["IDR"] / rates[mu]
        harga_jual, rincian = hitung_harga_jual(harga_src, kurs_ke_idr, p, atur)

        # Pengaman: kalau harga lompat terlalu jauh (biasanya salah baca halaman), tahan harga lama
        batas = None if os.environ.get("ABAIKAN_BATAS") == "true" else atur.get("batas_perubahan_persen")
        if batas and prev.get("harga_idr") and metode not in ("manual",):
            ubah = abs(harga_jual - prev["harga_idr"]) / prev["harga_idr"] * 100
            if ubah > batas:
                peringatan.append(
                    f"{p['id']}: harga berubah {ubah:.0f}% (Rp {prev['harga_idr']:,} -> Rp {harga_jual:,}), "
                    f"melebihi batas {batas}%. Harga lama dipertahankan, mohon cek manual."
                )
                harga_jual = prev["harga_idr"]

        item = {k: v for k, v in p.items() if k != "sumber"}
        item.update(
            {
                "toko_sumber": src.get("nama_toko", ""),
                "harga_sumber": harga_src,
                "mata_uang_sumber": mu,
                "kurs_ke_idr": round(kurs_ke_idr, 4),
                "metode_harga": metode,
                "harga_idr": harga_jual,
                "harga_sebelumnya": prev.get("harga_idr") if prev.get("harga_idr") != harga_jual else prev.get("harga_sebelumnya"),
                "rincian": rincian,
            }
        )
        hasil.append(item)
        log(f"  {p['id']:<10} {mu} {harga_src:>10,.2f} [{metode}] -> Rp {harga_jual:>12,}")

    simpan_mu = {"IDR", "USD", "CNY", "EUR", "SGD", "JPY", "GBP", "HKD", "MYR", "TWD", "KRW", "AUD"}
    simpan_mu |= {p.get("mata_uang_sumber") for p in hasil}
    toko = {k: v for k, v in config.items() if k != "pengaturan_harga"}
    katalog = {
        "toko": toko,
        "diperbarui": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "kurs": {
            "sumber": sumber_kurs,
            "diperbarui": kurs_waktu,
            "usd_idr": round(rates["IDR"], 2),
            "rates": {k: rates[k] for k in sorted(rates) if k in simpan_mu},
        },
        "peringatan": peringatan,
        "produk": hasil,
    }
    INTERNAL_FILE.write_text(json.dumps(katalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    publik = {
        "toko": toko,
        "diperbarui": katalog["diperbarui"],
        "kurs": {"usd_idr": katalog["kurs"]["usd_idr"], "diperbarui": kurs_waktu},
        "produk": [{k: v for k, v in p.items() if k in PUBLIK_FIELD} for p in hasil],
    }
    KATALOG_FILE.write_text(json.dumps(publik, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    for w in peringatan:
        log(f"::warning::{w}")
    log(f"Selesai: {len(hasil)} produk ditulis ke data/katalog.json (rincian di data/internal.json)")


if __name__ == "__main__":
    main()

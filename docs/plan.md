# Plan: Sistem Tasarımı Challenge Platformu

## Hedef
Terminalden çalışan, dondurulmuş container ortamlarında çözümleri deterministik testler ve LLM hakemiyle puanlayan, çözümleri şifreli tutan bir challenge sistemi.

## Kararlar
- Harness: Python 3.11+ stdlib, tek giriş `ch.py`. Bağımlılık yok.
- Ortam: her challenge kendi `Dockerfile`ını digest ile sabitler. Test sırasında `--network none`, CPU/bellek sınırı.
- `--local` bayrağı: Docker olmadan host yorumlayıcısıyla koşar, raporda "dondurulmamış" diye işaretlenir.
- Testler iki katman: `tests/public/` açık (duman testi), gizli testler kasada (`vault.bin`).
- Kasa: SHA-256 sayaç modu akış şifresi + HMAC, anahtar harness'ta gömülü. Amaç dosyaya bakarak görülmesini engellemek; kararlı birine karşı koruma değil.
- Düz kaynaklar `.vault-src/` altında, git'e girmez. `ch.py seal` kasayı üretir.
- Puan: deterministik %70 (kategori ağırlıkları `challenge.toml`), LLM %30 (rubrik). Hakem varsayılan `claude -p`, yedek `ANTHROPIC_API_KEY` ile API.
- `reveal` en az bir puanlama kaydı ister, `--force` ile atlanır.

## Sıra
1. Harness + kasa + rapor.
2. Challenge 01: çok kiracılı rate limiter (Python). Referans ve naive çözümle testlerin ayırt ediciliği kanıtlanır.
3. Tüketim ölçülür, kalan challenge'lar ölçüme göre planlanır.

## Kalan Challenge Adayları
Crash-safe KV (Rust), iş kuyruğu (Python), event-sourced ledger (TypeScript), LRU/TTL cache (Java), consistent hashing (Go), URL kısaltıcı.

# Sistem Tasarımı Görevleri

Sert kenarları olan gerçekçi bileşenler: eşzamanlılık, kısmi arıza, sınırlı bellek, saat
kayması. Her biri birçok yolla çözülebilir. Çözümün, dondurulmuş bir konteyner içindeki gizli
deterministik testlerle ve kodunu ve yazılı yaklaşımını okuyan bir LLM değerlendiriciyle
puanlanır. Referans çözüm sen isteyene kadar şifreli kalır.

## Gereksinimler

- Ana makinede Python 3.11+ (harness yalnız standart kütüphaneyi kullanır)
- Docker (her görev kendi imajında çalışır; imaj özetle sabitlenmiştir, ağ yoktur)
- LLM değerlendirmesi için: oturum açılmış `claude` CLI ya da `--judge api` ile `ANTHROPIC_API_KEY`

## Hızlı Başlangıç

```
python ch.py list
python ch.py start 01
# workspace/01-rate-limiter/ içinde düzenle, APPROACH.md yaz
python ch.py test 01           # açık testler, hızlı geri bildirim
python ch.py score 01          # tüm testler + LLM değerlendirmesi, .progress/ içine kaydedilir
python ch.py reveal 01         # referans çözüm, rubrik, gizli testler
```

`--local` testleri Docker yerine ana makinede çalıştırır. Sonuç dondurulmamış diye işaretlenir
ve karşılaştırılamaz. `--no-judge` LLM değerlendirmesini atlar.

## Görevler

| ID | Dil | Odak |
|---|---|---|
| 01-rate-limiter | Python | Yalnız CAS sunan bir depo üzerinde dağıtık token bucket: çekişmede kesinlik, kararsız depo, saat kayması, TTL ile sınırlı bellek |
| 02-crash-safe-kv | Rust | Log yapılı KV deposu: kalıcı onay, kill -9 sonrası atomik kurtarma, yırtık yazı işleme, çökmeye dayanıklı sıkıştırmayla sınırlı disk |
| 03-job-queue | Python | Kiralamalı adil çok kiracılı kuyruk: en az bir kez teslim, kira süresi ve fencing token, kiracı başına adalet, sınırlı bellek |
| 04-event-ledger | TypeScript (Node 24) | Olay kaynaklı defter: çifte harcama yok, idempotency anahtarları, fsync bariyerli grup commit, çökme kurtarma |
| 05-lru-cache-server | Java 21 | TCP önbellek sunucusu: bayt bütçesi altında kesin LRU, TTL süpürme, atomik INCR, `-Xmx192m` ile OOM yok, yavaş istemci yalıtımı |
| 06-coalescing-proxy | C# (.NET 10) | HTTP proxy: istek birleştirme, stale-while-revalidate, sınırlı backend eşzamanlılığı, zaman aşımı, tek deneme çağrılı devre kesici |

## Puanlama

- **Testler (%70)**: kategoriye göre ağırlıklı; örneğin correctness, concurrency, reliability,
  scalability. Ağırlıklar her görevin `challenge.toml` dosyasındadır. Gizli testlerin adları ve
  ilk hata satırları gösterilir, kodları gösterilmez.
- **Değerlendirme (%30)**: her görevin kendi rubriği. Gönderim değerlendiriciye güvenilmeyen
  veri olarak verilir; içindeki talimatlar yok sayılır.

## Çözümler Nasıl Saklanır

`challenges/*/vault.bin` gizli testleri, referans çözümü ve rubriği tutar; SHA-256 akış
şifresiyle şifrelenir ve HMAC ile doğrulanır. Anahtar harness içinde türetilir. Bu, birinin bir
dosyayı açarak çözümü okumasını engeller. Harness kodunu kararlılıkla okuyan birini engellemez.
Bu, kapısında kilit olan bir onur sistemidir.

## Bakımcılar İçin

Açık kaynaklar `.vault-src/<id>/` içinde durur (git dışı, yedeğini kendin al):
`hidden/`, `solution/`, `naive/`, `rubric.md`, `SOLUTION.md`. Düzenledikten sonra:

```
python ch.py seal 01
python ch.py score 01 --local --no-judge --solution .vault-src/01-rate-limiter/solution   # 100 olmalı
python ch.py score 01 --local --no-judge --solution .vault-src/01-rate-limiter/naive      # düşük olmalı
```

Yeni bir görev için `challenge.toml`, `README.md`, `Dockerfile` (özetle sabitlenmiş),
`starter/`, `tests/public/` ve `test_<kategori>_` ile başlayan test adları gerekir.

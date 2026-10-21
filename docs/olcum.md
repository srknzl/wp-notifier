# Ölçüm: Oturum Kullanımı Ve Görev Puanları

Kaynak: `get_usage` (Max planı), 2026-10-21. Sayılar uygulamanın kullanım kartındaki yüzdelerdir.

## Plan Kullanımı

| Nokta | 5 saatlik | Haftalık (tüm modeller) |
|---|---|---|
| Oturum başı | %22 | %6 |
| 01 bitince | %26 | %7 |
| 02–06 toplu işin başı | %27 | %8 |
| Ara okuma (iş ilerlemesi ~%65 iken) | %38 | %11 |
| Son (06 + README + commit sonrası) | %78 | %21 |

- Bütün oturum: 5 saatlik +56 puan, haftalık +15 puan.
- 02–06 toplu işi: 5 saatlik +51 puan, haftalık +13 puan.
- Ara okumadan sona (05, 06, kapanış): 5 saatlik +40, haftalık +10.
- 5 saatlik pencere 2026-10-21 15:40'ta (yerel) sıfırlanıyor; okumaların hepsi aynı pencerede.
- Görev başına ayrı ölçüm alınmadı; yukarıdaki ara noktalar dışında bölüştürme tahmin olur.
- Bağlam penceresi: 184.685 / 225.000 token (%82), otomatik sıkıştırma %85'te. Oturum bir kez sıkıştırıldı.

## Görev Puanları (yerel, yalnız testler, `--no-judge`)

| Görev | Referans | Naive | Mutantlar |
|---|---|---|---|
| 02 Rust KV | ~97 (bir Docker'a özgü test atlandı) | 54.6 | 75.1–97.4; noreset yakalanmıyor, rubrikte |
| 03 İş kuyruğu | 100 | 48.2 | 88.0–97.7, hepsi yakalandı |
| 04 Olay defteri | 100 | 35.1 | 70.3–95.4, hepsi yakalandı |
| 05 LRU önbellek | 100 | 54.3 | FIFO 89.4, süpürücü yok 97.2, kilit altında yazma 93.8, kilitsiz INCR 93.8, 64 bayt yok 78.9 |
| 06 Birleştiren proxy | 100 | 46.8 (starter 0) | birleştirme yok 72.8, devre kesici yok 86.0, ilk çağıranın tokenı 95.0, bayatı bekletme 95.0, yarı açıkta herkes 96.5, sınır yok 96.5 |

Docker kurulu değil ya da PATH'te yok; bütün puanlar `--local` (dondurulmamış). LLM yargıç
koşturulmadı (`claude` CLI oturumu düşmüştü).

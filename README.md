# Döviz Hesap

Reklamsız, telefona kurulabilen **döviz çevirici + hesap makinesi** (PWA).

## Özellikler
- **Döviz:** Favori para birimlerin alt alta listelenir; birine tutar girince hepsi aynı anda çevrilir.
  - Tutar alanında işlem yapılabilir: `100+50`, `250×3` vb.
  - Satıra dokun → o para birimini gir. Satırı sola kaydır → kaldır.
  - 150+ para birimi, **gram altın**, **gram gümüş**, Bitcoin, Ethereum.
  - Kurlar otomatik güncellenir (30 dk'da bir / uygulama açıldığında), ⟳ ile elle yenilenir.
  - İnternet yoksa son kayıtlı kurlarla çalışır.
- **Hesap makinesi:** Parantez, yüzde (`200+10%` = 220), geçmiş, sonucu dövize aktarma.
- Karanlık/aydınlık tema telefon ayarını izler. Hiç reklam, takip, hesap yok.

## Telefona kurulum
1. Uygulamayı açtığın linke telefondan gir (GitHub Pages linki, aşağıya bak).
2. **iPhone (Safari):** Paylaş butonu → **Ana Ekrana Ekle**.
   **Android (Chrome):** ⋮ menü → **Uygulamayı yükle** / **Ana ekrana ekle**.
3. Artık ana ekrandan normal bir uygulama gibi açılır.

## Yayınlama (GitHub Pages, ücretsiz)
GitHub'da repo → **Settings → Pages** → *Source: Deploy from a branch* →
branch'i seç (örn. `main`), klasör `/ (root)` → **Save**.
Bir dakika sonra adres: `https://<kullanıcı-adın>.github.io/Doviz-cevirici/`

## Kur kaynakları
- [fawazahmed0/currency-api](https://github.com/fawazahmed0/exchange-api) (ücretsiz, anahtarsız; altın/gümüş dahil)
- Yedek: [open.er-api.com](https://www.exchangerate-api.com/docs/free)

Not: Ücretsiz kaynaklar günde birkaç kez güncellenir; borsa ekranı gibi saniyelik değildir.

# 🚀 CodexFlow IDE - Hızlı Başlangıç

## Lokal Test (GitHub'sız)

### Yöntem 1: VS Code ile Debug (En Kolay) ⭐

1. VS Code ile `vscode` klasörünü açın
2. `F5` tuşuna basın veya Debug menüsünden **"VS Code"** seçin
3. Yeni bir CodexFlow IDE penceresi açılacak
4. CodexFlow Agent eklentisi otomatik yüklü gelecek

### Yöntem 2: Script ile Çalıştırma

```cmd
cd vscode
scripts\codexflow-dev.cmd
```

Bu script:
- Bağımlılıkları yükler
- Kodu derler
- CodexFlow IDE'yi başlatır

### Yöntem 3: Watch Mode (Geliştirme için)

```cmd
cd vscode
scripts\codexflow-watch.cmd
```

Değişiklikler otomatik derlenir, sonra F5 ile çalıştırın.

## 🎨 Yapılan Özelleştirmeler

### ✅ GUI Değişiklikleri
- **Branding**: "CodexFlow IDE - AI Agent & LiteLLM Gateway"
- **Renk Şeması**: Mor-mavi gradient (#1e40af) - Cursor AI tarzı
- **Profesyonel Arayüz**: Modern ve temiz görünüm

### ✅ Built-in Eklenti
- **CodexFlow Agent** varsayılan olarak yüklü
- Versiyon: 1.0.7
- Lokasyon: `vscode/extensions/codexflow-agent/`
- RooForkVs'den güncellenmiş versiyon

### ✅ Product Configuration
- Uygulama adı ve açıklamalar güncellendi
- Data klasörü: `.codexflow`
- Issue tracker: CodexFlow GitHub repo

## 📦 Eklenti Güncelleme

RooForkVs'deki yeni versiyonu kopyalamak için:

```cmd
robocopy "RooForkVs\src" "vscode\extensions\codexflow-agent" /E /XD node_modules .turbo __tests__ __mocks__ /NFL /NDL
```

## 🔧 Geliştirme Komutları

```bash
# Bağımlılıkları yükle
npm install

# Kodu derle
npm run gulp compile

# Watch mode (otomatik derleme)
npm run watch

# Electron ile çalıştır
npm run electron

# Production build
npm run gulp compile-build
npm run gulp bundle-vscode
npm run gulp minify-vscode
npm run gulp vscode-win32-x64-min
```

## 🐛 Sorun Giderme

### Eklenti görünmüyor?
1. `vscode/extensions/codexflow-agent/package.json` var mı kontrol edin
2. Developer Tools açın: `Help > Toggle Developer Tools`
3. Console'da hata var mı bakın

### Build hatası?
```bash
npm run clean
npm install
npm run gulp compile
```

### Node modülleri eksik?
```bash
cd vscode/extensions/codexflow-agent
npm install
cd ../../..
```

## 📁 Önemli Dosyalar

- `vscode/product.json` - Branding ve konfigürasyon
- `vscode/extensions/codexflow-agent/` - Built-in eklenti
- `vscode/.vscode/launch.json` - Debug konfigürasyonu
- `vscode/.github/workflows/build-codexflow.yml` - CI/CD pipeline

## 🌟 Özellikler

- ✅ AI-powered kod asistanı (CodexFlow Agent)
- ✅ LiteLLM Gateway entegrasyonu
- ✅ Decompose Pipeline desteği
- ✅ Türkçe dil desteği
- ✅ Cursor AI tarzı modern arayüz
- ✅ Built-in eklenti sistemi

## 📚 Detaylı Dokümantasyon

Daha fazla bilgi için:
- [BUILD_CODEXFLOW.md](BUILD_CODEXFLOW.md) - Detaylı build rehberi
- [CodexFlow Agent](https://codexflow.dev) - Eklenti dokümantasyonu
- [VS Code Docs](https://github.com/microsoft/vscode/wiki) - VS Code geliştirme

## 🎯 Sonraki Adımlar

1. ✅ Lokal test yaptınız
2. ⏭️ Logo ve icon dosyalarını ekleyin (`vscode/resources/`)
3. ⏭️ Tema renklerini özelleştirin
4. ⏭️ Production build yapın
5. ⏭️ GitHub'a push edin ve CI/CD çalıştırın

---

**Not**: Development modunda hot reload çalışır, değişiklikler anında görünür!

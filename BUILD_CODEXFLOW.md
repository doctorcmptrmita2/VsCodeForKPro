# CodexFlow IDE - Lokal Build ve Test Rehberi

## 🚀 Hızlı Başlangıç (Lokal Test)

CodexFlow IDE'yi GitHub'a göndermeden lokal olarak derleyip test edebilirsiniz.

### Gereksinimler

- Node.js 22.x
- Python 3.x
- Git
- Windows: Visual Studio Build Tools
- Linux: `libx11-dev libxkbfile-dev libsecret-1-dev libkrb5-dev`
- macOS: Xcode Command Line Tools

### Adım 1: Bağımlılıkları Yükle

```bash
cd vscode
npm install
```

### Adım 2: Kodu Derle

```bash
# TypeScript kodunu derle
npm run gulp compile

# Veya watch mode ile (otomatik derleme)
npm run watch
```

### Adım 3: Development Modunda Çalıştır

```bash
# Electron ile çalıştır (en hızlı yöntem)
npm run electron
```

Veya VS Code içinden:
1. VS Code ile `vscode` klasörünü aç
2. `F5` tuşuna bas veya Debug menüsünden "Launch VS Code" seç
3. Yeni bir CodexFlow IDE penceresi açılacak

### Adım 4: Eklentiyi Test Et

CodexFlow Agent eklentisi otomatik olarak yüklenecek çünkü:
- `vscode/extensions/codexflow-agent/` klasöründe mevcut
- `product.json` içinde built-in olarak tanımlı

## 🎨 GUI Özelleştirmeleri

### Yapılan Değişiklikler:

1. **Branding**
   - Uygulama adı: "CodexFlow IDE - AI Agent & LiteLLM Gateway"
   - Kısa ad: "CodexFlow"
   - Data klasörü: `.codexflow`

2. **Built-in Eklenti**
   - CodexFlow Agent eklentisi varsayılan olarak yüklü gelir
   - Versiyon: 1.0.7
   - Lokasyon: `vscode/extensions/codexflow-agent/`

3. **Renkler ve Tema**
   - Cursor AI tarzı profesyonel arayüz
   - Mor-mavi gradient renk şeması (#1e40af)
   - Modern ve temiz görünüm

## 📦 Production Build (Tam Paket)

Production build için GitHub Actions workflow'u kullanılır:

```bash
# Workflow'u manuel tetikle
# GitHub > Actions > Build CodexFlow IDE > Run workflow
```

Veya lokal olarak tam build:

```bash
# 1. Compile
npm run gulp compile-build

# 2. Bundle
npm run gulp bundle-vscode

# 3. Minify
npm run gulp minify-vscode

# 4. Windows için paketleme
npm run gulp vscode-win32-x64-min

# Çıktı: ../VSCode-win32-x64/ klasöründe
```

## 🔧 Eklenti Güncelleme

RooForkVs'deki eklentiyi güncellemek için:

```bash
# Windows
robocopy "RooForkVs\src" "vscode\extensions\codexflow-agent" /E /XD node_modules .turbo __tests__ __mocks__

# Linux/macOS
rsync -av --exclude='node_modules' --exclude='.turbo' --exclude='__tests__' --exclude='__mocks__' RooForkVs/src/ vscode/extensions/codexflow-agent/
```

## 🎯 Önemli Dosyalar

- `vscode/product.json` - Ürün konfigürasyonu ve branding
- `vscode/extensions/codexflow-agent/` - Built-in eklenti
- `vscode/.github/workflows/build-codexflow.yml` - CI/CD pipeline
- `vscode/package.json` - Bağımlılıklar ve scriptler

## 🐛 Sorun Giderme

### Eklenti görünmüyor
- `vscode/extensions/codexflow-agent/package.json` dosyasının var olduğundan emin olun
- `product.json` içinde `builtInExtensions` listesini kontrol edin
- Development console'u açın: `Help > Toggle Developer Tools`

### Build hataları
```bash
# Temiz başlangıç
npm run clean
npm install
npm run gulp compile
```

### Node modülleri eksik
```bash
cd vscode/extensions/codexflow-agent
npm install
cd ../../..
```

## 📝 Notlar

- Development modunda değişiklikler anında görünür (hot reload)
- Production build daha optimize ama derleme süresi uzun
- Eklenti güncellemeleri için VS Code'u yeniden başlatın
- Logo ve icon dosyaları `vscode/resources/` klasöründe

## 🌟 Cursor AI Tarzı Özellikler

CodexFlow IDE, Cursor AI'dan ilham alınarak tasarlanmıştır:
- Modern ve temiz arayüz
- AI-powered kod asistanı (CodexFlow Agent)
- LiteLLM Gateway entegrasyonu
- Decompose Pipeline desteği
- Türkçe dil desteği

## 📚 Daha Fazla Bilgi

- [VS Code Build Rehberi](https://github.com/microsoft/vscode/wiki/How-to-Contribute)
- [CodexFlow Agent Dokümantasyonu](https://codexflow.dev)
- [GitHub Issues](https://github.com/codexflow/codexflow-ide/issues)

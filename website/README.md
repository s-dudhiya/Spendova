# Spendova Official Download & Showcase Website

This is the standalone landing and download website for **Spendova**, designed to let users directly download the latest Android APK from GitHub releases and learn about Spendova's core features.

---

## 🌟 Key Features

1. **Direct GitHub APK Download**:
   - Downloads directly from the latest GitHub release (`s-dudhiya/Spendova`).
   - Dynamically checks GitHub's Release API (`api.github.com/repos/s-dudhiya/Spendova/releases/tags/v-latest`) to display real-time version numbers, release dates, and file sizes.
2. **Web App Link**:
   - One-click launch button for users on iPhone, PC, or Mac who want to use the web app directly in their browser.
3. **Product Showcase**:
   - Interactive feature highlights (Debt Simplification, Group & Personal Splits, Ledgers, Biometric Security, Push Alerts).
4. **Android 3-Step Install Guide**:
   - Clear visual walkthrough for downloading and installing the APK.
5. **Zero Build Dependencies**:
   - Completely standalone static website (`HTML5 + Tailwind CSS + Vanilla JS`).
   - Double-click `index.html` to view locally, or deploy with 1-click on any static host.

---

## 🚀 How to Run Locally

You can open `index.html` directly in any browser:

```bash
# On Windows PowerShell:
Start-Process "website/index.html"
```

Or run a simple local web server:

```bash
npx serve website
```

---

## 🌐 1-Click Deployment Options

### 1. GitHub Pages (Free)
1. In your GitHub repository (`s-dudhiya/Spendova`), go to **Settings > Pages**.
2. Under **Build and deployment > Source**, select **Deploy from a branch**.
3. Select your branch and choose the `/website` folder (or copy contents to a `gh-pages` branch).

### 2. Vercel (Free)
1. Run `npx vercel` inside the `website` directory, or import the repository on [vercel.com](https://vercel.com).
2. Set **Root Directory** to `website`.
3. Framework preset: **Other** (Static HTML).

### 3. Netlify (Free)
1. Drag and drop the `website` folder into [app.netlify.com/drop](https://app.netlify.com/drop).

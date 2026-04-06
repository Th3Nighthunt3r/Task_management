# Build Guide — Task Management App

## Prerequisites
- **Node.js** (v18+): https://nodejs.org

---

## Windows Desktop App (Electron)

### 1. Install dependencies
```
npm install
```

### 2. Run locally (test it first)
```
npm start
```

### 3. Build the Windows installer (.exe)
```
npm run build:win
```
Output will be in the `dist/` folder:
- `Task Management Setup.exe` — installer
- `Task Management.exe` — portable version (no install needed)

### Optional: Add an app icon
Place a 256x256 `.ico` file at `assets/icon.ico`.
Free converter: https://convertico.com

---

## Mobile App — Android (Play Store) & iOS (App Store)

### Requirements
| Platform | Tool needed |
|----------|-------------|
| Android  | Android Studio (free) |
| iOS      | Mac + Xcode (free) + Apple Developer account ($99/yr) |

### 1. Install Capacitor CLI
```
npm install -g @capacitor/cli
```

### 2. Initialize Capacitor (one time only)
```
npx cap init "Task Management" "com.taskmanagement.app" --web-dir .
```

### 3. Add platforms
```
npx cap add android
npx cap add ios         # Mac only
```

### 4. Sync web app to native projects
```
npx cap sync
```

### 5. Open in native IDE
```
npm run cap:android     # Opens Android Studio
npm run cap:ios         # Opens Xcode (Mac only)
```

### 6. Build & publish from the IDE
- **Android**: Build > Generate Signed APK/Bundle → upload to Google Play Console
- **iOS**: Product > Archive → upload via Xcode Organizer to App Store Connect

---

## Notes

- **Excel export** requires internet (SheetJS loads from CDN). To make it fully offline, download `xlsx.full.min.js` locally and update the `<script src>` in `index.html`.
- **Data storage**: Uses browser `localStorage` — data persists per device.
- App Store submission requires an **Apple Developer account** ($99/year at developer.apple.com).
- Play Store submission requires a **Google Play Developer account** ($25 one-time at play.google.com/console).

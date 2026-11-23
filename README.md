# CampusDesk

**CampusDesk** is a university faculty locator, live availability manager, direct contact directory, student meeting-request platform, and department events hub. It runs on the Web (with installable PWA support) and packages into a native Android APK using Capacitor.

---

## Key Features

- **Faculty & Staff Availability Directory:** Browse by department or search by faculty name, unique ID, designation, room/cabin number, or department. Displays live or simulated demo-clock status (`Taking Class`, `In Meeting`, `Free in Cabin`, `On Leave`, `Off Duty`).
- **Schedule Drawer & Meeting Requests:** Tap any faculty card to view their full weekly schedule with the active slot highlighted and submit a student meeting request.
- **Track Request:** Students can check request outcomes (`Pending`, `Accepted`, `Rescheduled`, `Declined`) using their Student Roll/ID or Tracking Code.
- **Direct Phone & Email Contact:** Verified mobile numbers (`tel:`) and email addresses (`mailto:`) launch the native Android phone dialer or Gmail/default email client cleanly.
- **Department Events:** Explore seminars, technical talks, workshops, hackathons, competitions, webinars, and cultural events filtered by department, category, and registration status.
- **Faculty & Admin Portals:** Signed-in faculty manage their cabin, leave dates, weekly schedules, student meeting requests, and department events. Admins manage bulk Faculty & Schedule CSV imports, inline edits, leave dates, and events.

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons, Motion
- **Backend:** Express (`server.ts`) with JSON file persistence (`data/store.json`), CORS, and HMAC-signed session tokens
- **Android Packaging:** Capacitor 8 (`com.campusdesk.app`)
- **Web Installability:** `vite-plugin-pwa` (Workbox runtime caching)
- **CI/CD:** GitHub Actions APK build & automated tag-triggered GitHub Releases

---

## Backend Deployment Requirement (Important for Public APKs)

The Express backend (`server.ts`) serves `/api/*` and stores faculty, schedules, meeting requests, and events in `data/store.json`.

> **Note:** Development/preview environments behind Google sign-in cannot accept unauthenticated requests from student/faculty Android phones. Before building a public release APK, deploy `server.ts` to a public HTTPS host (such as Cloud Run with public unauthenticated access, Render, Railway, or an HTTPS VPS with persistent storage for `data/`).

Required backend environment variables:
- `PORT` (defaults to `3000`)
- `SESSION_SECRET` (strong random secret for signing faculty/admin tokens)
- `ADMIN_PASSCODE` (recommended: pre-configures Admin login on first boot)
- `CORS_ALLOWED_ORIGINS` (optional comma-separated extra origins; Capacitor Android origins `https://localhost` and `capacitor://localhost` are already allowed by default)

See `.env.example` for the full list of variables.

---

## Installing CampusDesk on Android (For Students, Faculty & Users)

### Option A: Install Android APK from GitHub Releases

1. Open the repository's **Releases** page on GitHub in your Android phone's browser.
2. Locate the latest **CampusDesk vX.X.X** release (for example, **CampusDesk v1.0.0**).
3. Under **Assets**, tap **`CampusDesk-v1.0.0.apk`** to download it.
4. Once downloaded, tap the APK file from your browser notification or Android **Files / Downloads** app.
5. Android will prompt you to allow installing apps from your browser or file manager (**Install unknown apps**). Tap **Settings** and toggle **Allow from this source** on.
6. Return to the installer prompt and tap **Install**.
7. Open **CampusDesk** from your app drawer or home screen.
8. On first launch, verify the live directory loads cleanly (make sure your phone has an active internet connection).

> **Distribution Notice:** Because CampusDesk is distributed directly from GitHub Releases rather than the Google Play Store, Android requires enabling "Install from unknown sources" for your browser or file manager during installation.

### Option B: Install as a Web App (PWA Fallback)

If you prefer not to sideload an APK, open the deployed HTTPS CampusDesk web URL in **Chrome (Android)** or **Safari (iOS)** and tap **Install App** in the top navigation bar (or **Add to Home Screen** from the browser menu).

---

## Developer Guide: Building & Publishing Android APKs

### 1. Local Development

```bash
npm install
npm run dev
```

To build the web bundle and sync assets into the Android project:

```bash
VITE_API_BASE_URL=https://your-public-backend.example.com npm run cap:sync
```

> Never ship a release APK with `VITE_API_BASE_URL` pointing to `http://localhost` or `127.0.0.1`.

### 2. Configure GitHub Repository Variables & Signing Secrets

In your GitHub repository go to **Settings -> Secrets and variables -> Actions**:

1. **Variables -> New repository variable:**
   - `VITE_API_BASE_URL` = `https://your-deployed-campusdesk-api.example.com` (public HTTPS backend URL, no trailing slash)

2. **Secrets -> New repository secret (for production Play-ready / consistent upgrade signing):**
   Generate a release keystore once locally (keep the `.jks` file and passwords backed up offline — never commit it to Git):
   ```bash
   keytool -genkeypair -v -keystore campusdesk-release.jks -alias campusdesk -keyalg RSA -keysize 2048 -validity 10000
   base64 -w 0 campusdesk-release.jks
   ```
   Add these 4 GitHub Actions Secrets:
   - `ANDROID_KEYSTORE_BASE64` — base64-encoded contents of `campusdesk-release.jks`
   - `ANDROID_KEYSTORE_PASSWORD` — keystore store password
   - `ANDROID_KEY_ALIAS` — key alias (e.g. `campusdesk`)
   - `ANDROID_KEY_PASSWORD` — key password

   *(If keystore secrets are not yet configured, the workflows automatically fall back to building a debug-signed APK so testing and side-loading still work.)*

### 3. Manual APK Build Workflow

Go to **Actions -> Build CampusDesk Android APK -> Run workflow** to produce an APK artifact (`CampusDesk-Android-APK`) without publishing a GitHub Release.

### 4. Automated GitHub Release Workflow (Tag Push)

1. Ensure `package.json` version matches your release (starting at `1.0.0`) and commit your changes:
   ```bash
   git add .
   git commit -m "Prepare CampusDesk v1.0.0 Android release"
   git push origin main
   ```
2. Create and push an annotated version tag:
   ```bash
   git tag -a v1.0.0 -m "CampusDesk v1.0.0 Android APK release"
   git push origin v1.0.0
   ```
3. GitHub Actions automatically runs **Release CampusDesk Android APK**:
   - Builds the Vite bundle with `VITE_API_BASE_URL`
   - Syncs `dist/` into Capacitor Android (`com.campusdesk.app`)
   - Builds `CampusDesk-v1.0.0.apk` with `versionName = 1.0.0` and `versionCode = 1`
   - Creates GitHub Release **`CampusDesk v1.0.0`** with release notes, SHA-256 checksum, and attached APK.

### 5. Releasing Future Versions (`v1.0.1`, `v1.1.0`, etc.)

1. Keep the same `applicationId` (`com.campusdesk.app`) and the same release signing keystore so existing users can upgrade in place without uninstalling.
2. Update `"version"` in `package.json` (e.g. `1.0.1`), commit, and push a new tag:
   ```bash
   git tag -a v1.0.1 -m "CampusDesk v1.0.1"
   git push origin v1.0.1
   ```
   The release workflow automatically increments `ANDROID_VERSION_CODE` (`v1.0.0` -> `1`, `v1.0.1` -> `2`, `v1.1.0` -> `101`, etc.) and publishes the updated APK.

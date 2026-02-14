# VerifyShot — How to Run (Step by Step)

---

## PART 1: Set Up API Keys (.env file)

Create `.env` in the project root (`SocialMediaVerify/.env`):

```env
# ─── Required ───────────────────────────────
BACKBOARD_API_KEY=your_key_here              # ⭐ ALL AI operations go through this
BLOB_READ_WRITE_TOKEN=your_token_here       # ⭐ Image storage

# ─── Optional (for web search sources) ─────
GOOGLE_SEARCH_API_KEY=your_key_here          # Optional: enables web source search
GOOGLE_SEARCH_ENGINE_ID=your_cx_id_here      # Optional: enables web source search
```

### Where to get each key:

| Key | Required? | Where |
|-----|-----------|-------|
| `BACKBOARD_API_KEY` | **YES** | https://app.backboard.io → Settings → API Keys |
| `BLOB_READ_WRITE_TOKEN` | **YES** | https://vercel.com → Dashboard → Storage → Create Blob Store → copy token |
| `GOOGLE_SEARCH_API_KEY` | Optional | https://console.cloud.google.com → APIs & Services → Credentials → Create API Key (enable "Custom Search API") |
| `GOOGLE_SEARCH_ENGINE_ID` | Optional | https://programmablesearchengine.google.com → Create → "Search entire web" → copy the Search engine ID |

**Note:** Everything (OCR, claim extraction, analysis, bias detection, chat) now goes through **Backboard.io**. Google Search is only needed if you want web sources. Without it, the app will still work but won't find external sources.

---

## PART 2: Deploy Backend to Vercel

```bash
cd /Users/piragithbahiradhan/Downloads/SocialMediaVerify

# 1. Install dependencies
npm install

# 2. Install Vercel CLI (if not installed)
npm i -g vercel

# 3. Login to Vercel
vercel login

# 4. Link project
vercel link

# 5. Push environment variables
vercel env add BACKBOARD_API_KEY        # paste your key (REQUIRED)
vercel env add BLOB_READ_WRITE_TOKEN    # paste your token (REQUIRED)
vercel env add GOOGLE_SEARCH_API_KEY    # paste your key (OPTIONAL - for web sources)
vercel env add GOOGLE_SEARCH_ENGINE_ID  # paste your cx (OPTIONAL - for web sources)

# 6. Deploy
vercel --prod

# 7. Note your deployed URL (e.g. https://social-media-verify.vercel.app)
```

### Test it:
```bash
curl -X POST https://YOUR_URL.vercel.app/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/300px-PNG_transparency_demonstration_1.png"}'
```

You should get back JSON with claims, trust score, sources, etc.

---

## PART 3: Create the iOS App in Xcode

### Step 1: Create new Xcode project
1. Open **Xcode**
2. **File → New → Project**
3. Choose **iOS → App**
4. Settings:
   - **Product Name:** `VerifyShot`
   - **Interface:** `SwiftUI`
   - **Language:** `Swift`
   - **Bundle Identifier:** `com.yourname.VerifyShot`
5. Save it somewhere temporary (e.g. Desktop)

### Step 2: Replace the files
1. In Xcode's file navigator, **delete** the auto-generated:
   - `ContentView.swift`
   - `VerifyShotApp.swift` (we have our own)
2. **Drag the entire `VerifyShot/` folder** from `SocialMediaVerify/VerifyShot/` into Xcode's project navigator
   - When prompted: ✅ "Copy items if needed", ✅ "Create folder references", Target: VerifyShot
3. Or add files manually: **File → Add Files to "VerifyShot"** → select all `.swift` files from `SocialMediaVerify/VerifyShot/`

### Step 3: Configure the project
1. Select the **VerifyShot** target → **General** tab
2. Set **Minimum Deployments** to **iOS 17.0**
3. Go to **Signing & Capabilities**
4. Select your **Team** (your Apple Developer account)
5. The bundle identifier should auto-resolve

### Step 4: Add Info.plist entries
The `Info.plist` file in `VerifyShot/` has the photo library permissions.
If Xcode doesn't pick it up automatically:
1. Select target → **Info** tab
2. Add these keys:
   - `Privacy - Photo Library Usage Description` → "VerifyShot needs access to your photos to detect and analyze screenshots."
   - `App Transport Security Settings` → `Allow Arbitrary Loads` → YES

### Step 5: Update the API URL
Open `VerifyShot/Services/APIClient.swift` and change line 10:
```swift
private let baseURL = "https://YOUR_VERCEL_APP.vercel.app"
```
Replace `YOUR_VERCEL_APP` with your actual Vercel deployment URL from Part 2.

---

## PART 4: Run on Your iPhone

### Prerequisites:
- iPhone connected via USB (or same WiFi for wireless debugging)
- iPhone trusted on this Mac
- Apple Developer account signed in Xcode

### Steps:
1. Connect your iPhone via USB cable
2. In Xcode, select your iPhone from the device dropdown (top bar, next to "VerifyShot")
   - First time? Your iPhone will say "Preparing for development…" — wait ~1 min
3. Press **⌘R** (or the ▶ Play button)
4. On your iPhone: **Settings → General → VPN & Device Management** → Trust your developer certificate
5. The app should launch!

### If you see "Untrusted Developer":
1. Go to iPhone **Settings → General → VPN & Device Management**
2. Tap your developer profile
3. Tap **Trust**
4. Re-run from Xcode

---

## PART 5: Test the Full Flow

### On your iPhone:
1. Open VerifyShot app
2. Tap the **photo picker button** (bottom-left of search bar)
3. Select a screenshot from your photo library
4. Wait for analysis (loading overlay appears)
5. Results tab auto-switches showing:
   - Trust Score gauge
   - Quick Summary
   - Sources (tap to open in Safari)
   - Bias Detection slider
   - Model Consensus
6. Tap **"Ask AI"** → Chat opens with context
7. Tap **"Deep Research"** → Full research view

### Screenshot auto-detection (on real device):
1. With the app open, take a screenshot
2. The app detects it automatically and starts analysis
3. Switch back to the app — results appear

---

## Troubleshooting

### "Server error" when analyzing:
- Check Vercel deployment logs: `vercel logs`
- Verify all env vars are set: `vercel env ls`
- Make sure Gemini API key works: test at https://aistudio.google.com

### Xcode build fails:
- Make sure minimum iOS deployment is 17.0
- Ensure all `.swift` files are added to the target (check Build Phases → Compile Sources)
- Clean build: ⌘⇧K, then ⌘B

### App crashes on photo access:
- Ensure Info.plist has `NSPhotoLibraryUsageDescription`
- On device: Settings → VerifyShot → Photos → Allow "All Photos"

### Analysis times out:
- Vercel Hobby plan has 10s timeout. Upgrade to Pro for 60s.
- Or test locally: `vercel dev` (no timeout)

---

## File Structure

```
SocialMediaVerify/
├── api/                          ← Vercel serverless backend
│   ├── upload.ts                 ← POST /api/upload
│   ├── analyze.ts                ← POST /api/analyze (main endpoint)
│   ├── chat.ts                   ← POST /api/chat
│   └── job/[id].ts               ← GET /api/job/:id
├── lib/                          ← Backend business logic
│   ├── analyzer.ts               ← Main orchestrator
│   ├── ocr.ts                    ← Gemini Vision OCR
│   ├── backboard.ts              ← Backboard.io LLM operations
│   ├── biasDetection.ts          ← Multi-perspective bias analysis
│   ├── search.ts                 ← Google Custom Search
│   ├── trustScore.ts             ← Trust score algorithm
│   ├── jobStore.ts               ← Job tracking
│   └── types.ts                  ← TypeScript types
├── VerifyShot/                   ← iOS SwiftUI app
│   ├── VerifyShotApp.swift       ← App entry point
│   ├── Info.plist                ← Permissions
│   ├── Models/
│   │   ├── AnalysisModels.swift  ← Data models
│   │   └── AppState.swift        ← Observable state
│   ├── Services/
│   │   ├── APIClient.swift       ← Backend API client
│   │   └── ScreenshotDetector.swift
│   ├── Views/
│   │   ├── MainTabView.swift     ← Tab bar + navigation
│   │   ├── HomeView.swift        ← Home screen
│   │   ├── AnalysisResultView.swift ← Results display
│   │   ├── ChatView.swift        ← AI chat
│   │   ├── DeepResearchView.swift ← Deep research
│   │   └── Components/
│   │       ├── TrustScoreGauge.swift
│   │       ├── BiasSlider.swift
│   │       ├── SourceCard.swift
│   │       └── ModelConsensusRow.swift
│   └── Extensions/
│       └── ColorTheme.swift      ← Brand colors
├── package.json
├── tsconfig.json
├── vercel.json
└── .env                          ← YOUR API KEYS (create this!)
```

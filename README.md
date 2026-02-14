# VerifyShot - Screenshot Fact-Checking App

**Status:** ✅ Phase 1 Complete - All AI operations via Backboard.io

## Architecture

**Everything goes through Backboard.io:**
- ✅ **OCR** - Image text extraction via Backboard.io (Gemini Vision)
- ✅ **Claim Extraction** - Backboard.io assistant
- ✅ **Web Search** - Backboard.io tool function (optional Google Search API)
- ✅ **Analysis & Verdict** - Backboard.io assistant
- ✅ **Bias Detection** - 3 Backboard.io assistants (US-left, US-right, International)
- ✅ **Model Consensus** - Multiple models via Backboard.io
- ✅ **Chat** - Backboard.io assistant with memory

## Required API Keys

**Minimum (app works without web sources):**
- `BACKBOARD_API_KEY` - All AI operations
- `BLOB_READ_WRITE_TOKEN` - Image storage

**Optional (enables web source search):**
- `GOOGLE_SEARCH_API_KEY` - Web search
- `GOOGLE_SEARCH_ENGINE_ID` - Search engine ID

## Quick Start

1. **Set up `.env`** with `BACKBOARD_API_KEY` and `BLOB_READ_WRITE_TOKEN`
2. **Deploy backend:** `npm install && vercel`
3. **Create iOS app in Xcode** (see `RUN_INSTRUCTIONS.md`)
4. **Update `APIClient.swift`** with your Vercel URL
5. **Run on iPhone:** Connect device, press ⌘R in Xcode

See `RUN_INSTRUCTIONS.md` for detailed steps.

## Project Structure

```
SocialMediaVerify/
├── api/                    # Vercel serverless functions
│   ├── analyze.ts          # Main endpoint (upload + analyze)
│   ├── upload.ts           # Image upload
│   └── chat.ts             # AI chat
├── lib/                    # Business logic
│   ├── analyzer.ts          # Main orchestrator
│   ├── backboard.ts        # ALL AI via Backboard.io
│   ├── biasDetection.ts    # Multi-perspective bias
│   ├── search.ts           # Web search (optional)
│   ├── trustScore.ts       # Trust score algorithm
│   └── types.ts            # TypeScript types
└── VerifyShot/             # iOS SwiftUI app
    ├── Models/             # Data models
    ├── Services/            # API client, screenshot detection
    ├── Views/               # UI screens
    └── Components/          # Reusable components
```

## Features

- 📸 **Screenshot Auto-Detection** - Listens for screenshots, auto-analyzes
- 🔍 **OCR** - Extracts text from screenshots via Backboard.io
- 📊 **Trust Score** - 0-100 score with color-coded labels
- 🔎 **Source Verification** - Finds and ranks sources (if Google Search enabled)
- ⚖️ **Bias Detection** - Multi-perspective analysis (3 specialized agents)
- 🤖 **Model Consensus** - Multiple AI models agree/disagree
- 💬 **AI Chat** - Context-aware chat about the screenshot
- 🔬 **Deep Research** - Full analysis view with timeline

## Tech Stack

- **Backend:** Vercel Serverless (TypeScript)
- **AI:** Backboard.io (all LLM operations)
- **Storage:** Vercel Blob
- **iOS:** SwiftUI (iOS 17+)
- **Search:** Google Custom Search API (optional)

## License

ISC

# Product Requirements Document: VerifyShot

## Executive Summary

**VerifyShot** is an iOS fact-checking app that automatically analyzes screenshots of social media posts, news articles, or claims. It provides trust scores, source verification, bias detection, and an AI chat interface for deeper research.

**Timeline:** 24 hours (hackathon)
**Platform:** iOS (SwiftUI) + Vercel Serverless Backend
**Key Technologies:** Backboard.io, Google Gemini, iOS Screenshot Detection

---

## Core User Flow

1. **User takes screenshot** → App detects via notification or auto-loads on open
2. **User taps notification** → App opens showing screenshot + loading state
3. **Backend processes** → OCR → Claim extraction → Source search → Analysis
4. **Results displayed** → Trust score + sources in bottom sheet
5. **User taps "Ask AI"** → Opens chat with screenshot context
6. **User taps "Deep Research"** → Triggers multi-perspective analysis with specialized agents

---

## Must-Have Features (MVP)

### 1. Screenshot Auto-Detection
- Listen for `UIApplication.userDidTakeScreenshotNotification`
- On app open, check for most recent screenshot in photo library
- Fallback: Manual upload button for simulator/testing
- Show screenshot immediately while analysis runs

### 2. Analysis & Trust Score
- **OCR:** Extract text from screenshot (Google Vision API or backboard.io document processing)
- **Claim Extraction:** Use Gemini via backboard.io to extract 1-3 primary claims
- **Source Search:** Web search for each claim (custom tool or API)
- **Trust Score:** Calculate 0-100 score with label:
  - 75-100: "Likely True" (green)
  - 40-74: "Unverified / Mixed" (yellow)
  - 0-39: "Likely Misleading" (red)
- **Sources:** Display top 3-5 relevant sources with title, domain, date, snippet

### 3. Bias Detection
- Use backboard.io's portable memory to create specialized assistants:
  - **US Perspective Agent** (left-leaning)
  - **US Perspective Agent** (right-leaning)
  - **International Perspective Agent** (neutral)
- Each agent analyzes the claim and provides bias assessment
- Aggregate results into a bias slider (LEFT ↔ CENTER ↔ RIGHT)
- Show brief explanation of detected bias

### 4. AI Chat Interface
- **Regular Chat:** Context-aware chat about the screenshot
- **Deep Research Mode:** Triggers multi-agent analysis:
  - Each specialized agent (US-left, US-right, International) provides perspective
  - Aggregates responses with citations
  - Shows consensus/disagreement

### 5. UI Components
- **Full-screen image view** with screenshot
- **Bottom sheet** (swipeable) showing:
  - Trust score (large number + color)
  - One-sentence summary
  - Source list (clickable, opens Safari)
  - Buttons: [Ask AI] [Deep Research]
- **Chat overlay** with message history
- **Loading states** during analysis

---

## Technical Architecture

### iOS App (SwiftUI)
```
VerifyShot/
├── App/
│   ├── VerifyShotApp.swift
│   └── ContentView.swift
├── Screens/
│   ├── HomeView.swift (screenshot display)
│   ├── AnalysisBottomSheet.swift
│   └── ChatView.swift
├── Services/
│   ├── ScreenshotDetector.swift
│   ├── APIClient.swift
│   └── ImageUploader.swift
└── Models/
    ├── AnalysisResult.swift
    ├── Claim.swift
    └── Source.swift
```

### Backend (Vercel Serverless)
```
api/
├── upload.ts          # POST /api/upload - Accept image, return jobId
├── analyze.ts         # POST /api/analyze - Trigger backboard.io orchestration
├── job/[id].ts       # GET /api/job/[id] - Poll for results
└── chat.ts            # POST /api/chat - Handle chat messages
```

### Backboard.io Orchestration

**Assistant Setup:**
1. **Main Analysis Assistant** - Handles OCR, claim extraction, source search
2. **Bias Detection Assistants** (3 specialized):
   - US-Left Perspective (system prompt with left-leaning context)
   - US-Right Perspective (system prompt with right-leaning context)
   - International Perspective (neutral, global context)
3. **Chat Assistant** - Context-aware chat about screenshot

**Orchestration Flow:**
```
1. Upload image → Store in Vercel Blob or S3
2. Create thread with Main Analysis Assistant
3. Upload image as document → Extract OCR text
4. Extract claims (Gemini via backboard.io)
5. For each claim:
   a. Web search (custom tool or API)
   b. Source credibility scoring
   c. Bias analysis (3 specialized assistants)
6. Aggregate trust score
7. Return JSON result
```

---

## Data Models

### Analysis Result JSON
```typescript
{
  jobId: string;
  imageUrl: string;
  ocrText: string;
  claims: Array<{
    id: string;
    text: string;
    verdict: "likely_true" | "mixed" | "likely_misleading";
    trustScore: number; // 0-100
    explanation: string;
    sources: Array<{
      title: string;
      url: string;
      domain: string;
      date: string;
      credibilityScore: number;
      snippet: string;
    }>;
    biasSignals: {
      politicalBias: number; // -1 (left) to 1 (right)
      sensationalism: number; // 0-1
      overallBias: "left" | "center" | "right" | "slight_left" | "slight_right";
    };
  }>;
  aggregateTrustScore: number;
  generatedAt: string;
}
```

### Trust Score Algorithm
```
source_quality = weighted avg of source credibility (0-1) × 0.45
model_consensus = LLM confidence (0-1) × 0.30
recency_score = normalize recency (0-1) × 0.10
independent_agreement = fraction of sources agreeing (0-1) × 0.10
bias_penalty = penalty from bias signals (0-1) × -0.05

raw_score = source_quality + model_consensus + recency_score + independent_agreement - bias_penalty
trust_score = clamp(round(raw_score * 100), 0, 100)
```

---

## Backboard.io Implementation Strategy

### 1. Main Analysis Assistant
```typescript
{
  name: "VerifyShot Analysis Assistant",
  system_prompt: `You are a fact-checking assistant. Extract claims from OCR text and analyze them against sources.`,
  tools: [
    {
      type: "function",
      function: {
        name: "web_search",
        description: "Search the web for information about a claim",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            maxResults: { type: "number", default: 5 }
          }
        }
      }
    }
  ]
}
```

### 2. Bias Detection Assistants (Portable Memory)
- Create 3 assistants with different system prompts
- Use backboard.io memory to store country/perspective context
- Each assistant analyzes the same claim independently
- Aggregate results for bias assessment

### 3. Chat Assistant
- System prompt includes screenshot context (claims + sources)
- Memory enabled to remember conversation
- Tool: `deep_research` function that triggers multi-agent analysis

---

## API Endpoints

### POST `/api/upload`
- Accepts: `multipart/form-data` with image file
- Returns: `{ imageUrl: string, jobId: string }`
- Stores image in Vercel Blob

### POST `/api/analyze`
- Accepts: `{ imageUrl: string }`
- Triggers backboard.io orchestration
- Returns: `{ jobId: string }`

### GET `/api/job/[id]`
- Returns: `{ status: "pending" | "completed" | "error", result?: AnalysisResult }`
- iOS polls every 2 seconds until completed

### POST `/api/chat`
- Accepts: `{ jobId: string, message: string, mode: "regular" | "deep_research" }`
- Returns: `{ response: string, sources?: Array<Source> }`

---

## UI/UX Requirements

### Home Screen
- Full-screen screenshot display
- Loading spinner overlay during analysis
- Bottom sheet (hidden initially, swipe up to reveal)
- Pull-to-refresh to re-analyze

### Bottom Sheet
- **Trust Score Section:**
  - Large number (0-100) with color coding
  - Label: "Likely True" / "Unverified" / "Likely Misleading"
  - Optional: Breakdown visualization (source quality, consensus, etc.)
- **Summary Section:**
  - 2-line explanation of verdict
- **Sources Section:**
  - List of 3-5 sources
  - Each item: Title, domain, date, snippet
  - Tap to open in Safari
- **Bias Detection Section:**
  - Slider: LEFT ↔ CENTER ↔ RIGHT
  - Brief explanation text
- **Action Buttons:**
  - [Ask AI] - Opens chat overlay
  - [Deep Research] - Triggers multi-agent analysis

### Chat View
- Message bubbles (user/AI)
- AI responses include source citations
- Input field at bottom
- Mode toggle: "Regular Chat" / "Deep Research"
- Loading indicator during AI response

---

## Acceptance Criteria

1. ✅ Screenshot auto-detection works on physical iPhone
2. ✅ Upload → Analysis completes within 10 seconds
3. ✅ Trust score displays correctly with color coding
4. ✅ At least 3 sources displayed and clickable
5. ✅ Bias detection shows slider with explanation
6. ✅ Chat interface responds with source citations
7. ✅ Deep Research mode triggers multi-agent analysis
8. ✅ All API calls use backboard.io for LLM operations

---

## Constraints & Assumptions

- **24-hour timeline:** Prioritize working MVP over perfection
- **Backboard.io:** Use for all LLM operations (Gemini via backboard.io)
- **OCR:** Use Google Vision API or backboard.io document processing
- **Web Search:** Custom tool function or external API (Bing/Custom Search)
- **Image Storage:** Vercel Blob (free tier) or S3
- **Testing:** Simulator fallback with manual upload

---

## Open Questions

1. Does backboard.io support image uploads directly, or do we need Google Vision for OCR?
2. What web search API should we use? (Bing, Google Custom Search, or custom tool?)
3. How should we structure the multi-agent bias detection? (Sequential or parallel?)
4. Should trust score breakdown be shown in MVP or v2?

---

## Next Steps

1. ✅ Create PRD (this document)
2. Create detailed roadmap
3. Set up project structure
4. Implement Phase 1: Screenshot detection + upload
5. Implement Phase 2: Backend orchestration
6. Implement Phase 3: iOS UI
7. Testing & demo preparation

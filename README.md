# VerifyShot – Screenshot-Based Fact Checking for iOS

## Overview
VerifyShot is an iOS application that analyzes screenshots of social media posts, news articles, or claims and evaluates their credibility. The app extracts text from screenshots, identifies factual claims, verifies them against real sources, detects bias, and returns a trust score with citations and AI-powered explanations.

---

## Core Features
- Automatic screenshot detection and upload  
- OCR-based text extraction from images  
- Claim extraction and verification using multiple AI models  
- Source search with real web citations  
- Bias detection from multiple political perspectives  
- Trust score (0–100%) with labeled verdicts  
- AI chat with Standard and Deep Research modes  

---

## User Flow
1. User takes a screenshot  
2. App detects the screenshot and loads it automatically  
3. Screenshot is uploaded to the backend  
4. Backend performs:
   - OCR (Gemini Vision)  
   - Claim extraction (GPT-4o-mini)  
   - Source search (Perplexity AI)  
   - Claim verification (GPT-4o + Claude)  
   - Bias detection (three perspectives)  
   - Trust score calculation  
5. App displays:
   - Trust score  
   - Summary  
   - Claims and verdicts  
   - Sources  
   - Bias indicators  
6. User can chat with the AI using the screenshot context  

---

## Architecture

### iOS Client (SwiftUI)
- Detects screenshots using `UIApplication.userDidTakeScreenshotNotification`  
- Displays screenshot preview and analysis results  
- Provides chat interface with Deep Research mode  

### Backend (Vercel Serverless)
- `/api/analyze` – image upload and analysis trigger  
- `/api/job/[id]` – polling for analysis results  
- `/api/chat` – contextual AI chat  

### AI Orchestration
- OCR: Gemini Vision  
- Claim extraction: GPT-4o-mini  
- Source search: Perplexity AI  
- Verification: GPT-4o and Claude 3.5 Sonnet  
- Bias detection: three model perspectives  
- Chat and memory: Backboard.io  

---

## Trust Score Formula
Trust Score =  
(Source Quality 40% + Model Consensus 30% + Confidence 20% + Recency Bonus 5% + Independent Agreement 5%) – Bias Penalty  

### Score Labels
- **75–100%:** Likely True  
- **40–74%:** Mixed or Unverified  
- **0–39%:** Likely Misleading  

---

## Tech Stack
- **iOS:** SwiftUI, PhotosPicker, UserNotifications  
- **Backend:** TypeScript, Vercel Serverless Functions  
- **AI:** Backboard.io, Gemini Vision, Perplexity AI  
- **Storage:** Vercel Blob  
- **Models:** GPT-4o, Claude 3.5 Sonnet, GPT-4o-mini  

---

## Status
- Runs locally on physical iPhone via Xcode  
- Full source code available on GitHub  
- Built for hackathon use and live demo  


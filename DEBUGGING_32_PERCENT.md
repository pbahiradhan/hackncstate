# Debugging: Trust Score Stuck at 32%

## Problem
Trust score is consistently 32% regardless of input. This suggests:
1. Backboard response not being parsed correctly
2. Confidence values defaulting to 0.5
3. Sources not being found
4. Response structure mismatch

## How to Debug

### 1. Check Vercel Function Logs

Look for these log messages in order:

#### Step 1: API Response
```
[Backboard] Full API response keys: [...]
[Backboard] Response status: ...
[Backboard] Response content type: ...
[Backboard] Response content preview: ...
```

**What to check:**
- Does `resp.content` exist?
- Is the response structure what we expect?

#### Step 2: Content Extraction
```
[Backboard] Extracted content length: ...
[Backboard] Content preview: ...
```

**What to check:**
- Is content being extracted correctly?
- Does it contain JSON?

#### Step 3: JSON Parsing
```
[Backboard] ✅ Parsed JSON successfully
[Backboard] Parsed keys: [...]
[Backboard] Claims count: ...
[Backboard] Claim 1: { text: ..., verdict: ..., confidence: ... }
```

**What to check:**
- Are claims being parsed?
- What is the confidence value? (Should NOT be 0.5)
- Is verdict correct?

#### Step 4: Confidence Validation
```
[Backboard] ✅ Claim 1 confidence: 0.85
```
OR
```
[Backboard] ⚠️ Claim 1 has default confidence 0.5
```

**If you see the warning:**
- Backboard is not returning proper confidence values
- Check the prompt - it might not be clear enough
- The response might not be in the expected format

#### Step 5: Trust Score Calculation
```
[TrustScore] Calculation: {
  sourceQuality: 0.XX,
  modelConsensus: 0.XX,
  recency: 0.XX,
  agreement: 0.XX,
  biasPenalty: 0.XX,
  raw: 0.XX,
  finalScore: XX,
  sourceCount: X
}
```

**What to check:**
- `modelConsensus` should be 0.6-0.9, NOT 0.5
- `sourceCount` - are sources being found?
- `sourceQuality` - if 0, sources aren't being found or have no credibility scores

### 2. Common Issues

#### Issue: Confidence Always 0.5
**Cause:** Backboard not returning confidence in response
**Fix:** 
- Check Backboard response structure
- Improve prompt to be more explicit
- Check if response is being parsed correctly

#### Issue: No Sources Found
**Cause:** Google Search API keys not set or search failing
**Fix:**
- Check `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID` are set
- Check search is not failing silently
- Trust score will be lower without sources (relies more on model consensus)

#### Issue: Response Structure Mismatch
**Cause:** Backboard API response format changed
**Fix:**
- Check logs for "Unexpected response structure"
- Update response parsing to match actual format
- Check Backboard API docs for current format

### 3. Expected Values

**Good Analysis:**
- Confidence: 0.7-0.9
- Trust Score: 60-90%
- Sources: 3-5 found
- Claims: 1-3 extracted

**Bad Analysis (32% score):**
- Confidence: 0.5 (default)
- Trust Score: ~32% (0.5 * 0.5 * 100 + small adjustments)
- Sources: 0 found
- Claims: Might be using fallback

### 4. Quick Fixes

1. **If confidence is 0.5:**
   - Check Backboard response in logs
   - Verify prompt is clear about returning confidence
   - Check JSON parsing is working

2. **If no sources:**
   - Set Google Search API keys
   - Check search query is valid
   - Verify search API is working

3. **If response structure wrong:**
   - Check logs for actual response structure
   - Update parsing code to match
   - Verify Backboard API hasn't changed

## Next Steps

1. Upload a screenshot
2. Check Vercel logs immediately after
3. Look for the log messages above
4. Identify which step is failing
5. Fix that specific issue

The detailed logging should now show exactly where the problem is!

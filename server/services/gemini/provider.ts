import { GoogleGenAI } from '@google/genai'
import { env, getServiceConfigStatus } from '../../config/env'
import { DocumentSection, Finding } from '../../types'
import { geminiAnalysisResponseSchema, GeminiAnalysisResponse } from './schema'
import { withTimeout, withRetry } from './errorHandler'
import { ServiceNotConfiguredError } from '../errors'

let geminiClient: GoogleGenAI | null = null

function getGeminiClient(): GoogleGenAI | null {
  if (!env.GEMINI_API_KEY) return null
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
  }
  return geminiClient
}

export async function analyzeDraftWithGemini(
  draftText: string,
  candidateSections: (DocumentSection & { documentName: string; documentVersion: string })[]
): Promise<GeminiAnalysisResponse | null> {
  const status = getServiceConfigStatus()

  if (!status.gemini.configured) {
    if (!env.ALLOW_DEV_FALLBACK) {
      throw new ServiceNotConfiguredError('Google Gemini AI', status.gemini.missingVars)
    }
    // In dev fallback mode, return null to signal local deterministic RAG execution
    return null
  }

  const ai = getGeminiClient()
  if (!ai) return null

  const prompt = `
You are BrandOS AI, an enterprise brand governance platform.
Analyze the following marketing draft against the provided approved brand guideline passages.

MARKETING DRAFT:
"""
${draftText}
"""

APPROVED BRAND GUIDELINE PASSAGES:
${candidateSections
  .map(
    (sec, idx) => `
--- GUIDELINE [${idx + 1}] ---
Document: "${sec.documentName}" (${sec.documentVersion})
Section: ${sec.heading} (Page ${sec.pageNumber})
Passage:
"${sec.extractedText}"
`
  )
  .join('\n')}

INSTRUCTIONS:
1. Identify all verifiable claims, promises, efficacy declarations, or sustainability assertions made in the draft.
2. For each claim, determine if it is:
   - "verified": Directly supported and substantiated by the guideline passage.
   - "contradicted": In direct violation of an explicit brand rule, FDA/FTC mandate, or clinical limitation.
   - "needs_verification": Evidence in guidelines is inconclusive, incomplete, or requires external audit proof.
3. For "contradicted" or "needs_verification" claims, generate a constructive, compliant suggested correction.
4. Set character startIndex and endIndex corresponding to the exact claim substring in the draft.
5. Provide a realistic confidence score (0-100).
6. ALWAYS reference the exact document name, page number, section heading, and verbatim passage from the guidelines provided above.
7. Return strictly valid JSON adhering to the required schema with a "findings" array.
`

  const callApi = async () => {
    // Call Gemini API using modern @google/genai models.generateContent with responseSchema
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1, // High precision & low hallucination
      },
    })

    const rawText = response.text || ''
    const parsedJson = JSON.parse(rawText)
    return geminiAnalysisResponseSchema.parse(parsedJson)
  }

  return withTimeout(withRetry(callApi, 2, 1000), env.GEMINI_TIMEOUT_MS)
}

/**
 * Real Gemini API error bodies, captured on 2026-10-16 with a deliberately
 * fake "AQ." key (no real credential involved).
 */

/** POST models/gemini-flash-latest:streamGenerateContent with x-goog-api-key. */
export const NATIVE_INVALID_AQ_KEY = JSON.stringify({
  error: {
    code: 401,
    message: "API key not valid. Please pass a valid API key.",
    status: "UNAUTHENTICATED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "ACCESS_TOKEN_TYPE_UNSUPPORTED",
        metadata: {
          method: "google.ai.generativelanguage.v1beta.GenerativeService.StreamGenerateContent",
          service: "generativelanguage.googleapis.com",
        },
      },
    ],
  },
});

/** POST /v1beta/openai/chat/completions with Authorization: Bearer (previous JARVIS code). */
export const OPENAI_COMPAT_INVALID_AQ_KEY = `[{
  "error": {
    "code": 400,
    "message": "Invalid Auth key.",
    "status": "INVALID_ARGUMENT"
  }
}
]`;

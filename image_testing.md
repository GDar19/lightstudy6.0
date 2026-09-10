# Image Integration Testing Playbook (Gemini vision via Emergent Universal Key)

## TEST AGENT PROMPT – IMAGE INTEGRATION RULES
You are the Test Agent responsible for validating image integrations. Follow these rules exactly. Do not overcomplicate.

### Image Handling Rules
- Always use base64-encoded images for all tests and requests.
- Accepted formats: JPEG, PNG, WEBP only.
- Do not use SVG, BMP, HEIC, or other formats.
- Do not upload blank, solid-color, or uniform-variance images.
- Every image must contain real visual features — objects, edges, textures, or shadows (e.g. a real diagram/graph or a photo of handwriting).
- If the image is not PNG/JPEG/WEBP, transcode it to PNG or JPEG before upload.
  - If you read a .jpg but the content is actually PNG after conversion/compression — this is invalid. Always re-detect and update the MIME after transformations.
- If the image is animated (GIF, APNG, animated WEBP), extract the first frame only.
- Resize large images to reasonable bounds (avoid oversized payloads).

## Model / library
- Library: `emergentintegrations.llm.chat` (LlmChat, UserMessage, ImageContent, FileContentWithMimeType).
- Provider/model: gemini / `gemini-3-flash-preview` (fast) and `gemini-3.1-pro-preview` (complex reasoning / handwriting analysis).
- Key: EMERGENT_LLM_KEY (universal key) from backend/.env.
- Attach images via `UserMessage(text=..., file_contents=[ImageContent(image_base64=...)])`.

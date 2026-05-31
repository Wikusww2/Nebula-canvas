# Nebula Canvas audit report

## Status

Frontend checks pass in this environment:

```bash
npm test
npm run build --workspace=@nebula/frontend
```

Backend build was improved to run `prisma generate` before `tsc`, but I could not complete that backend build in the sandbox because Prisma attempted to download its query engine from `binaries.prisma.sh` and the sandbox could not resolve that host. This is an environment/network limitation, not a TypeScript error from the patched source.

## Bugs fixed

1. Removed direct browser-side Gemini SDK usage from `packages/frontend/services/geminiService.ts`.
   - The old file imported `@google/genai` without listing it in `package.json`.
   - It also encouraged exposing API keys to the browser.
   - The replacement uses the existing backend proxy endpoints.

2. Fixed accidental dragging when clicking node controls.
   - Buttons, links, selects, inputs, and textareas no longer initiate block dragging.

3. Fixed keyboard shortcut leakage.
   - `T`, `I`, `Delete`, `Backspace`, and run/duplicate shortcuts now only work in canvas mode.

4. Fixed stale-state logic.
   - Editing prompts or image captions marks non-input blocks stale and clears prior generated text.
   - Downstream blocks are marked stale correctly.

5. Fixed global mouse-up stale closure.
   - The global mouse-up listener now uses a memoized current handler, so snap-to-grid preference changes are respected.

6. Fixed unhelpful generation errors.
   - Error toast now surfaces the actual backend/API error message where possible.

7. Fixed root test script.
   - `npm test` now runs the real frontend type-check instead of a missing workspace test script.

## Functionality added

1. Text nodes now show their latest generated output inside the node.
2. Image nodes now include editable image prompt/caption textareas.
3. Asset panel now supports:
   - image file validation,
   - max-size guard,
   - upload input reset,
   - read-error handling,
   - asset download,
   - asset removal.
4. Backend now has `/api/health` for provider-key visibility.
5. Backend prompt input is trimmed and capped to reduce accidental huge payloads.
6. OpenAI image generation now respects a valid selected `gpt-image-*` model instead of always forcing one hard-coded model.
7. Prisma schema now includes cascade deletes and indexes for project, canvas, block, connection, generation, and asset relations.
8. `.env.example` was added for a cleaner first-run setup.

## UX improvements

1. Normal text blocks now clearly distinguish prompt input from generated result.
2. Image prompts are editable where the image is shown, reducing hidden configuration friction.
3. Asset rows now expose apply, download, and delete actions in one place.
4. Backend/API failures are easier to diagnose from the UI.
5. Context menu wording now matches the actual model providers instead of referencing Flux/Stable Diffusion.

## Verification performed

Passed:

```bash
npm test
npm run build --workspace=@nebula/frontend
curl http://127.0.0.1:3000
```

Not fully completed in sandbox:

```bash
npm run build --workspace=@nebula/backend
```

Reason: Prisma engine download failed with DNS/network error for `binaries.prisma.sh` in this sandbox.

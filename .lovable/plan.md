## Doel
Een 1:1 WhatsApp-look-alike chat-app bouwen, gebaseerd op de MIT-licensed repo `u1759629304-ctrl/Whatsapp`, draaiend in dit TanStack Start project. AI volledig via **Lovable AI Gateway** (geen losse Gemini key nodig). Bel-functie wordt zichtbaar uitgeschakeld.

## Wat ik 1:1 vendor (onveranderd, met originele MIT `LICENSE` in repo)
- `src/App.tsx` — volledige WhatsApp UI (chat-lijst, bubbels, header, input, modals)
- `src/index.css` — WhatsApp kleurthema + scrollbars + message-tails
- `src/lib/audioUtils.ts` — PCM encode/decode helpers
- `src/lib/memoryService.ts` — `idb-keyval` opslag voor "gespreksgeheugen"
- `src/lib/preloadVideo.ts` — preload van de achtergrond-video
- `LICENSE` + `NOTICE`-regel met bronvermelding

## Wat ik moet herschrijven (omdat `@google/genai` niet via de gateway gaat)
- `src/lib/useGeminiChat.ts`: zelfde **publieke hook-API** (`messages`, `sendMessage`, `regenerate`, `imageState`, …) maar intern:
  - Chat: server-functie `chat()` → Lovable Gateway, model `google/gemini-3-flash-preview`
  - Titel/samenvatting: zelfde gateway, `google/gemini-3-flash-preview`
  - Beelden: server-functie `generateImage()` → Lovable Gateway `/v1/images/generations`, model `openai/gpt-image-2`, `quality:"low"`, niet-streamed (eerst werkende variant)
  - TTS van originele code wordt uitgeschakeld (gateway-TTS-route is anders en niet nodig voor MVP)
  - Function-calling/tools van upstream wordt vereenvoudigd naar een regex-trigger op `[GENERATE_IMAGE: ...]` zodat afbeeldingen blijven werken
- `src/lib/useLiveCall.ts`: vervangen door een stub-hook met `startCall` die een toast/modal toont: "Bellen vereist een directe Gemini API key — niet beschikbaar in deze build." Alle aanroepvlakken vanuit `App.tsx` blijven werken.

## TanStack-integratie
- `src/routes/index.tsx` rendert de WhatsApp `App`-component fullscreen (geen extra layout).
- `src/routes/__root.tsx`: `<title>WhatsApp — Gerda</title>` en de upstream `<link rel="preload" as="fetch" href="https://i.imgur.com/eCBZgoo.mp4" crossorigin>` toevoegen.
- Server-functies in `src/lib/ai.functions.ts` + helper `src/lib/ai-gateway.server.ts` (gateway-provider uit knowledge).
- Image-route `src/routes/api/generate-image.ts` voor de `gpt-image-2` call (niet streaming).

## Dependencies
`bun add @google/genai-types? nee` — alleen wat echt nodig is:
- `idb-keyval`, `lucide-react`, `motion`, `emoji-picker-react`
- (We laten `@google/genai`, `express`, `dotenv`, `@tailwindcss/vite` weg — niet nodig in TanStack)

## Bel-functie UI
- De bel/video-knoppen in de header blijven staan (1:1 met upstream UI).
- Klikken triggert een dialog: *"Bellen is uitgeschakeld in deze build."*

## Niet meegenomen (expliciet)
- Live WebSocket-bel-API
- Server (`express`) uit upstream — TanStack heeft eigen server-routes
- Self-injection van `process.env.GEMINI_API_KEY` — niet nodig

## Risico's / verwachtingen
- Upstream `App.tsx` is ~2400 regels en is geschreven tegen de oude hook-signatures. Ik **moet** de nieuwe `useGeminiChat`-hook 100% binair compatibel maken qua return-shape, anders breekt de UI. Als ik tijdens implementatie merk dat een feld ontbreekt, voeg ik 'm toe — geen UI-aanpassingen.
- Function-calling-features uit upstream (bv. Gemini die zelf afbeeldingen aanvraagt) worden gemimickt via een prompt-conventie. Werkt voor 95% van de gevallen.
- gpt-image-2 levert PNG terug, upstream verwacht een data-URL of blob; ik converteer naar data-URL zodat bestaande UI ongewijzigd blijft.

## Stappen
1. `bun add idb-keyval lucide-react motion emoji-picker-react`
2. `LICENSE` + bron-NOTICE plaatsen
3. Vendor `App.tsx`, `index.css`, `audioUtils.ts`, `memoryService.ts`, `preloadVideo.ts` onveranderd
4. Schrijf nieuwe `useGeminiChat.ts` en stub `useLiveCall.ts` met identieke export-signatures
5. `ai-gateway.server.ts` + `ai.functions.ts` + `api/generate-image.ts`
6. Mount in `routes/index.tsx`, update `__root.tsx`
7. Smoke-test: build + Playwright screenshot van de chat-UI

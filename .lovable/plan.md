Probleem
De AI Recorder in `/opname` stuurt de hele opname in één keer naar `https://ai.gateway.lovable.dev/v1/audio/transcriptions`. Bij een opname van 25:34 minuten krijgt de gebruiker een 400-fout:

```
Total number of tokens in instructions + audio is too large for this model
```

De STT-modellen hebben een maximum aan audio-tokens per request. De oplossing is de opname in korte, zelfstandige audiofragmenten te splitsen, elk fragment apart te transcriben en de resultaten aan elkaar te plakken.

Oplossing

1. Client-side: opname in WAV-fragmenten knippen
   - Bewaar de hele opname zoals nu met `MediaRecorder`.
   - Na `stop()` decodeer de blob met `AudioContext.decodeAudioData()`.
   - Splits het gedecodeerde audio-buffer in fragmenten van maximaal 5 minuten (instelbaar, zie punt 4).
   - Encodeer elk fragment naar een correct WAV-bestand (16-bit mono) via een zuivere JS-encoder, zodat we geen nieuwe native/wasm-afhankelijkheid nodig hebben.
   - Upload elk fragment naar Supabase Storage onder `call-recordings/` met een suffix (`_chunk_0`, `_chunk_1`, etc.).

2. Server function: chunked transcription
   - Wijzig `processCallRecording` in `src/lib/call-recorder.functions.ts` zodat het één of meer chunk-paths accepteert.
   - Voor elke chunk:
     - Download het fragment via `supabaseAdmin.storage`.
     - POST naar `/v1/audio/transcriptions` met `model: openai/gpt-4o-mini-transcribe` en `language: nl`.
     - Concateneer de resultaten met spaties/tussenruimte.
   - Als één chunk faalt, sla de status op als error en toon een duidelijke melding; retry werkt op alle chunks.
   - Analyseer vervolgens het samengevoegde transcript met de bestaande `google/gemini-2.5-flash` prompt.

3. UI/UX-aanpassingen in `src/routes/_authenticated/opname.tsx`
   - Toon tijdens het uploaden/processor een voortgang: "Opname in delen verwerken (deel 2 van 5)".
   - Bij een 400/input_too_large geen technische JSON meer tonen, maar een heldere melding: "Deze opname is te lang voor één transcriptie en wordt automatisch in delen verwerkt."
   - Zorg dat retry een chunked retry doet, niet opnieuw de hele blob in één request stuurt.

4. Instelbare chunk-grootte
   - Voeg een veld `call_recording_chunk_minutes` (default 5) toe aan de organisatie-instellingen of het regelscherm, zodat de gebruiker de chunkgrootte kan verhogen/verlagen indien nodig.
   - De server valideert dat de waarde tussen 1 en 10 minuten ligt.

5. Testen
   - Voeg een unit-achtige check toe die controleert dat de WAV-encoder een geldig header produceert.
   - Test in de preview met een opname van 10+ minuten (simuleren door een stil lang WAV-bestand of door de chunkgrootte tijdelijk te verkleinen).

Gewijzigde bestanden
- `src/lib/call-recorder.functions.ts` (chunked transcription)
- `src/routes/_authenticated/opname.tsx` (chunking, upload, progress UI)
- `src/lib/wav-encoder.ts` (nieuw: pure JS WAV encoder)
- `src/routes/_authenticated/opname.regels.tsx` (optioneel: chunk-minuten instelling)

Niet-gewijzigd
- De analyse-prompt en taak/stage-logica blijft hetzelfde.
- De opname-UI blijft functioneel hetzelfde, alleen wordt de progressie duidelijker.

Risico's / aandacht
- De Web Audio API `decodeAudioData` werkt alleen op de client; server-side decoding vermijden we.
- Worker runtime (Cloudflare) kan geen ffmpeg gebruiken; daarom doen we alles in de browser.
- Geen extra audio-bibliotheken toevoegen; we implementeren WAV-encoding zelf om bundelgrootte en compatibiliteit te sparen.
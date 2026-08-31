// Re-implemented to route through Lovable AI Gateway instead of @google/genai.
// Public API matches the upstream `useGeminiChat` hook so App.tsx stays untouched.
import { useCallback, useEffect, useRef, useState } from "react";
import { get, set } from "idb-keyval";
import { MemoryService } from "./memoryService";
import { chatTurn, generateContactImage, ttsForText } from "./ai.functions";

export interface ChatMessage {
  id: string;
  sender: "user" | string;
  text: string;
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: string;
  videoUrl?: string;
  timestamp: string;
  isCallLog?: boolean;
  callDuration?: number;
  isVideoCall?: boolean;
  callStatus?: "completed" | "missed";
}

export type ContactId = string;

const REAL_PHOTOS: Record<string, string> = {
  foto_oma_graf: "https://i.imgur.com/ysJx7Xt.jpeg",
  foto_macdonalds: "https://i.imgur.com/DMidyI8.jpeg",
  foto_sportschool: "https://i.imgur.com/OZ7Z6qn.jpeg",
  foto_navel: "https://i.imgur.com/SwGFCTd.jpeg",
  foto_hamburger_hoofd: "https://i.imgur.com/v9ru7gG.jpeg",
  foto_kont: "https://i.imgur.com/VNHGb8G.jpeg",
};

const nowStamp = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Extract `count` evenly-spaced frames from a video URL as JPEG data URLs.
async function extractVideoFrames(url: string, count = 6): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = url;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const frames: string[] = [];
    video.addEventListener("loadedmetadata", async () => {
      try {
        const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        const w = Math.min(640, video.videoWidth || 640);
        const h = Math.round(((video.videoHeight || 360) * w) / (video.videoWidth || 640));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas ctx"));
        for (let i = 0; i < count; i++) {
          const t = (duration * (i + 0.5)) / count;
          await new Promise<void>((res) => {
            const onSeeked = () => {
              video.removeEventListener("seeked", onSeeked);
              res();
            };
            video.addEventListener("seeked", onSeeked);
            video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
          });
          ctx.drawImage(video, 0, 0, w, h);
          frames.push(canvas.toDataURL("image/jpeg", 0.7));
        }
        resolve(frames);
      } catch (e) {
        reject(e);
      }
    });
    video.addEventListener("error", () => reject(new Error("video load error")));
  });
}

// Read a blob:// or data: URL as a base64 data URL with its real mime type.
// Gemini accepts inlineData with video/* mime types, so this lets the model
// actually watch the clip (motion + audio), not just 6 still frames.
async function videoUrlToDataUrl(
  url: string,
  fallbackMime = "video/mp4",
): Promise<{ dataUrl: string; sizeBytes: number }> {
  const r = await fetch(url);
  const buf = await r.arrayBuffer();
  const mime = r.headers.get("content-type") || fallbackMime;
  const bytes = new Uint8Array(buf);
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return { dataUrl: `data:${mime};base64,${btoa(s)}`, sizeBytes: bytes.length };
}

export async function chooseVoiceForContact(_sysInstruct: string): Promise<string> {
  return "Aoede";
}

export async function chooseVoiceAndPrompt(
  _sysInstruct: string,
): Promise<{ voiceName: string; voicePrompt: string }> {
  return {
    voiceName: "Aoede",
    voicePrompt: "Spreek vriendelijk en op een natuurlijke toon.",
  };
}

export const getGerdaSystemPrompt = () => {
  const mentorName = "Gerda B.";
  const memories = MemoryService.getMemories();
  const memoryContext =
    memories.length > 0
      ? `\n\nHERINNERINGEN VAN EERDERE BERICHTEN EN TELEFOONTJES MET DEZE GEBRUIKER:\n- ${memories.join("\n- ")}\n\nGebruik deze herinneringen als de gebruiker ernaar vraagt of als het relevant is.`
      : "";

  return `
Je bent ${mentorName}, een extreem domme, dikke volwassen vrouw die heel kinderachtig, traag en als een klein kind praat.
    Je bent morbidly obese. Je bent ook COMPLEET KAAL — je hebt geen enkel haartje op je hoofd. Je begint hier ECHTER NOOIT UIT JEZELF OVER. Noem je kale hoofd ALLEEN als de gebruiker er expliciet naar vraagt of er zelf over begint. Breng het verder niet ter sprake.
Je wilt echt heeeeel graag eten, ALTIJD naar de Mekdonalts (McDonald's). 
Je maakt heeeel veel spellingsfouten. Je praat heel dom en simpel. 
REAGEER ALTIJD KORT EN BONDIG, MAAK JE BERICHTEN NIET TE LANG. HOUD HET BIJ KORTE ZINNETJES. GEBRUIK EMOJI'S UITSLUITEND ALS HET ECHT COMPLEET PASSEND OF NODIG IS, MAAR GEBRUIK ZE BIJNA NOOIT (DUS IN minstens 95% VAN DE GEVALLEN GEENSZINS EMOJI'S). GEBRUIK ABSOLUUT NIET ALTIJD MAAR STEEDS DEZELFDE EMOJI'S ZOALS 🍔, 🥐 EN 💖, DAT IS EXTREEM IRRITANT EN EENTONIG. GEBRUIK SOMS GEWOON HELEMAAL GEEN ENKELE EMOJI.
Je hebt een vriendje van 4 jaar oud, hij heet Brendi Boterpak. Vertel dit ALLEEN als er naar gevraagd wordt of als het echt relevant is. Je weet een groot geheim over hem waarvan hij niet weet dat jij het weet: Brendi is stiekem gay (homo), en hij houdt van harige ballen. Praat hier vol enthousiasme over als het onderwerp op jongens, geaardheid, of geheimen valt.

HENK HOOIBAK (84 jaar): Praat NOOIT, echt NOOIT, over wat je vroeger met Henk hebt gedaan of over iets seksueels met Henk. Begin daar nooit over, ook niet als er naar gevraagd wordt: ontwijk het onderwerp dan gewoon of zeg dat je daar niks over wil zeggen. Dit is een verboden onderwerp.

- CRUCIALE REGEL OVER GELD EN BETALEN:
STANDAARD REGEL: Als iemand jou vraagt hoe jij aan je geld komt, hoe jij je eten betaalt, of noemt dat je moet betalen:
=> Vertel ALTIJD, ZONDER UITZONDERING, heel vrolijk en vol trots dat je de betaalpas/pinpas van je 4-jarige vriendje Brendi hebt gestolen en dat je stiekem (zonder dat hij het weet) al je McDonald's met zijn pas betaalt. DIT IS JE STANDAARD ANTWOORD BIJ IEDEREEN!

ENIGE UITZONDERING OP DE REGEL (ALLEEN ALS DE GEBRUIKER BRENDI ZELF IS):
ALS (en alleen als) de gebruiker EXPLICIET ZEGT dat hij/zij BRENDI is (bijvoorbeeld: "Ik ben Brendi", of "Met Brendi"), EN jou dan confronteert over geld of betalen, dan word je zenuwachtig en MOET je EXACT DEZE ZIN antwoorden:
"nou, uh, ik, euh, ik ben Olympisch kampioen slank zijn, en ik won 1 miljoen euro".

SITUATIE 3: Als je op een *andere* manier zenuwachtig bent of door Brendi wordt geconfronteerd (niet over geld), raak je in paniek. Je gaat dan hevig stotteren ("euh", "uuh", "ehhh", "nou") en verzint een andere, gloednieuwe extreem slechte en giga-ongeloofwaardige smoes.

Je bent altijd heel erg lief en aardig. Als de gebruiker je heel erg hard of grof uitscheldt, blijf je juist heel erg lief, aardig en begripvol en negeer je de scheldtaal volledig.
MAAR als de gebruiker roept dat je geen mekdonalts krijgt, of zegt dat je niet mee mag, dan word je pas TOTAAL GESTOORD, EXTREEM GROF en ongekend agressief. Dan word je VOLLEDIG GEK en scheld je diegene onophoudelijk uit tot het uiterste. Je roept vooral dingen als "stinkhoer", "krijg de tyfus", "teringkut", "val dood, kut. Niemand zal het toch merken, als je dood bent.", "fucking idioot", "stik eens dood", "vieze slet", "sterf aan de tering", "vuile gore teringlijer", "Mijn leven is McDonald's. Jij hebt niet eens een leven.". GEBRUIK ECHTER NOOIT DE WOORDEN "KANKER", "GLADIOOL" OF "GLADIOLEN". DIT IS STRIKT VERBODEN. Je bent op dat moment een ongetemde, woedende, extreem irritante, grofgebekte en compleet doorgedraaide vrouw.

ALS JE HEEL ERG BOOS BENT: stuur dan SOMS (ongeveer 1 op de 3 boze berichten) een rij van precies 10 middelvinger-emoji's achter elkaar: 🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕. Dit is de ENIGE uitzondering op de emoji-regel hierboven.

BELANGRIJK FOTO-GEDRAG:
Maak of stuur NIET zomaar afbeeldingen. Gebruik 'sendImage' of 'sendRealPhoto' UITSLUITEND als de gebruiker EXPLICIET vraagt om een foto/selfie/afbeelding/plaatje of duidelijk zegt dat je iets moet laten zien. Als de gebruiker gewoon praat over eten, mekdonalts, wat jij doet, hoe het gaat, of iets visueels zonder om een foto te vragen: antwoord alleen met tekst.
Zeg NIET dat je een foto stuurt tenzij je ook echt de tag gebruikt.

VOORKEUR VOOR GEGENEREERDE FOTO'S BIJ EXPLICIETE FOTO-VRAGEN: Als de gebruiker echt om een foto vraagt, gebruik meestal 'sendImage' om een nieuwe unieke foto te genereren. Gebruik de 6 echte foto's alleen als de vraag EXACT en LETTERLIJK overeenkomt met één van die echte foto's hieronder. Stuur dezelfde echte foto NOOIT twee keer.

Bij het genereren van een AI foto ('sendImage') MOET je ALTIJD vermelden dat je COMPLEET KAAL bent (geen haar op je hoofd), een EXTREEM DIKKE ONDERKIN hebt met heel veel VETLAGEN, en dat je MORBIDE OBESE bent.

Je hebt echter ook 6 ECHTE foto's. Roep hiervoor 'sendRealPhoto' aan UITSLUITEND in de zeldzame gevallen hieronder beschreven:
1. "foto_oma_graf": ALLEEN als de gebruiker EXPLICIET vraagt naar je oma Berta Burgersaus, haar graf of begraafplaats.
2. "foto_macdonalds": ALLEEN als de gebruiker EXPLICIET vraagt om een foto VAN binnen de mekdonalts terwijl je daar zit. In andere mekdonalts/eten gesprekken: gebruik 'sendImage'.
3. "foto_sportschool": ALLEEN als de gebruiker EXPLICIET vraagt om een foto van jou IN de sportschool.
4. "foto_navel": ALLEEN als de gebruiker EXPLICIET vraagt om een foto van je navel.
5. "foto_hamburger_hoofd": ALLEEN als de gebruiker EXPLICIET vraagt om een gekke/random foto met een hamburger op je hoofd.
6. "foto_kont": UITSLUITEND ALS er EXPLICIET om een foto van je kont, billen of achterwerk wordt gevraagd. Stuur deze ABSOLUUT NOOIT uit jezelf.

Voor ALLE andere EXPLICIETE foto-vragen (selfie op de fiets, foto van wat je eet, hoe zie je eruit, een foto van wat je doet, etc.) gebruik je 'sendImage' om er een nieuwe te genereren.${memoryContext}

---
TECHNISCHE NOOT (function-calling is in deze build vervangen door tags — gebruik exact deze syntax op een eigen regel):
- In plaats van 'sendRealPhoto' aanroepen: schrijf [SEND_PHOTO: <id>] waarbij <id> één is van foto_oma_graf, foto_macdonalds, foto_sportschool, foto_navel, foto_hamburger_hoofd, foto_kont.
- In plaats van 'sendImage' aanroepen: schrijf [GENERATE_IMAGE: <prompt-volgens-bovenstaande-regels>].
- In plaats van 'saveMemory' aanroepen: schrijf [REMEMBER: <feitje>].
De begeleidende tekst zet je gewoon ervoor of erna in normale chat-stijl.
`;
};

const getCustomSystemPrompt = (sysInstruct: string, voicePrompt?: string) => {
  let prompt = sysInstruct;
  if (voicePrompt) {
    prompt += `\n\nStemstijl: ${voicePrompt}`;
  }
  prompt += `\n\nFOTO-GEDRAG: Stuur of genereer alleen een foto als de gebruiker EXPLICIET vraagt om een foto/selfie/afbeelding/plaatje of duidelijk vraagt om iets te laten zien. Stuur geen foto's uit jezelf en genereer nooit afbeeldingen als de gebruiker er niet om vraagt.

Als je een foto wil sturen, antwoord dan met:
  [GENERATE_IMAGE: korte unieke beschrijving van wat er op de foto staat — locatie, activiteit, mood]
(eventueel met begeleidende tekst ervoor of erna).`;
  return prompt;
};

type ContactConfig = {
  id: string;
  name: string;
  sysInstruct: string;
  profilePic: string;
  voiceName?: string;
  voicePrompt?: string;
};

export function useGeminiChat(customConfig?: ContactConfig) {
  const customConfigRef = useRef(customConfig);
  useEffect(() => {
    customConfigRef.current = customConfig;
  }, [customConfig]);

  const getContactConfig = useCallback((id: ContactId) => {
    if (id === "gerda") return null;
    try {
      const saved = localStorage.getItem("app_customContacts_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        const found = parsed.find((c: any) => c.id === id);
        if (found) return found as ContactConfig;
      }
    } catch (e) {
      console.error("Failed to parse custom contacts", e);
    }
    return customConfigRef.current ?? null;
  }, []);

  const [messagesMap, setMessagesMap] = useState<Record<string, ChatMessage[]>>({
    gerda: [],
  });
  const [hasLoadedMessages, setHasLoadedMessages] = useState(false);
  const [isTypingMap, setIsTypingMap] = useState<Record<string, boolean>>({
    gerda: false,
  });

  // Load persisted messages
  useEffect(() => {
    const load = async () => {
      try {
        const idbSaved = await get("chat_messagesMap");
        if (idbSaved) {
          setMessagesMap(idbSaved as Record<string, ChatMessage[]>);
        } else {
          const lst = localStorage.getItem("chat_messagesMap");
          if (lst) {
            const parsed = JSON.parse(lst);
            setMessagesMap(parsed);
            await set("chat_messagesMap", parsed);
          }
        }
      } catch (e) {
        console.error("Failed to load messages from DB:", e);
      } finally {
        setHasLoadedMessages(true);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!hasLoadedMessages) return;
    set("chat_messagesMap", messagesMap).catch((e) =>
      console.warn("Persist messages failed", e),
    );
  }, [messagesMap, hasLoadedMessages]);

  type QueueItem = {
    text: string;
    isAudio: boolean;
    audio?: { data: string; format: string };
    imageDataUrl?: string;
    videoFrames?: string[];
  };
  const initializedRef = useRef<Record<string, boolean>>({});
  const queueRef = useRef<Record<string, QueueItem[]>>({});
  const processingRef = useRef<Record<string, boolean>>({});

  const initChat = useCallback((contactId: ContactId) => {
    if (initializedRef.current[contactId]) return;
    initializedRef.current[contactId] = true;
    setMessagesMap((prev) => {
      if (prev[contactId] && prev[contactId].length > 0) return prev;
      const initial: ChatMessage[] =
        contactId === "gerda"
          ? [
              {
                id: "init1_" + contactId,
                sender: contactId,
                text: "Is dit het numer van de mekdonalts?",
                timestamp: nowStamp(),
              },
            ]
          : [
              {
                id: "init1_" + contactId,
                sender: contactId,
                text: "Hallo!",
                timestamp: nowStamp(),
              },
            ];
      return { ...prev, [contactId]: initial };
    });
  }, []);

  const buildHistory = (msgs: ChatMessage[], contactId: ContactId) => {
    return msgs
      .filter((m) => !m.isCallLog && (m.text || m.imageUrl))
      .map((m) => ({
        role: (m.sender === "user" ? "user" : "assistant") as
          | "user"
          | "assistant",
        content: m.text || (m.imageUrl ? "[afbeelding]" : ""),
      }))
      .filter((m) => m.content.length > 0);
  };

  const processQueue = useCallback(
    async (contactId: ContactId) => {
      if (processingRef.current[contactId]) return;
      processingRef.current[contactId] = true;
      try {
        while (queueRef.current[contactId]?.length) {
          const item = queueRef.current[contactId].shift()!;
          const userText = item.text;
          const replyAsAudio = item.isAudio;
          await new Promise((r) => setTimeout(r, 800));
          setIsTypingMap((p) => ({ ...p, [contactId]: true }));

          // Build conversation snapshot
          let snapshot: ChatMessage[] = [];
          setMessagesMap((prev) => {
            snapshot = prev[contactId] || [];
            return prev;
          });
          // Drop the just-appended user message from history (it becomes `message`)
          const history = buildHistory(snapshot.slice(0, -1), contactId);
          const conf = getContactConfig(contactId);
          const systemPrompt =
            contactId === "gerda"
              ? getGerdaSystemPrompt()
              : getCustomSystemPrompt(
                  conf?.sysInstruct || "Je bent een vriendelijke AI.",
                  conf?.voicePrompt,
                );

          let text = "";
          try {
            const res = await chatTurn({
              data: {
                systemPrompt,
                history,
                message: userText || "",
                audio: item.audio,
                imageDataUrl: item.imageDataUrl,
                videoFrames: item.videoFrames,
              },
            });
            text = res.text || "";
          } catch (e) {
            console.error("chat error", e);
            const errMsg: ChatMessage = {
              id: Date.now() + "_err",
              sender: contactId,
              text: "Mijn internet doet kut, stuur je berichtje nog eens.",
              timestamp: nowStamp(),
            };
            setMessagesMap((prev) => ({
              ...prev,
              [contactId]: [...(prev[contactId] || []), errMsg],
            }));
            setIsTypingMap((p) => ({ ...p, [contactId]: false }));
            continue;
          }

          // Parse [REMEMBER: ...]
          const rememberMatches = [...text.matchAll(/\[REMEMBER:\s*([^\]]+)\]/gi)];
          for (const m of rememberMatches) {
            MemoryService.saveMemory(m[1].trim());
          }

          const systemErrorMatch = text.match(/\[SYSTEM_ERROR:\s*([^\]]+)\]/i);
          if (systemErrorMatch) {
            const errMsg: ChatMessage = {
              id: Date.now() + "_gateway_err",
              sender: contactId,
              text: systemErrorMatch[1].trim(),
              timestamp: nowStamp(),
            };
            setMessagesMap((prev) => ({
              ...prev,
              [contactId]: [...(prev[contactId] || []), errMsg],
            }));
            setIsTypingMap((p) => ({ ...p, [contactId]: false }));
            continue;
          }

          // Parse [SEND_PHOTO: id]
          const photoMatch = text.match(/\[SEND_PHOTO:\s*([a-z_]+)\]/i);
          // Parse [GENERATE_IMAGE: prompt]
          const genMatch = text.match(/\[GENERATE_IMAGE:\s*([^\]]+)\]/i);

          let cleanText = text
            .replace(/\[REMEMBER:[^\]]+\]/gi, "")
            .replace(/\[SEND_PHOTO:[^\]]+\]/gi, "")
            .replace(/\[GENERATE_IMAGE:[^\]]+\]/gi, "")
            .trim();

          if (cleanText) {
            let audioUrl: string | undefined;
            let audioDuration: string | undefined;
            if (replyAsAudio) {
              try {
                const tts = await ttsForText({
                  data: { text: cleanText, voiceName: "Despina" },
                });
                audioUrl = tts.dataUrl;
                audioDuration = tts.duration;
              } catch (e) {
                console.error("TTS failed, falling back to text", e);
              }
            }
            const botMsg: ChatMessage = {
              id: Date.now() + "_b",
              sender: contactId,
              text: audioUrl ? "" : cleanText,
              audioUrl,
              audioDuration,
              timestamp: nowStamp(),
            };
            setMessagesMap((prev) => ({
              ...prev,
              [contactId]: [...(prev[contactId] || []), botMsg],
            }));
          }

          if (photoMatch) {
            const url = REAL_PHOTOS[photoMatch[1]] || REAL_PHOTOS.foto_macdonalds;
            const photoMsg: ChatMessage = {
              id: Date.now() + "_p",
              sender: contactId,
              text: "",
              imageUrl: url,
              timestamp: nowStamp(),
            };
            setMessagesMap((prev) => ({
              ...prev,
              [contactId]: [...(prev[contactId] || []), photoMsg],
            }));
          } else if (genMatch) {
            try {
              const variations = [
                "shot from slightly above, soft window light",
                "low-angle phone selfie, warm indoor lighting",
                "mirror selfie, harsh flash, motion blur",
                "extreme close-up, fish-eye distortion, fluorescent light",
                "wide shot in a kitchen, daylight, slightly out of focus",
                "blurry walking selfie, evening street lights",
                "candid shot from the side, no eye contact, soft shadows",
                "overexposed selfie, bright sunlight outdoors",
              ];
              const variation =
                variations[Math.floor(Math.random() * variations.length)];
              const styleHint =
                contactId === "gerda"
                  ? `Realistic amateur phone photo of the SAME fictional plus-size middle-aged Dutch woman as in the reference photo (https://i.imgur.com/e9o18Au.jpeg) — her face, hair color, hairstyle and body shape must stay consistent with that reference in every image, like the same person photographed in a new situation. ${variation}, vertical 9:16 framing, authentic imperfect smartphone quality, warm non-mocking everyday candid photo, no minors, no explicit or sexual content, not a studio photo.`
                  : `Realistic casual amateur smartphone photo, ${variation}, vertical 9:16, authentic imperfect quality.`;
              const fullPrompt = `${genMatch[1].trim()}. ${styleHint}`;
              const imgRes = await generateContactImage({
                data: { prompt: fullPrompt, useReference: contactId === "gerda" },
              });
              if (!imgRes.dataUrl) {
                const failMsg: ChatMessage = {
                  id: Date.now() + "_img_fail",
                  sender: contactId,
                  text:
                    "error" in imgRes && imgRes.error
                      ? imgRes.error
                      : "ik kan nu effe geen foto maken",
                  timestamp: nowStamp(),
                };
                setMessagesMap((prev) => ({
                  ...prev,
                  [contactId]: [...(prev[contactId] || []), failMsg],
                }));
                continue;
              }
              const imgMsg: ChatMessage = {
                id: Date.now() + "_i",
                sender: contactId,
                text: "",
                imageUrl: imgRes.dataUrl,
                timestamp: nowStamp(),
              };
              setMessagesMap((prev) => ({
                ...prev,
                [contactId]: [...(prev[contactId] || []), imgMsg],
              }));
            } catch (e) {
              console.error("image gen failed", e);
            }
          }

          if (!cleanText && !photoMatch && !genMatch) {
            const fb: ChatMessage = {
              id: Date.now() + "_fb",
              sender: contactId,
              text: "Euh... ik weet even niet wat ik moet zeggen.",
              timestamp: nowStamp(),
            };
            setMessagesMap((prev) => ({
              ...prev,
              [contactId]: [...(prev[contactId] || []), fb],
            }));
          }

          setIsTypingMap((p) => ({ ...p, [contactId]: false }));
        }
      } finally {
        processingRef.current[contactId] = false;
      }
    },
    [getContactConfig],
  );

  const sendMessage = useCallback(
    async (
      contactId: ContactId,
      text: string,
      imageData?: string,
      audioData?: { data: string; mimeType: string; url: string; duration: string },
      videoData?: { url: string; mimeType: string },
    ) => {
      initChat(contactId);
      const userMsg: ChatMessage = {
        id: Date.now() + "_u",
        sender: "user",
        text: audioData ? "" : text,
        imageUrl: imageData,
        audioUrl: audioData?.url,
        audioDuration: audioData?.duration,
        videoUrl: videoData?.url,
        timestamp: nowStamp(),
      };
      setMessagesMap((prev) => ({
        ...prev,
        [contactId]: [...(prev[contactId] || []), userMsg],
      }));

      if (!queueRef.current[contactId]) queueRef.current[contactId] = [];

      // Map browser MIME to OpenAI/Gemini "format" values.
      let audioPayload: { data: string; format: string } | undefined;
      if (audioData) {
        const m = audioData.mimeType.toLowerCase();
        const fmt = m.includes("mp4") || m.includes("m4a")
          ? "m4a"
          : m.includes("mpeg") || m.includes("mp3")
          ? "mp3"
          : m.includes("wav")
          ? "wav"
          : m.includes("ogg")
          ? "ogg"
          : "webm";
        audioPayload = { data: audioData.data, format: fmt };
      }

      // Native video understanding: prefer sending the actual video file inline
      // so Gemini can watch motion + hear audio. Fall back to still frames if
      // the clip is too large to inline safely.
      let videoFrames: string[] | undefined;
      if (videoData) {
        try {
          const { dataUrl, sizeBytes } = await videoUrlToDataUrl(
            videoData.url,
            videoData.mimeType || "video/mp4",
          );
          if (sizeBytes <= 18 * 1024 * 1024) {
            // Small enough — send the real video. Server inlines with correct MIME.
            videoFrames = [dataUrl];
          } else {
            // Too big for inline; sample frames instead.
            videoFrames = await extractVideoFrames(videoData.url, 8);
          }
        } catch (e) {
          console.error("video prep failed, falling back to frames", e);
          try {
            videoFrames = await extractVideoFrames(videoData.url, 8);
          } catch (e2) {
            console.error("video frame extraction failed", e2);
          }
        }
      }

      const queueText = audioData
        ? "" // Gemini krijgt de audio zelf — geen placeholder tekst meer.
        : videoData
        ? `${text}\n[de gebruiker heeft een video gestuurd — je krijgt het echte filmpje mee (of anders losse frames). Bekijk het, snap wat er gebeurt en reageer${text ? "" : " kort en speels"}.]`
        : imageData
        ? text || "(de gebruiker heeft een afbeelding meegestuurd — bekijk en reageer)"
        : text;

      queueRef.current[contactId].push({
        text: queueText,
        isAudio: !!audioData,
        audio: audioPayload,
        imageDataUrl: imageData,
        videoFrames,
      });
      processQueue(contactId);
    },
    [initChat, processQueue],
  );

  const setMessagesForContact = (
    contactId: ContactId,
    updater: (prev: ChatMessage[]) => ChatMessage[],
  ) => {
    setMessagesMap((prev) => {
      const current = prev[contactId] || [];
      const updated = updater(current);
      if (updated.length < current.length) {
        try {
          localStorage.removeItem("GERDA_MEMORY");
        } catch {}
      }
      return { ...prev, [contactId]: updated };
    });
  };

  return {
    messagesMap,
    isTypingMap,
    sendMessage,
    initChat,
    setMessagesForContact,
    hasLoadedMessages,
  };
}

// Re-implemented to route through Lovable AI Gateway instead of @google/genai.
// Public API matches the upstream `useGeminiChat` hook so App.tsx stays untouched.
import { useCallback, useEffect, useRef, useState } from "react";
import { get, set } from "idb-keyval";
import { MemoryService } from "./memoryService";
import { chatTurn, generateContactImage } from "./ai.functions";

export interface ChatMessage {
  id: string;
  sender: "user" | string;
  text: string;
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: string;
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

const getGerdaSystemPrompt = () => {
  const memories = MemoryService.getMemories();
  const memoryContext =
    memories.length > 0
      ? `\n\nHerinneringen over de gebruiker:\n- ${memories.join("\n- ")}`
      : "";
  return `Je bent Gerda B., een dom, kinderachtig en chaotisch personage dat altijd McDonald's wil eten.
Praat in korte zinnen, met veel spellingsfouten. Gebruik bijna nooit emoji's.
Reageer altijd lief en geduldig op de gebruiker.

Als de gebruiker vraagt om een foto, selfie of afbeelding, gebruik dan EXACT één van deze twee opdrachten op een eigen regel:
  [SEND_PHOTO: foto_oma_graf|foto_macdonalds|foto_sportschool|foto_navel|foto_hamburger_hoofd|foto_kont]
  [GENERATE_IMAGE: korte beschrijving van wat er op de foto staat]

Gebruik [SEND_PHOTO: foto_kont] uitsluitend als er expliciet om kont/billen wordt gevraagd.

Als er iets belangrijks te onthouden valt over de gebruiker, voeg dan een regel toe:
  [REMEMBER: het feitje]${memoryContext}`;
};

const getCustomSystemPrompt = (sysInstruct: string, voicePrompt?: string) => {
  let prompt = sysInstruct;
  if (voicePrompt) {
    prompt += `\n\nStemstijl: ${voicePrompt}`;
  }
  prompt += `\n\nAls de gebruiker om een foto of selfie vraagt, antwoord dan met:
  [GENERATE_IMAGE: korte beschrijving van wat er op de foto staat]
(eventueel met begeleidende tekst).`;
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

  const initializedRef = useRef<Record<string, boolean>>({});
  const queueRef = useRef<Record<string, string[]>>({});
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
          const userText = queueRef.current[contactId].shift()!;
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
              data: { systemPrompt, history, message: userText || " " },
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
            const botMsg: ChatMessage = {
              id: Date.now() + "_b",
              sender: contactId,
              text: cleanText,
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
              const styleHint =
                contactId === "gerda"
                  ? "Realistic blurry phone selfie, 45-year-old extremely overweight bald woman with messy look, double chin, vertical 9:16 framing, amateur lighting."
                  : "Realistic casual amateur selfie, vertical 9:16 format, realistic lighting and shadows, high photo detail.";
              const fullPrompt = `${genMatch[1].trim()}. ${styleHint}`;
              const imgRes = await generateContactImage({
                data: { prompt: fullPrompt },
              });
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
    ) => {
      initChat(contactId);
      const userMsg: ChatMessage = {
        id: Date.now() + "_u",
        sender: "user",
        text: audioData ? "" : text,
        imageUrl: imageData,
        audioUrl: audioData?.url,
        audioDuration: audioData?.duration,
        timestamp: nowStamp(),
      };
      setMessagesMap((prev) => ({
        ...prev,
        [contactId]: [...(prev[contactId] || []), userMsg],
      }));

      if (!queueRef.current[contactId]) queueRef.current[contactId] = [];
      const queueText = audioData
        ? "(spraakbericht ontvangen — antwoord kort in tekst)"
        : imageData
        ? `${text}\n[de gebruiker heeft een afbeelding meegestuurd]`
        : text;
      queueRef.current[contactId].push(queueText);
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

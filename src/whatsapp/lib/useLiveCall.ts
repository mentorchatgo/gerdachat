// Stub for the upstream Gemini Live ("bellen") hook.
// Lovable AI Gateway does not expose the Gemini Live WebSocket API, so calling
// is intentionally disabled in this build. UI surfaces remain available.
import { useCallback, useState } from "react";

export type CallState = "idle" | "calling" | "connected";

export function useLiveCall(_customConfig?: {
  name: string;
  sysInstruct: string;
  voiceName?: string;
  voicePrompt?: string;
}) {
  const [callState] = useState<CallState>("idle");
  const [callError, setCallError] = useState<string | null>(null);

  const startCall = useCallback((_contactId: string, _isVideo: boolean) => {
    setCallError(
      "Bellen is uitgeschakeld in deze build (Gemini Live API niet beschikbaar via Lovable Gateway).",
    );
    setTimeout(() => setCallError(null), 100);
  }, []);

  const endCall = useCallback(() => {}, []);
  const sendCallMessage = useCallback((_text: string) => {}, []);
  const getRemoteVolume = useCallback(() => 0, []);
  const sendVideoFrame = useCallback((_b64: string) => {}, []);

  return {
    callState,
    callError,
    startCall,
    endCall,
    sendCallMessage,
    getRemoteVolume,
    sendVideoFrame,
  };
}

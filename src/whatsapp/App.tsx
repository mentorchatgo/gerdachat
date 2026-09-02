// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { Phone, Video, MoreVertical, Search, Paperclip, Smile, Mic, Send, PhoneOff, ChevronDown, UserPlus, MessageSquare, CircleDashed, Users, Archive, Settings, ArrowLeft, Bell, Lock, Plus, PhoneOutgoing, Key, LayoutList, RotateCw, Accessibility, Globe, HelpCircle, Infinity, PlusCircle, X, Trash2, Copy, Download } from 'lucide-react';
import { useGeminiChat, chooseVoiceForContact, chooseVoiceAndPrompt } from './lib/useGeminiChat';
import { useLiveCall } from './lib/useLiveCall';
import { preloadVideoFrames, globalFrames } from './lib/preloadVideo';

const GERDA_AVATAR = 'https://i.imgur.com/e9o18Au.jpeg';

const GERDA_OVERLAY = "https://i.imgur.com/eOdHElW.gif";
const GERDA_VIDEO = "https://i.imgur.com/eCBZgoo.mp4";

const ME_AVATAR = 'https://as1.ftcdn.net/v2/jpg/00/28/08/40/1000_F_28084010_bGRJetPfBwNcO3YuRC2C3Pz7qASocWQ4.jpg';

export interface CallRecord {
  id: string;
  timestamp: string;
  duration: number;
  type: 'outgoing' | 'incoming';
  status: 'completed' | 'missed';
  contactId?: ContactId;
}

export type ContactId = string;

export type CustomContactConfig = {
  id: string;
  name: string;
  sysInstruct: string;
  profilePic: string;
  isConfigured: boolean;
  voiceName?: string;
  voicePrompt?: string;
  phoneNumber?: string;
  bio?: string;
};

const defaultCustomConfig: CustomContactConfig = {
  id: 'custom',
  name: "aangepast contact",
  sysInstruct: "Je bent een vriendelijke AI.",
  profilePic: "https://ui-avatars.com/api/?name=Aangepast+Contact&background=random",
  isConfigured: false,
  voiceName: 'Aoede',
  voicePrompt: "Spreek heel vriendelijk en op een natuurlijke, rustige toon.",
  phoneNumber: "06-12345678",
  bio: "Hoi! Ik gebruik WhatsApp."
};

const TypingIndicator = () => (
  <div className="flex justify-start mt-0.5">
    <div className="bg-[var(--color-wa-panel)] text-[#e9edef] px-3 py-2 rounded-lg rounded-tl-none shadow-sm msg-tail-in relative min-w-[50px] flex items-center justify-center gap-1 h-[32px]">
      <motion.div
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 0.8, repeat: Infinity, delay: 0 }}
        className="w-1.5 h-1.5 bg-[#8696a0] rounded-full"
      />
      <motion.div
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }}
        className="w-1.5 h-1.5 bg-[#8696a0] rounded-full"
      />
      <motion.div
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }}
        className="w-1.5 h-1.5 bg-[#8696a0] rounded-full"
      />
    </div>
  </div>
);

const MockAudioVisualizer = ({ playedPercent = 0 }: { playedPercent?: number }) => {
  // Generate random bar heights for visualizer
  const bars = Array.from({ length: 30 }).map((_, i) => {
    // some pseudo-random curve
    const height = 4 + Math.sin(i * 0.5) * 8 + Math.random() * 6;
    const isPlayed = (i / 30) * 100 <= playedPercent;
    return (
      <div 
        key={i} 
        className="w-[3px] rounded-full mx-[1px] transition-colors duration-150" 
        style={{ 
          height: `${Math.max(3, height)}px`,
          backgroundColor: isPlayed ? '#00a884' : 'rgba(134, 150, 160, 0.4)'
        }} 
      />
    );
  });

  return (
    <div className="flex items-center h-8 ml-3 flex-1 overflow-hidden">
      {bars}
    </div>
  );
};

const AudioMessagePlayer = ({ avatar, duration, isMe, audioUrl }: { avatar: string, duration?: string, isMe?: boolean, audioUrl?: string }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [totalDuration, setTotalDuration] = useState(duration || "0:01");

  useEffect(() => {
    if (audioUrl && audioUrl !== 'mock') {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      const onTimeUpdate = () => {
        setCurrentTime(audio.currentTime);
      };
      
      const onEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };

      const onLoadedMetadata = () => {
        const sec = Math.floor(audio.duration);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        setTotalDuration(`${m}:${s < 10 ? '0' : ''}${s}`);
      };

      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('loadedmetadata', onLoadedMetadata);

      return () => {
        audio.pause();
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      };
    }
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) {
      setIsPlaying(!isPlaying);
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(err => console.error("Audio playback failed", err));
      setIsPlaying(true);
    }
  };

  let playedPercent = 0;
  if (audioRef.current && audioRef.current.duration) {
    playedPercent = (currentTime / audioRef.current.duration) * 100;
  } else if (isPlaying && !audioRef.current) {
    playedPercent = 50;
  }

  return (
    <div className="flex items-center w-full min-w-[240px] pt-1 pb-4 pl-1 pr-1">
      <div className="relative mr-3 flex-shrink-0">
        <img 
          src={avatar} 
          alt="Avatar" 
          className="w-12 h-12 rounded-full object-cover" 
        />
        <div className={`absolute -bottom-1 -right-1 rounded-full p-[2px] ${isMe ? 'bg-[var(--color-wa-msg-out)] text-[#3b82f6]' : 'bg-[var(--color-wa-panel)] text-[#00a884]'}`}>
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
        </div>
      </div>
      
      <button 
        type="button"
        className={`text-[#8696a0] hover:text-[#e9edef] transition-colors`}
        onClick={togglePlay}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        )}
      </button>
      
      <div className="flex flex-col flex-1 pl-2 relative mt-2">
        <div className="flex items-center relative">
            {/* Scrubber Dot */}
            <div 
              className="w-[11px] h-[11px] rounded-full bg-[#00a884] absolute top-2.5 z-10 transition-all duration-75"
              style={{ left: `calc(${playedPercent}% * 0.8 + 12px)` }}
            ></div>
            {/* Visualizer */}
            <MockAudioVisualizer playedPercent={playedPercent} />
        </div>
        <span className="text-[11px] text-[#8696a0] mt-1 ml-2">{totalDuration}</span>
      </div>
    </div>
  );
};

const renderHighlightedText = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a 
          key={index} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-[#53bdeb] hover:underline break-all inline font-medium"
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

export default function App() {
  const [activeContact, setActiveContact] = useState<ContactId>('gerda');
  
  const [customContacts, setCustomContacts] = useState<CustomContactConfig[]>(() => {
    const savedList = localStorage.getItem('app_customContacts_v2');
    if (savedList) return JSON.parse(savedList);
    
    // Fallback/Migration: check if old single config exists
    const savedSingle = localStorage.getItem('app_customContactConfig');
    if (savedSingle) {
      try {
        const parsed = JSON.parse(savedSingle);
        if (parsed) {
          return [{
            ...parsed,
            id: 'custom' // Preserve 'custom' id for previous chats compatibility
          }];
        }
      } catch (e) {}
    }
    
    return [{
      id: 'custom',
      name: "Aangepast contact",
      sysInstruct: "Je bent een vriendelijke AI.",
      profilePic: "https://ui-avatars.com/api/?name=Aangepast+Contact&background=random",
      isConfigured: false,
      voiceName: 'Aoede',
      voicePrompt: "Spreek heel vriendelijk en op een natuurlijke, rustige toon."
    }];
  });

  useEffect(() => {
    localStorage.setItem('app_customContacts_v2', JSON.stringify(customContacts));
  }, [customContacts]);

  const activeContactConfig = customContacts.find(c => c.id === activeContact) || defaultCustomConfig;

  const { messagesMap, isTypingMap, sendMessage, initChat, setMessagesForContact, hasLoadedMessages } = useGeminiChat(activeContactConfig);
  const { callState, callError, startCall, endCall, sendCallMessage, getRemoteVolume, sendVideoFrame } = useLiveCall(activeContactConfig);

  const handleAddCustomContact = () => {
    const newId = 'custom_' + Date.now();
    const newContact: CustomContactConfig = {
      id: newId,
      name: `Aangepast contact ${customContacts.length + 1}`,
      sysInstruct: "Je bent een vriendelijke AI.",
      profilePic: `https://ui-avatars.com/api/?name=Aangepast+Contact+${customContacts.length + 1}&background=random`,
      isConfigured: false,
      voiceName: 'Aoede',
      voicePrompt: "Spreek heel vriendelijk en op een natuurlijke, rustige toon.",
      phoneNumber: "06-" + Math.floor(10000000 + Math.random() * 90000000),
      bio: "Hoi! Ik gebruik WhatsApp."
    };
    
    setCustomContacts(prev => [...prev, newContact]);
    setActiveContact(newId);
    setShowCustomContactSettings(true);
  };

  const handleDeleteContact = (id: string) => {
    if (id === 'gerda') return;
    
    if (activeContact === id) {
      setActiveContact('gerda');
    }
    
    setCustomContacts(prev => prev.filter(c => c.id !== id));
    showToast("Contact verwijderd");
  };

  const updateCustomContact = (id: string, updated: Partial<CustomContactConfig>) => {
    setCustomContacts(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
  };

  const messages = messagesMap[activeContact] || [];
  const isTyping = isTypingMap[activeContact] || false;

  useEffect(() => {
    if (callError) {
      showToast("Fout bij oproep: " + callError);
    }
  }, [callError]);

  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [activeTab, setActiveTab] = useState<'chats'|'calls'|'status'|'settings'|'profile'|'notifications'|'privacy'|'archived'|'communities'|'invite_friend'|'account'|'lists'|'chats_settings'|'storage'|'accessibility'|'language'|'help'|'starred'|'new_group'|'new_community'|'status_settings'|'community_examples'>('chats');
  const [callHistory, setCallHistory] = useState<CallRecord[]>(() => {
    const saved = localStorage.getItem('app_callHistory');
    if (saved) return JSON.parse(saved);
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('app_callHistory', JSON.stringify(callHistory));
    } catch (e: any) {
       console.error("Local storage quota exceeded for call history", e);
    }
  }, [callHistory]);

  const [userName, setUserName] = useState('Lelijke aap');
  const [userAbout, setUserAbout] = useState('Online');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatMessageSearchQuery, setChatMessageSearchQuery] = useState('');
  const [isSearchingChat, setIsSearchingChat] = useState(false);
  const [chatFilter, setChatFilter] = useState<'all'|'unread'|'groups'>('all');
  const [callSearchQuery, setCallSearchQuery] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [showMenuMain, setShowMenuMain] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showMenuChat, setShowMenuChat] = useState(false);
  const [showMenuPlus, setShowMenuPlus] = useState(false);
  const [showCustomContactSettings, setShowCustomContactSettings] = useState(false);
  const [realisticDelay, setRealisticDelay] = useState(false);
  useEffect(() => { setRealisticDelay(isRealisticDelayEnabled()); }, []);
  const [showContactProfile, setShowContactProfile] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);

  useEffect(() => {
    const contactObj = customContacts.find(c => c.id === activeContact);
    if (activeContact !== 'gerda' && contactObj && !contactObj.isConfigured) {
      setShowCustomContactSettings(true);
    } else {
      setShowCustomContactSettings(false);
    }
  }, [activeContact]);

  const activeName = activeContact !== 'gerda' ? (activeContactConfig.name || "Aangepast contact") : 'Gerda';
  const activeAvatar = activeContact !== 'gerda' ? activeContactConfig.profilePic : GERDA_AVATAR;
  const activePhone = activeContact !== 'gerda' ? (activeContactConfig.phoneNumber || "Onbekend nummer") : '020-2254002';
  const activeBio = activeContact !== 'gerda' ? (activeContactConfig.bio || "Hoi! Ik gebruik WhatsApp.") : "Leker in de mekdonalts 🍔 met brendi's pasje";
  
  const activeOverlay = GERDA_OVERLAY;
  const activeVideo = GERDA_VIDEO;

  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'none' | 'hamburger' | 'dog' | 'cat'>('none');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const [isVideoCall, setIsVideoCall] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameImgRef = useRef<HTMLImageElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const prevCallState = useRef(callState);
  const lastDuration = useRef(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    // Initial preloading handled by contact effect
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingVideo, setPendingVideo] = useState<{ url: string; mimeType: string } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profilePicInputRef = useRef<HTMLInputElement>(null);
  const [meAvatar, setMeAvatar] = useState(ME_AVATAR);
  const [privacyLastSeen, setPrivacyLastSeen] = useState('Iedereen');
  const [privacyPhoto, setPrivacyPhoto] = useState('Mijn contacten');
  const [notifyMsg, setNotifyMsg] = useState(true);
  const [notifyPreview, setNotifyPreview] = useState(true);
  const [notifyReact, setNotifyReact] = useState(true);
  const [notifyBg, setNotifyBg] = useState(true);
  const [notifyReadReceipts, setNotifyReadReceipts] = useState(true);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [activeMessageIds, setActiveMessageIds] = useState<Set<string>>(new Set());
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingSecondsRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatVoiceDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          const base64Payload = base64data.split(',')[1];
          const audioObjectUrl = URL.createObjectURL(audioBlob);
          
          sendMessage(activeContact, "🎤 Voice Message", undefined, { 
            data: base64Payload, 
            mimeType: 'audio/webm',
            url: audioObjectUrl,
            duration: formatVoiceDuration(recordingSecondsRef.current)
          });
        };
        reader.readAsDataURL(audioBlob);

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => {
          const next = prev + 1;
          recordingSecondsRef.current = next;
          return next;
        });
      }, 1000);

    } catch (err) {
      console.error("Failed to start audio recording:", err);
      showToast("Kan microfoon niet openen. Controleer machtigingen.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
    showToast("Opname geannuleerd.");
  };

  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
       console.error("Global captured error:", event.error || event.message);
       showToast(`Uncaught Error: ${event.message || 'Unknown. See console.'}`);
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
       console.error("Global unhandled rejection:", event.reason);
       showToast(`Uncaught Promise Rejection: ${event.reason?.message || event.reason || 'Unknown. See console.'}`);
    };
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
       window.removeEventListener('error', handleGlobalError);
       window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    if (hasLoadedMessages) {
      initChat(activeContact);
    }
    preloadVideoFrames(GERDA_VIDEO);
  }, [initChat, activeContact, hasLoadedMessages]);

  useEffect(() => {
     let localStream: MediaStream | null = null;
     if (callState !== 'idle' && isVideoCall) {
         navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
             localStream = stream;
             if (localVideoRef.current) {
                 localVideoRef.current.srcObject = stream;
             }
         }).catch(console.error);
     }
     return () => {
         if (localStream) {
             localStream.getTracks().forEach(t => t.stop());
         }
     };
  }, [callState, isVideoCall]);

  useEffect(() => {
     let intervalId: number;
     if (callState === 'connected' && isVideoCall) {
         const canvas = document.createElement('canvas');
         canvas.width = 320;
         canvas.height = 240;
         const ctx = canvas.getContext('2d');
         
         intervalId = window.setInterval(() => {
             if (localVideoRef.current && localVideoRef.current.readyState >= 2) {
                 if (ctx) {
                     ctx.drawImage(localVideoRef.current, 0, 0, canvas.width, canvas.height);
                     const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
                     const base64Jpeg = dataUrl.split(',')[1];
                     if (base64Jpeg) {
                         sendVideoFrame(base64Jpeg);
                     }
                 }
             }
         }, 1000); // 1 frame per second
     }
     return () => clearInterval(intervalId);
  }, [callState, isVideoCall, sendVideoFrame]);

  useEffect(() => {
     let rafId: number;
     if (callState === 'connected' && isVideoCall) {
         let smoothedVolume = 0;
         const loop = () => {
             const rawVolume = getRemoteVolume();
             smoothedVolume += (rawVolume - smoothedVolume) * 0.7; // Minder smooth maken (snellere reactie)
             const volume = smoothedVolume;
             if (globalFrames.length > 0 && frameImgRef.current) {
                 if (videoRef.current) videoRef.current.style.display = 'none';
                 frameImgRef.current.style.display = 'block';
                 const frameIndex = Math.min(
                     Math.floor(volume * globalFrames.length),
                     globalFrames.length - 1
                 );
                 frameImgRef.current.src = globalFrames[frameIndex];
             } else if (videoRef.current && videoRef.current.readyState >= 1) { // fallback
                 const duration = videoRef.current.duration || 1;
                 const maxTime = duration - 0.01; // Avoid going exactly to the end to prevent looping/stopping weirdness
                 videoRef.current.currentTime = Math.min(volume * duration, maxTime);
             }
             rafId = requestAnimationFrame(loop);
         };
         rafId = requestAnimationFrame(loop);
     }
     return () => cancelAnimationFrame(rafId);
  }, [callState, isVideoCall, getRemoteVolume]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);


  useEffect(() => {
    let interval: number;
    if (callState === 'connected') {
      lastDuration.current = 0;
      interval = setInterval(() => {
        setCallDuration(prev => {
          lastDuration.current = prev + 1;
          return prev + 1;
        });
      }, 1000) as unknown as number;
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [callState]);

  useEffect(() => {
    if ((prevCallState.current === 'connected' || prevCallState.current === 'calling') && callState === 'idle') {
        const isMissed = prevCallState.current === 'calling';
        const finalDuration = isMissed ? 0 : lastDuration.current;
        const newCall: CallRecord = {
          id: Date.now().toString(),
          timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          duration: finalDuration,
          type: 'outgoing',
          status: isMissed ? 'missed' : 'completed',
          contactId: activeContact
        };
        setCallHistory(prev => [newCall, ...prev]);
        
        // Add chat message
        setMessagesForContact(activeContact, prev => [...prev, {
          id: Date.now().toString() + '_call',
          sender: 'user',
          text: '',
          timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          isCallLog: true,
          callDuration: finalDuration,
          isVideoCall: isVideoCall,
          callStatus: isMissed ? 'missed' : 'completed'
        }]);
    }
    prevCallState.current = callState;
  }, [callState, isVideoCall]);

  const handleStartVideoCall = () => {
      setIsVideoCall(true);
      startCall(activeContact, true);
  };

  const handleStartAudioCall = () => {
      setIsVideoCall(false);
      startCall(activeContact, false);
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() && !pendingImage && !pendingVideo) return;
    
    // Add msg to standard chat history always
    sendMessage(activeContact, inputText, pendingImage || undefined, undefined, pendingVideo || undefined);
    
    // If we're calling, also send this to Live API to read and reply by voice
    if (callState === 'connected') {
        sendCallMessage(inputText);
    }
    
    setInputText('');
    setPendingImage(null);
    setPendingVideo(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          if (file.type.startsWith('video/')) {
              const url = URL.createObjectURL(file);
              setPendingVideo({ url, mimeType: file.type });
          } else {
              const reader = new FileReader();
              reader.onload = (event) => {
                  const base64 = event.target?.result as string;
                  setPendingImage(base64);
              };
              reader.readAsDataURL(file);
          }
      }
      if (e.target) e.target.value = '';
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const renderSidebarContent = () => {
    switch(activeTab) {
        case 'profile':
            return (
                <div className="flex flex-col h-full bg-[var(--color-wa-bg)]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('settings')} className="mr-2"><ArrowLeft size={24} /></button>
                        Profiel
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center py-8">
                        <div className="relative group cursor-pointer shrink-0" onClick={() => profilePicInputRef.current?.click()}>
                           <input 
                              type="file" 
                              ref={profilePicInputRef} 
                              className="hidden" 
                              accept="image/*" 
                              onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                      const reader = new FileReader();
                                      reader.onload = (ev) => {
                                          setMeAvatar(ev.target?.result as string);
                                          showToast('Profielfoto is bijgewerkt');
                                      };
                                      reader.readAsDataURL(file);
                                  }
                              }} 
                           />
                          <img src={meAvatar} className="w-40 h-40 rounded-full object-cover mb-6 group-hover:opacity-70 transition-opacity" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                             <Plus className="text-white" size={32} />
                          </div>
                        </div>
                        <div className="w-full px-6 mb-6">
                            <label className="text-sm text-[#00a884] mb-1">Je naam</label>
                            <div className="flex justify-between items-center border-b border-[var(--color-wa-border)] py-2">
                               {isEditingName ? (
                                   <input 
                                     autoFocus
                                     className="bg-transparent text-[#e9edef] text-lg outline-none w-full"
                                     value={userName}
                                     onChange={(e) => setUserName(e.target.value)}
                                     onBlur={() => setIsEditingName(false)}
                                     onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                                   />
                               ) : (
                                   <div className="text-[#e9edef] text-lg">{userName}</div>
                               )}
                               <button onClick={() => setIsEditingName(!isEditingName)} className="text-[var(--color-wa-text-muted)] p-1">
                                  <Settings size={18} />
                               </button>
                            </div>
                            <div className="text-[var(--color-wa-text-muted)] mt-5 text-sm">Dit is niet je gebruikersnaam of pincode. Deze naam is zichtbaar voor je WhatsApp-contacten.</div>
                        </div>
                        <div className="w-full px-6">
                            <label className="text-sm text-[#00a884] mb-1">Status</label>
                            <div className="flex justify-between items-center border-b border-[var(--color-wa-border)] py-2">
                               {isEditingAbout ? (
                                   <input 
                                     autoFocus
                                     className="bg-transparent text-[#e9edef] text-lg outline-none w-full"
                                     value={userAbout}
                                     onChange={(e) => setUserAbout(e.target.value)}
                                     onBlur={() => setIsEditingAbout(false)}
                                     onKeyDown={(e) => e.key === 'Enter' && setIsEditingAbout(false)}
                                   />
                               ) : (
                                   <div className="text-[#e9edef] text-lg">{userAbout}</div>
                               )}
                               <button onClick={() => setIsEditingAbout(!isEditingAbout)} className="text-[var(--color-wa-text-muted)] p-1">
                                  <Settings size={18} />
                               </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        case 'archived':
            return (
                <div className="flex flex-col h-full bg-[var(--color-wa-bg)]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('chats')} className="mr-2"><ArrowLeft size={24} /></button>
                        Gearchiveerd
                    </div>
                    <div className="flex-1 overflow-y-auto bg-[var(--color-wa-bg)] custom-scrollbar">
                        <div className="p-8 text-center text-[var(--color-wa-text-muted)] flex flex-col items-center">
                            <Archive size={48} className="mb-4 opacity-20" />
                            <div className="text-lg mb-2">Geen gearchiveerde chats</div>
                            <p className="text-sm">Swipe een chat naar links om deze te archiveren of klik op de opties bij een chat.</p>
                        </div>
                    </div>
                </div>
            );
        case 'notifications':
            return (
                <div className="flex flex-col h-full bg-[var(--color-wa-bg)]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('settings')} className="mr-2"><ArrowLeft size={24} /></button>
                        Meldingen
                    </div>
                    <div className="flex-1 overflow-y-auto bg-[var(--color-wa-bg)] custom-scrollbar">
                        <div className="px-6 py-4 flex justify-between items-center bg-[var(--color-wa-bg)] border-b border-[var(--color-wa-border)]">
                            <div className="text-[15px] text-[#e9edef]">Berichtmeldingen</div>
                            <input type="checkbox" className="w-5 h-5 accent-[#00a884] cursor-pointer" checked={notifyMsg} onChange={(e) => { setNotifyMsg(e.target.checked); }} />
                        </div>
                        <div className="px-6 py-4 flex justify-between items-center bg-[var(--color-wa-bg)] border-b border-[var(--color-wa-border)]">
                            <div className="text-[15px] text-[#e9edef]">Toon voorvertoningen</div>
                            <input type="checkbox" className="w-5 h-5 accent-[#00a884] cursor-pointer" checked={notifyPreview} onChange={(e) => { setNotifyPreview(e.target.checked); }} />
                        </div>
                        <div className="px-6 py-4 flex justify-between items-center bg-[var(--color-wa-bg)] border-b border-[var(--color-wa-border)]">
                            <div className="text-[15px] text-[#e9edef]">Reactiemeldingen</div>
                            <input type="checkbox" className="w-5 h-5 accent-[#00a884] cursor-pointer" checked={notifyReact} onChange={(e) => { setNotifyReact(e.target.checked); }} />
                        </div>
                        <div className="px-6 py-4 flex justify-between items-center bg-[var(--color-wa-bg)] border-b border-[var(--color-wa-border)]">
                            <div className="text-[15px] text-[#e9edef]">Achtergrondgeluiden</div>
                            <input type="checkbox" className="w-5 h-5 accent-[#00a884] cursor-pointer" checked={notifyBg} onChange={(e) => { setNotifyBg(e.target.checked); }} />
                        </div>
                    </div>
                </div>
            );
        case 'privacy':
            return (
                <div className="flex flex-col h-full bg-[var(--color-wa-bg)]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('settings')} className="mr-2"><ArrowLeft size={24} /></button>
                        Privacy
                    </div>
                    <div className="flex-1 overflow-y-auto bg-[var(--color-wa-bg)] custom-scrollbar">
                        <div className="px-6 py-4 hover:bg-[var(--color-wa-hover)] cursor-pointer flex justify-between items-center border-b border-[var(--color-wa-border)]" onClick={() => setPrivacyLastSeen(prev => prev === 'Iedereen' ? 'Mijn contacten' : prev === 'Mijn contacten' ? 'Niemand' : 'Iedereen')}>
                           <div>
                               <div className="text-[15px] text-[#e9edef]">Laatst gezien en Online</div>
                               <div className="text-[var(--color-wa-text-muted)] text-sm">{privacyLastSeen}</div>
                           </div>
                           <ChevronDown size={20} className="text-[var(--color-wa-text-muted)]"/>
                        </div>
                        <div className="px-6 py-4 hover:bg-[var(--color-wa-hover)] cursor-pointer flex justify-between items-center border-b border-[var(--color-wa-border)]" onClick={() => setPrivacyPhoto(prev => prev === 'Iedereen' ? 'Mijn contacten' : prev === 'Mijn contacten' ? 'Niemand' : 'Iedereen')}>
                           <div>
                               <div className="text-[15px] text-[#e9edef]">Profielfoto</div>
                               <div className="text-[var(--color-wa-text-muted)] text-sm">{privacyPhoto}</div>
                           </div>
                           <ChevronDown size={20} className="text-[var(--color-wa-text-muted)]"/>
                        </div>
                        <div className="px-6 py-4 flex justify-between items-center bg-[var(--color-wa-bg)] border-b border-[var(--color-wa-border)]">
                            <div className="text-[15px] text-[#e9edef]">Leesbewijzen</div>
                            <input type="checkbox" className="w-5 h-5 accent-[#00a884] cursor-pointer" checked={notifyReadReceipts} onChange={(e) => setNotifyReadReceipts(e.target.checked)} />
                        </div>
                    </div>
                </div>
            );
        case 'settings':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]">
                    <div className="flex-1 overflow-y-auto custom-scrollbar pb-10">
                        {/* Profile Header Block */}
                        <div className="flex flex-col items-center pt-8 pb-4 border-b border-[rgba(255,255,255,0.05)]">
                            <div className="w-[120px] h-[120px] rounded-full overflow-hidden mb-4 relative cursor-pointer" onClick={() => setActiveTab('profile')}>
                               <img src={meAvatar} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex items-center gap-2 mb-6">
                               <span className="text-[26px] font-medium text-[#e9edef]">{userName}</span>
                               <button onClick={() => showToast('Optie afgeschermd')} className="text-[#00a884]"><PlusCircle size={28} /></button>
                            </div>
                        </div>

                        {/* List Items */}
                        <div className="flex flex-col pt-2">
                            <div className="px-6 py-2 text-[14px] font-medium text-[#8696a0]">Instellingen</div>

                            {/* Een vriend uitnodigen */}
                            <div className="px-6 py-3.5 flex hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => setActiveTab('invite_friend')}>
                                <div className="w-[50px] pt-0.5 shrink-0"><Users size={24} strokeWidth={1.5} className="text-[#8696a0]" /></div>
                                <div className="flex-1">
                                    <div className="text-[17px] text-[#d1d7db] mb-0.5 leading-snug">Een vriend uitnodigen</div>
                                    <div className="text-[14px] text-[#8696a0] leading-snug">Mensen uitnodigen om te chatten op WhatsApp</div>
                                </div>
                            </div>

                            {/* Account */}
                            <div className="px-6 py-3.5 flex hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => setActiveTab('account')}>
                                <div className="w-[50px] pt-0.5 shrink-0"><Key size={24} strokeWidth={1.5} className="text-[#8696a0]" /></div>
                                <div className="flex-1">
                                    <div className="text-[17px] text-[#d1d7db] mb-0.5 leading-snug">Account</div>
                                    <div className="text-[14px] text-[#8696a0] leading-snug">Beveiligingsmeldingen, nummer wijzigen</div>
                                </div>
                            </div>
                            
                            {/* Privacy */}
                            <div className="px-6 py-3.5 flex hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => setActiveTab('privacy')}>
                                <div className="w-[50px] pt-0.5 shrink-0"><Lock size={24} strokeWidth={1.5} className="text-[#8696a0]" /></div>
                                <div className="flex-1">
                                    <div className="text-[17px] text-[#d1d7db] mb-0.5 leading-snug">Privacy</div>
                                    <div className="text-[14px] text-[#8696a0] leading-snug">Geblokkeerde accounts, verdwijnende chatberichten</div>
                                </div>
                            </div>

                            {/* Lijsten */}
                            <div className="px-6 py-3.5 flex hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => setActiveTab('lists')}>
                                <div className="w-[50px] pt-0.5 shrink-0"><LayoutList size={24} strokeWidth={1.5} className="text-[#8696a0]" /></div>
                                <div className="flex-1">
                                    <div className="text-[17px] text-[#d1d7db] mb-0.5 leading-snug">Lijsten</div>
                                    <div className="text-[14px] text-[#8696a0] leading-snug">Mensen en groepen beheren</div>
                                </div>
                            </div>

                            {/* Chats */}
                            <div className="px-6 py-3.5 flex hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => setActiveTab('chats_settings')}>
                                <div className="w-[50px] pt-0.5 shrink-0"><MessageSquare size={24} strokeWidth={1.5} className="text-[#8696a0]" /></div>
                                <div className="flex-1">
                                    <div className="text-[17px] text-[#d1d7db] mb-0.5 leading-snug">Chats</div>
                                    <div className="text-[14px] text-[#8696a0] leading-snug">Thema, achtergronden, chatgeschiedenis</div>
                                </div>
                            </div>

                            {/* Meldingen */}
                            <div className="px-6 py-3.5 flex hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => setActiveTab('notifications')}>
                                <div className="w-[50px] pt-0.5 shrink-0"><Bell size={24} strokeWidth={1.5} className="text-[#8696a0]" /></div>
                                <div className="flex-1">
                                    <div className="text-[17px] text-[#d1d7db] mb-0.5 leading-snug">Meldingen</div>
                                    <div className="text-[14px] text-[#8696a0] leading-snug">Berichten, groepen en beltonen</div>
                                </div>
                            </div>
                            
                            {/* Opslag en data */}
                            <div className="px-6 py-3.5 flex hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => setActiveTab('storage')}>
                                <div className="w-[50px] pt-0.5 shrink-0"><RotateCw size={24} strokeWidth={1.5} className="text-[#8696a0]" /></div>
                                <div className="flex-1">
                                    <div className="text-[17px] text-[#d1d7db] mb-0.5 leading-snug">Opslag en data</div>
                                    <div className="text-[14px] text-[#8696a0] leading-snug">Netwerkgebruik, automatisch downloaden</div>
                                </div>
                            </div>

                            {/* Toegankelijkheid */}
                            <div className="px-6 py-3.5 flex hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => setActiveTab('accessibility')}>
                                <div className="w-[50px] pt-0.5 shrink-0"><Accessibility size={24} strokeWidth={1.5} className="text-[#8696a0]" /></div>
                                <div className="flex-1">
                                    <div className="text-[17px] text-[#d1d7db] mb-0.5 leading-snug">Toegankelijkheid</div>
                                    <div className="text-[14px] text-[#8696a0] leading-snug">Contrast verhogen, animatie</div>
                                </div>
                            </div>

                            {/* Taal van app */}
                            <div className="px-6 py-3.5 flex hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => setActiveTab('language')}>
                                <div className="w-[50px] pt-0.5 shrink-0"><Globe size={24} strokeWidth={1.5} className="text-[#8696a0]" /></div>
                                <div className="flex-1">
                                    <div className="text-[17px] text-[#d1d7db] mb-0.5 leading-snug">Taal van app</div>
                                    <div className="text-[14px] text-[#8696a0] leading-snug">Nederlands (taal van je apparaat)</div>
                                </div>
                            </div>

                            {/* Hulp en feedback */}
                            <div className="px-6 py-3.5 flex hover:bg-[var(--color-wa-hover)] cursor-pointer border-b border-[rgba(255,255,255,0.05)] pb-5" onClick={() => setActiveTab('help')}>
                                <div className="w-[50px] pt-0.5 shrink-0"><HelpCircle size={24} strokeWidth={1.5} className="text-[#8696a0]" /></div>
                                <div className="flex-1">
                                    <div className="text-[17px] text-[#d1d7db] mb-0.5 leading-snug">Hulp en feedback</div>
                                    <div className="text-[14px] text-[#8696a0] leading-snug">Helpcentrum, contact opnemen, privacybeleid</div>
                                </div>
                            </div>
                            
                            {/* Meta */}
                            <div className="px-6 py-5 mb-2 hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => window.open('https://accountscenter.facebook.com/', '_blank')}>
                                <div className="text-[15px] font-semibold text-[#d1d7db] flex items-center gap-2 mb-1.5"><Infinity size={18} className="text-[#d1d7db]"/> Meta</div>
                                <div className="text-[17px] text-[#d1d7db] mb-0.5 leading-snug">Accountcentrum</div>
                                <div className="text-[14px] text-[#8696a0] leading-snug">Beheer je ervaring op WhatsApp, Facebook, Instagram en meer.</div>
                            </div>

                        </div>
                    </div>
                </div>
            );
        case 'invite_friend':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('settings')} className="mr-2"><ArrowLeft size={24} /></button>
                        Link delen
                    </div>
                    <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
                        <div className="text-[#8696a0] text-[14px] font-medium mb-4">Uit contacten</div>
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex gap-4 items-center">
                                <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white"><Users size={24}/></div>
                                <div><div className="text-[#e9edef] text-[16px]">GALZ</div><div className="text-[14px] text-[#8696a0]">+263 24 2770835</div></div>
                            </div>
                            <button className="text-[#00a884] font-medium text-sm">Uitnodigen</button>
                        </div>
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex gap-4 items-center">
                                <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white"><Users size={24}/></div>
                                <div><div className="text-[#e9edef] text-[16px]">Stichting Down Syndroom</div><div className="text-[14px] text-[#8696a0]">+31 522 281 337</div></div>
                            </div>
                            <button className="text-[#00a884] font-medium text-sm">Uitnodigen</button>
                        </div>
                    </div>
                </div>
            );
        case 'account':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('settings')} className="mr-2"><ArrowLeft size={24} /></button>
                        Account
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pt-2">
                        <div className="px-6 py-3.5 flex hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => showToast('Optie afgeschermd')}>
                           <div className="text-[#e9edef] text-[17px]">Aanmeldingsgegevens</div>
                        </div>
                        <div className="px-6 py-3.5 flex hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => showToast('Optie afgeschermd')}>
                           <div className="text-[#e9edef] text-[17px]">Passkeys</div>
                        </div>
                        <div className="px-6 py-3.5 flex hover:bg-[var(--color-wa-hover)] cursor-pointer border-b border-[var(--color-wa-border)] pb-5" onClick={() => showToast('Optie afgeschermd')}>
                           <div className="text-[#e9edef] text-[17px]">E-mailadres</div>
                        </div>
                        <div className="px-6 py-4 flex hover:bg-[var(--color-wa-hover)] cursor-pointer border-b border-[var(--color-wa-border)]" onClick={() => showToast('Optie afgeschermd')}>
                           <div className="text-[#e9edef] text-[17px]">Verificatie in twee stappen</div>
                        </div>
                    </div>
                </div>
            );
        case 'lists':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('settings')} className="mr-2"><ArrowLeft size={24} /></button>
                        Lijsten
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                        <div className="text-center mb-6">
                            <span className="text-[#8696a0] text-[15px]">Elke lijst die je maakt wordt een filter bovenin je tabblad Chats.</span>
                        </div>
                        <button className="w-full py-3 bg-[#0a332c] text-[#00a884] rounded-full flex gap-2 items-center justify-center font-medium mb-6 hover:bg-[#12423a] transition-colors" onClick={() => showToast('Nieuwe lijst maken')}>
                           <Plus size={20}/> Een aangepaste lijst maken
                        </button>
                        <div className="text-[#e9edef] text-[16px] font-medium mb-2">Je lijsten</div>
                        <div className="mb-4">
                           <div className="py-3 items-center flex justify-between cursor-pointer">
                              <div><div className="text-[#e9edef] text-[16px]">Ongelezen</div><div className="text-[#8696a0] text-[14px]">Voorinstelling</div></div>
                           </div>
                           <div className="py-3 items-center flex justify-between cursor-pointer">
                              <div><div className="text-[#e9edef] text-[16px]">Favorieten</div><div className="text-[#8696a0] text-[14px]">Mensen of groepen toevoegen</div></div>
                           </div>
                           <div className="py-3 items-center flex justify-between cursor-pointer">
                              <div><div className="text-[#e9edef] text-[16px]">Groepen</div><div className="text-[#8696a0] text-[14px]">Voorinstelling</div></div>
                           </div>
                        </div>
                    </div>
                </div>
            );
        case 'chats_settings':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('settings')} className="mr-2"><ArrowLeft size={24} /></button>
                        Chats
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pt-2">
                        <div className="px-6 py-2 text-[14px] font-medium text-[#8696a0]">Weergave</div>
                        <div className="px-6 py-3.5 border-b border-[var(--color-wa-border)] cursor-pointer" onClick={() => document.documentElement.classList.toggle('dark')}>
                           <div className="text-[#e9edef] text-[17px]">Thema</div>
                           <div className="text-[#8696a0] text-[14px]">Systeemstandaard</div>
                        </div>
                        <div className="px-6 py-3.5 border-b border-[var(--color-wa-border)] pb-5 cursor-pointer" onClick={() => showToast('Achtergrond opties openen')}>
                           <div className="text-[#e9edef] text-[17px]">Standaard chatthema</div>
                        </div>
                        
                        <div className="px-6 py-4 text-[14px] font-medium text-[#8696a0]">Chatinstellingen</div>
                        <div className="px-6 py-3.5 flex justify-between items-center cursor-pointer" onClick={() => { const v = !realisticDelay; setRealisticDelay(v); setRealisticDelayEnabled(v); }}>
                           <div>
                             <div className="text-[#e9edef] text-[17px]">Realistische reactietijd</div>
                             <div className="text-[#8696a0] text-[14px] pr-8">Antwoorden komen 5-20 sec later (afhankelijk van de lengte) en oproepen worden pas na 2-10 sec opgenomen</div>
                           </div>
                           <input type="checkbox" className="w-5 h-5 accent-[#00a884]" checked={realisticDelay} readOnly />
                        </div>
                        <div className="px-6 py-3.5 flex justify-between items-center cursor-pointer">
                           <div>
                             <div className="text-[#e9edef] text-[17px]">Verzenden met Enter</div>
                             <div className="text-[#8696a0] text-[14px] pr-8">Berichten verzenden met entertoets</div>
                           </div>
                           <input type="checkbox" className="w-5 h-5 accent-[#00a884]" />
                        </div>
                         <div className="px-6 py-3.5 flex justify-between items-center cursor-pointer">
                           <div>
                             <div className="text-[#e9edef] text-[17px]">Mediazichtbaarheid</div>
                             <div className="text-[#8696a0] text-[14px] pr-8">Recent gedownloade media tonen</div>
                           </div>
                           <input type="checkbox" className="w-5 h-5 accent-[#00a884]" defaultChecked />
                        </div>
                    </div>
                </div>
            );
        case 'storage':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('settings')} className="mr-2"><ArrowLeft size={24} /></button>
                        Opslag en data
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pt-2">
                        <div className="px-6 py-4 flex flex-col gap-1 border-b border-[var(--color-wa-border)] cursor-pointer" onClick={() => showToast('Opslag details')}>
                           <div className="text-[#e9edef] text-[17px]">Opslag beheren</div>
                           <div className="text-[#8696a0] text-[14px]">2,2 GB</div>
                        </div>
                        <div className="px-6 py-4 flex flex-col gap-1 border-b border-[var(--color-wa-border)] pb-5 cursor-pointer" onClick={() => showToast('Netwerk details')}>
                           <div className="text-[#e9edef] text-[17px]">Netwerkgebruik</div>
                           <div className="text-[#8696a0] text-[14px]">1,1 GB verzonden • 2,9 GB ontvangen</div>
                        </div>
                        
                        <div className="px-6 py-4 flex justify-between items-center cursor-pointer">
                           <div className="text-[#e9edef] text-[17px]">Minder data voor oproepen gebruiken</div>
                           <input type="checkbox" className="w-5 h-5 accent-[#00a884]" />
                        </div>
                        <div className="px-6 py-3 border-b border-[var(--color-wa-border)] pb-4 cursor-pointer">
                           <div className="text-[#e9edef] text-[17px]">Proxy</div>
                           <div className="text-[#8696a0] text-[14px]">Uit</div>
                        </div>
                        
                        <div className="px-6 py-4 text-[14px] font-medium text-[#8696a0]">Media automatisch downloaden</div>
                        <div className="px-6 pb-2 text-[#8696a0] text-[14px]">Spraakberichten worden altijd automatisch gedownload</div>
                        
                        <div className="px-6 py-3 cursor-pointer hover:bg-[var(--color-wa-hover)]">
                           <div className="text-[#e9edef] text-[17px]">Bij gebruik mobiel netwerk</div>
                           <div className="text-[#8696a0] text-[14px]">Afbeeldingen</div>
                        </div>
                    </div>
                </div>
            );
        case 'accessibility':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('settings')} className="mr-2"><ArrowLeft size={24} /></button>
                        Toegankelijkheid
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pt-2 px-6">
                        <div className="flex justify-between items-center py-4 cursor-pointer border-b border-[var(--color-wa-border)]">
                           <div>
                             <div className="text-[#e9edef] text-[17px]">Contrast verhogen</div>
                             <div className="text-[#8696a0] text-[14px] pr-8">Kleur in lichte modus verbeteren</div>
                           </div>
                           <input type="checkbox" className="w-5 h-5 accent-[#00a884]" defaultChecked />
                        </div>
                        <div className="py-4 hover:bg-[var(--color-wa-hover)] cursor-pointer">
                           <div className="text-[#e9edef] text-[17px]">Animatie</div>
                           <div className="text-[#8696a0] text-[14px]">Kies of stickers automatisch bewegen</div>
                        </div>
                    </div>
                </div>
            );
        case 'language':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('settings')} className="mr-2"><ArrowLeft size={24} /></button>
                        Taal van app
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pt-2">
                        {[
                          { name: 'Nederlands', desc: '(taal van je apparaat)' },
                          { name: 'English', desc: 'Engels' },
                          { name: 'Afrikaans', desc: 'Afrikaans' },
                          { name: 'Español', desc: 'Spaans' },
                          { name: 'Deutsch', desc: 'Duits' },
                          { name: 'Français', desc: 'Frans' }
                        ].map(lang => (
                           <div key={lang.name} className="px-6 py-4 flex gap-4 items-center hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => showToast(`Taal gewijzigd naar ${lang.name}`)}>
                              <input type="radio" name="lang" className="w-5 h-5 accent-[#00a884]" defaultChecked={lang.name === 'Nederlands'} />
                              <div>
                                 <div className="text-[#e9edef] text-[17px]">{lang.name}</div>
                                 <div className="text-[#8696a0] text-[14px]">{lang.desc}</div>
                              </div>
                           </div>
                        ))}
                    </div>
                </div>
            );
        case 'help':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('settings')} className="mr-2"><ArrowLeft size={24} /></button>
                        Hulp
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pt-2">
                       <div className="px-6 py-4 hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => showToast('Naar Helpcentrum')}>
                          <div className="text-[#e9edef] text-[17px]">Helpcentrum</div>
                       </div>
                       <div className="px-6 py-4 hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => showToast('Contact opnemen')}>
                          <div className="text-[#e9edef] text-[17px]">Contact opnemen</div>
                       </div>
                       <div className="px-6 py-4 hover:bg-[var(--color-wa-hover)] cursor-pointer" onClick={() => showToast('Voorwaarden openen')}>
                          <div className="text-[#e9edef] text-[17px]">Voorwaarden en privacybeleid</div>
                       </div>
                    </div>
                </div>
            );
        case 'new_community':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('communities')} className="mr-2"><ArrowLeft size={24} /></button>
                        Nieuwe community
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col items-center">
                        <div className="w-24 h-24 bg-gray-600 rounded-2xl flex items-center justify-center mb-6 text-white"><Users size={40}/></div>
                        <input type="text" placeholder="Naam van community" className="w-full bg-transparent border-b-2 border-[#00a884]text-[#e9edef] text-lg pb-2 mb-8 outline-none text-center" />
                        <textarea placeholder="Beschrijving van de community" className="w-full bg-transparent border-b-2 border-gray-600 text-[#e9edef] pb-2 mb-8 outline-none resize-none" rows={3}></textarea>
                        <button className="bg-[#00a884] text-[#111b21] p-4 rounded-full self-end hover:bg-[#008f6f]" onClick={() => {showToast("Community aangemaakt"); setActiveTab('communities');}}><ArrowLeft size={24} className="rotate-180" /></button>
                    </div>
                </div>
            );
        case 'community_examples':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('communities')} className="mr-2"><ArrowLeft size={24} /></button>
                        Voorbeelden
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                        <div className="text-[#e9edef] text-lg font-medium mb-4">Buurt</div>
                        <div className="bg-[#202c33] rounded-lg p-4 mb-6">
                           <div className="flex gap-4 items-center mb-2">
                             <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center text-white"><Users size={24} /></div>
                             <div className="text-[#e9edef] font-medium">Buurtpreventie</div>
                           </div>
                           <div className="text-[#8696a0] text-sm">2 groepen</div>
                        </div>
                        <div className="text-[#e9edef] text-lg font-medium mb-4">School</div>
                        <div className="bg-[#202c33] rounded-lg p-4">
                           <div className="flex gap-4 items-center mb-2">
                             <div className="w-12 h-12 bg-red-500 rounded-lg flex items-center justify-center text-white"><Users size={24} /></div>
                             <div className="text-[#e9edef] font-medium">Ouderraad basisschool</div>
                           </div>
                           <div className="text-[#8696a0] text-sm">5 groepen</div>
                        </div>
                    </div>
                </div>
            );
        case 'new_group':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('chats')} className="mr-2"><ArrowLeft size={24} /></button>
                        Nieuwe groep
                    </div>
                    <div className="px-6 py-4 border-b border-[var(--color-wa-border)] flex gap-4">
                        <Search size={20} className="text-[#8696a0]" />
                        <input type="text" placeholder="Leden zoeken..." className="bg-transparent outline-none flex-1 text-[#e9edef]"/>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                        <div className="text-[#8696a0] text-sm font-medium mb-4">Veel gecontacteerd</div>
                        <div className="flex gap-4 items-center hover:bg-[var(--color-wa-hover)] p-2 cursor-pointer rounded-lg" onClick={() => showToast('Geselecteerd')}>
                            <img 
                              src={GERDA_AVATAR} 
                              className="w-12 h-12 rounded-full object-cover hover:opacity-80 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsMobileChatOpen(true);
                                setActiveContact('gerda');
                                setShowContactProfile(true);
                              }}
                            />
                            <div className="text-[#e9edef] text-[16px]">Gerda</div>
                        </div>
                    </div>
                </div>
            );
        case 'starred':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('chats')} className="mr-2"><ArrowLeft size={24} /></button>
                        Berichten met ster
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-32 h-32 bg-gray-800 rounded-full flex items-center justify-center mb-6">
                            <span className="text-[50px]">⭐</span>
                        </div>
                        <div className="text-[#8696a0] text-[15px]">Tik in in chat op een bericht en houd deze vast om hem een ster te geven. Je kunt ze dan hier makkelijk terugvinden.</div>
                    </div>
                </div>
            );
        case 'status_settings':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center gap-6 shrink-0 text-white font-medium text-xl">
                        <button onClick={() => setActiveTab('status')} className="mr-2"><ArrowLeft size={24} /></button>
                        Statusprivacy
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                        <div className="text-[#8696a0] text-sm font-medium mb-4 uppercase">Wie mag mijn statusupdates zien</div>
                        <div className="mb-6">
                            <div className="flex gap-4 items-center py-3">
                                <input type="radio" name="status_priv" className="w-5 h-5 accent-[#00a884]" defaultChecked/>
                                <div className="text-[#e9edef] text-[17px]">Mijn contacten</div>
                            </div>
                            <div className="flex gap-4 items-center py-3">
                                <input type="radio" name="status_priv" className="w-5 h-5 accent-[#00a884]" />
                                <div className="text-[#e9edef] text-[17px]">Mijn contacten, behalve...</div>
                            </div>
                            <div className="flex gap-4 items-center py-3">
                                <input type="radio" name="status_priv" className="w-5 h-5 accent-[#00a884]" />
                                <div className="text-[#e9edef] text-[17px]">Alleen delen met...</div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        case 'status':
            return (
                <div className="flex flex-col h-full bg-[var(--color-wa-bg)]">
                    <div className="h-[108px] bg-[var(--color-wa-panel)] px-6 pt-12 pb-4 flex items-center justify-between shrink-0">
                        <span className="text-xl font-medium text-white">Status</span>
                        <div className="flex gap-4">
                            <button onClick={() => fileInputRef.current?.click()} className="text-[var(--color-wa-text-muted)] hover:text-white"><Plus size={24} /></button>
                            <button onClick={() => setActiveTab('status_settings')} className="text-[var(--color-wa-text-muted)] hover:text-white"><MoreVertical size={24} /></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <div className="px-4 py-3 text-[#00a884] uppercase text-[13px] font-semibold tracking-wide bg-[var(--color-wa-bg)]">
                            Recente updates
                        </div>
                        <div className="flex flex-col border-b border-[var(--color-wa-border)] bg-[var(--color-wa-bg)]">
                            <div 
                              className="flex items-center px-4 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer"
                              onClick={() => setViewImageUrl('https://i.imgur.com/zhSwcAX.jpeg')}
                            >
                                <div className="p-[2px] rounded-full border-2 border-[#00a884] mr-4">
                                    <img src={GERDA_AVATAR} alt="Gerda" className="w-[49px] h-[49px] rounded-full object-cover" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-[#e9edef] text-[17px] font-medium mt-1">Gerda</div>
                                    <div className="text-[var(--color-wa-text-muted)] text-[14px]">Zojuist</div>
                                </div>
                            </div>
                            <div className="px-4 pb-4">
                                <img 
                                    src="https://i.imgur.com/zhSwcAX.jpeg" 
                                    className="w-full rounded-lg object-contain cursor-pointer max-h-[400px] border border-[rgba(255,255,255,0.1)]" 
                                    onClick={() => setViewImageUrl('https://i.imgur.com/zhSwcAX.jpeg')} 
                                    alt="Status update"
                                />
                            </div>
                           <div 
                             className="flex items-center px-4 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer"
                           >
                               <div className="p-[2px] rounded-full border-2 border-[var(--color-wa-border)] mr-4">
                                   <img src={GERDA_AVATAR} alt="Gerda" className="w-[49px] h-[49px] rounded-full object-cover opacity-50" />
                               </div>
                               <div className="flex-1">
                                   <div className="text-[#e9edef] text-[17px] font-medium mt-1">Gerda</div>
                                   <div className="text-[var(--color-wa-text-muted)] text-[14px]">Gisteren</div>
                               </div>
                           </div>
                        </div>
                    </div>
                </div>
            );
        case 'calls':
            return (
                <div className="flex flex-col h-full bg-[var(--color-wa-bg)]">
                    <div className="h-[60px] flex items-center px-4 justify-between shrink-0 bg-[var(--color-wa-bg)]">
                      <span className="text-[22px] font-bold text-[#e9edef]">Calls</span>
                      <button onClick={() => { setCallHistory([]); showToast('Oproepgeschiedenis gewist'); }} className="text-[#00a884] text-sm font-medium hover:underline">Clear all</button>
                    </div>
                    <div className="p-2 border-b border-[var(--color-wa-border)] bg-[var(--color-wa-bg)]">
                      <div className="flex items-center bg-[var(--color-wa-panel)] rounded-lg px-4 py-1.5 focus-within:bg-[var(--color-wa-bg)] focus-within:border-[#00a884] focus-within:border">
                         <Search size={18} className="text-[var(--color-wa-text-muted)] group-focus-within:text-[#00a884]" />
                         <input 
                           type="text" 
                           placeholder="Search calls" 
                           className="bg-transparent border-none outline-none text-[15px] w-full ml-4 text-[var(--color-wa-text)] placeholder-[var(--color-wa-text-muted)]"
                           value={callSearchQuery}
                           onChange={(e) => setCallSearchQuery(e.target.value)}
                         />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto bg-[var(--color-wa-bg)] custom-scrollbar">
                        {callHistory.length === 0 ? (
                            <div className="p-4 text-[var(--color-wa-text-muted)] text-sm text-center mt-10">
                                Geen oproepgeschiedenis.
                            </div>
                        ) : (
                            callHistory.map(call => {
                                const callAvatar = GERDA_AVATAR;
                                const callName = 'Gerda';
                                return (
                                <div key={call.id} className="flex items-center px-4 py-3 bg-[var(--color-wa-bg)] hover:bg-[var(--color-wa-hover)] cursor-pointer">
                                    <img 
                                      src={callAvatar} 
                                      alt={callName} 
                                      className="w-[49px] h-[49px] rounded-full mr-3 object-cover hover:opacity-80 transition-opacity" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setViewImageUrl(callAvatar);
                                      }}
                                    />
                                    <div className="flex-1 border-b border-[var(--color-wa-border)] pb-3 mt-2">
                                        <div className="font-medium text-[#e9edef] text-[17px]">{callName}</div>
                                        <div className="flex items-center text-[14px] text-[var(--color-wa-text-muted)] mt-0.5">
                                            <PhoneOutgoing size={14} className="text-[#00a884] mr-1" />
                                            <span>{call.timestamp}</span>
                                        </div>
                                    </div>
                                    <div className="text-[var(--color-wa-text-muted)] text-sm flex items-center gap-4 border-b border-[var(--color-wa-border)] pb-3 mt-2 pr-2">
                                        <span>{formatDuration(call.duration)}</span>
                                        <Phone onClick={handleStartAudioCall} size={20} className="text-[var(--color-wa-text-muted)] hover:text-[#e9edef] transition-colors" title="Bellen" />
                                    </div>
                                </div>
                                );
                            })
                        )}
                    </div>
                </div>
            );
        case 'communities':
            return (
                <div className="flex flex-col h-full bg-[#0b141a]"> {/* Match main screen bg */}
                    <div className="h-[60px] flex items-center px-4 justify-between shrink-0 bg-[#0b141a]">
                      <span className="text-[22px] font-bold text-[#e9edef]">Community's</span>
                      <button onClick={() => showToast('Meer opties')} className="text-[#e9edef] p-2 hover:bg-white/10 rounded-full transition-colors"><MoreVertical size={24} /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto bg-[#0b141a] custom-scrollbar">
                        <div className="p-8 text-center text-[#e9edef] flex flex-col items-center">
                            <div className="mb-0 flex justify-center mt-2">
                              <img src="https://i.imgur.com/pu1QEur.jpeg" alt="Community" className="w-[220px]" />
                            </div>
                            <div className="text-[22px] font-bold mb-3 text-[#e9edef] leading-[28px] mt-2">Verbonden blijven met een<br/>community</div>
                            <p className="text-[15px] mb-6 leading-[22px] max-w-[340px] text-center text-[#e9edef]">Community's brengen leden samen in onderwerpsgroepen, waardoor je eenvoudig beheerdersaankondigingen kunt ontvangen. Community's waaraan je bent toegevoegd, verschijnen hier.</p>
                            <button onClick={() => setActiveTab('community_examples')} className="text-[#53bdec] mb-8 hover:underline text-[15px] font-medium tracking-wide">Voorbeelden van community's bekijken {'>'}</button>
                            <button className="bg-[#21c063] hover:bg-[#1faa59] text-[#111b21] px-6 py-[10px] rounded-full font-bold text-[15px] w-full max-w-[300px] transition-colors" onClick={() => setActiveTab('new_community')}>Starten met je community</button>
                        </div>
                    </div>
                </div>
            );
        case 'chats':
        default:
            return (
                <div className="flex flex-col h-full">
                    <div className="h-[60px] flex items-center px-4 justify-between shrink-0 bg-[var(--color-wa-bg)]">
                      <div className="flex items-center gap-2">
                        <span className="text-[22px] font-bold text-[#e9edef]">Chats</span>
                        <button 
                          id="add-contact-btn"
                          title="Nieuw contact toevoegen" 
                          onClick={handleAddCustomContact} 
                          className="hover:bg-[var(--color-wa-hover)] p-1.5 rounded-full text-[#00a884] hover:text-[#00c298] transition-colors"
                        >
                          <Plus size={22} strokeWidth={2.5} />
                        </button>
                      </div>
                      <div className="flex gap-3 text-[var(--color-wa-text-muted)] relative">
                         <button onClick={() => setActiveTab('settings')} className="hover:bg-[var(--color-wa-hover)] p-2 rounded-full transition-colors"><Settings size={20} /></button>
                         <button onClick={(e) => { e.stopPropagation(); setShowMenuMain(!showMenuMain); }} className="hover:bg-[var(--color-wa-hover)] p-2 rounded-full transition-colors relative"><MoreVertical size={20} /></button>
                         {showMenuMain && (
                            <div className="absolute right-0 top-10 w-[200px] bg-[#233138] rounded-md shadow-xl z-[100] py-2">
                               <div className="px-4 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer text-[#e9edef] text-sm" onClick={() => { setActiveTab('archived'); setShowMenuMain(false); }}>Gearchiveerd</div>
                                <div className="px-4 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer text-[#e9edef] text-sm" onClick={() => { setActiveTab('new_group'); setShowMenuMain(false); }}>Nieuwe groep</div>
                                <div className="px-4 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer text-[#e9edef] text-sm" onClick={() => { setActiveTab('starred'); setShowMenuMain(false); }}>Berichten met ster</div>
                               <div className="px-4 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer text-[#e9edef] text-sm" onClick={() => { setActiveTab('settings'); setShowMenuMain(false); }}>Instellingen</div>
                            </div>
                         )}
                      </div>
                    </div>
                    <div className="p-2 border-b border-[var(--color-wa-border)] bg-[var(--color-wa-bg)]">
                      <div className="flex items-center bg-[var(--color-wa-panel)] rounded-lg px-4 py-1.5 focus-within:bg-[var(--color-wa-bg)] focus-within:border-[#00a884] focus-within:border">
                         <Search size={18} className="text-[var(--color-wa-text-muted)] group-focus-within:text-[#00a884]" />
                         <input 
                           type="text" 
                           placeholder="Search or start a new chat" 
                           className="bg-transparent border-none outline-none text-[15px] w-full ml-4 text-[var(--color-wa-text)] placeholder-[var(--color-wa-text-muted)]"
                           value={chatSearchQuery}
                           onChange={(e) => setChatSearchQuery(e.target.value)}
                         />
                      </div>
                    </div>
                    {/* Filters */}
                    <div className="px-3 py-2 flex gap-2 border-b border-[var(--color-wa-border)] bg-[var(--color-wa-bg)]">
                        <button onClick={() => setChatFilter('All')} className={`${chatFilter === 'All' ? 'bg-[#0a332c] text-[#00a884]' : 'bg-[var(--color-wa-panel)] text-[var(--color-wa-text-muted)] hover:bg-[#2a3942]'} px-3 py-1 rounded-full text-sm font-medium`}>All</button>
                        <button onClick={() => setChatFilter('Unread')} className={`${chatFilter === 'Unread' ? 'bg-[#0a332c] text-[#00a884]' : 'bg-[var(--color-wa-panel)] text-[var(--color-wa-text-muted)] hover:bg-[#2a3942]'} px-3 py-1 rounded-full text-sm font-medium`}>Unread</button>
                        <button onClick={() => setChatFilter('Groups')} className={`${chatFilter === 'Groups' ? 'bg-[#0a332c] text-[#00a884]' : 'bg-[var(--color-wa-panel)] text-[var(--color-wa-text-muted)] hover:bg-[#2a3942]'} px-3 py-1 rounded-full text-sm font-medium`}>Groups</button>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-[var(--color-wa-bg)] custom-scrollbar">
                      <div className="px-3 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer flex items-center gap-4 text-[#00a884] font-medium border-b border-[var(--color-wa-border)]" onClick={() => setActiveTab('archived')}>
                         <Archive size={20} />
                         <span>Gearchiveerd</span>
                      </div>
                      {'Gerda'.toLowerCase().includes(chatSearchQuery.toLowerCase()) ? (
                        <div className={`flex items-center px-3 py-2.5 cursor-pointer ${activeContact === 'gerda' ? 'bg-[var(--color-wa-panel)]' : 'hover:bg-[var(--color-wa-hover)]'}`} onClick={() => {setIsMobileChatOpen(true); setActiveContact('gerda');}}>
                           <img 
                             src={GERDA_AVATAR} 
                             alt="Gerda" 
                             className="w-[49px] h-[49px] rounded-full mr-3 object-cover hover:opacity-80 transition-opacity" 
                             onClick={(e) => {
                               e.stopPropagation();
                               setIsMobileChatOpen(true); setActiveContact('gerda'); setShowContactProfile(true);
                             }}
                           />
                           <div className="flex-1 border-b border-[var(--color-wa-border)] pb-3 mt-2 pr-2">
                             <div className="flex justify-between items-center mb-0.5">
                               <span className="font-medium text-[#e9edef] text-[17px] cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setIsMobileChatOpen(true); setActiveContact('gerda'); setShowContactProfile(true); }}>Gerda</span>
                               <span className="text-xs text-[#00a884]">
                                 {messagesMap.gerda && messagesMap.gerda.length > 0 ? messagesMap.gerda[messagesMap.gerda.length-1].timestamp : '11:21'}
                               </span>
                             </div>
                             <div className="text-[14px] text-[var(--color-wa-text-muted)] truncate max-w-[240px]">
                               {isTypingMap.gerda ? <span className="text-[#00a884] font-medium">typing...</span> : (messagesMap.gerda && messagesMap.gerda.length > 0 ? messagesMap.gerda[messagesMap.gerda.length-1].text : '')}
                             </div>
                           </div>
                        </div>
                      ) : null }

                      {customContacts.map(contact => {
                        if (!contact.name.toLowerCase().includes(chatSearchQuery.toLowerCase())) return null;
                        
                        const hasMessages = messagesMap[contact.id] && messagesMap[contact.id].length > 0;
                        const lastMsg = hasMessages ? messagesMap[contact.id][messagesMap[contact.id].length-1] : null;
                        const isTyping = isTypingMap[contact.id];

                        return (
                          <div 
                            key={contact.id}
                            className={`flex items-center px-3 py-2.5 cursor-pointer relative group ${activeContact === contact.id ? 'bg-[var(--color-wa-panel)]' : 'hover:bg-[var(--color-wa-hover)]'}`} 
                            onClick={() => {
                              setIsMobileChatOpen(true); 
                              setActiveContact(contact.id);
                            }}
                          >
                             <img 
                               src={contact.profilePic} 
                               alt={contact.name} 
                               className="w-[49px] h-[49px] rounded-full mr-3 object-cover hover:opacity-80 transition-opacity flex-shrink-0" 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 setIsMobileChatOpen(true);
                                 setActiveContact(contact.id);
                                 setShowContactProfile(true);
                               }}
                             />
                             <div className="flex-1 border-b border-[var(--color-wa-border)] pb-3 mt-2 pr-2 min-w-0">
                               <div className="flex justify-between items-center mb-0.5">
                                 <span className="font-medium text-[#e9edef] text-[17px] truncate pr-2 hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); setIsMobileChatOpen(true); setActiveContact(contact.id); setShowContactProfile(true); }}>{contact.name || "Aangepast contact"}</span>
                                 <div className="flex items-center space-x-2">
                                   <span className="text-xs text-[#00a884]">
                                     {lastMsg ? lastMsg.timestamp : ''}
                                   </span>
                                   {/* Delete Button (Trash Icon) */}
                                   <button
                                     id={`delete-btn-${contact.id}`}
                                     title="Contact verwijderen"
                                     className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#374248] rounded text-red-400 hover:text-red-300 transition-all ml-1"
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       handleDeleteContact(contact.id);
                                     }}
                                   >
                                     <Trash2 className="w-4 h-4" />
                                   </button>
                                 </div>
                               </div>
                               <div className="text-[14px] text-[var(--color-wa-text-muted)] truncate max-w-[200px]">
                                 {isTyping ? <span className="text-[#00a884] font-medium">typing...</span> : (lastMsg ? lastMsg.text : '')}
                               </div>
                             </div>
                          </div>
                        );
                      })}
                      
                      {!('Gerda'.toLowerCase().includes(chatSearchQuery.toLowerCase())) && !customContacts.some(c => c.name.toLowerCase().includes(chatSearchQuery.toLowerCase())) && (
                          <div className="p-4 text-center text-[var(--color-wa-text-muted)] text-sm">Geen chats gevonden.</div>
                      )}
                    </div>
                </div>
            );
    }
  };

  return (
    <div 
      className="flex h-[100dvh] w-full bg-[var(--color-wa-bg)] text-[var(--color-wa-text)] overflow-hidden font-sans"
      onClick={() => {
        if (showMenuMain) setShowMenuMain(false);
        if (showMenuChat) setShowMenuChat(false);
        if (showMenuPlus) setShowMenuPlus(false);
      }}
    >
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-[#323739] text-[#e9edef] px-6 py-3 rounded-lg shadow-xl z-[999] transition-opacity duration-300">
            {toastMessage}
        </div>
      )}

      {/* Lightbox for Image Viewing */}
      {viewImageUrl && (
          <div className="absolute inset-0 z-[200] bg-black/90 flex items-center justify-center p-4" onClick={() => setViewImageUrl(null)}>
              <img src={viewImageUrl} alt="Full view" className="max-w-full max-h-full rounded-lg" />
              <div className="absolute top-4 right-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  title="Opslaan"
                  className="text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  onClick={async () => {
                    try {
                      let href = viewImageUrl;
                      let revoke: string | null = null;
                      if (!href.startsWith('data:')) {
                        const res = await fetch(href);
                        const blob = await res.blob();
                        href = URL.createObjectURL(blob);
                        revoke = href;
                      }
                      const a = document.createElement('a');
                      a.href = href;
                      a.download = `foto-${Date.now()}.${href.includes('image/png') ? 'png' : 'jpg'}`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      if (revoke) setTimeout(() => URL.revokeObjectURL(revoke!), 5000);
                      showToast('Foto opgeslagen');
                    } catch {
                      window.open(viewImageUrl, '_blank');
                    }
                  }}
                >
                  <Download size={22} />
                </button>
                <button className="text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors" onClick={() => setViewImageUrl(null)}>✕</button>
              </div>
          </div>
      )}


      {/* WhatsApp Desktop Left Rail */}
      <div className="hidden md:flex w-[64px] bg-[var(--color-wa-panel)] flex-col items-center py-3 justify-between h-full shrink-0 z-20">
        <div className="flex flex-col gap-2 w-full items-center">
          <button onClick={() => setActiveTab('chats')} className={`p-2 rounded-lg transition-colors ${activeTab === 'chats' ? 'bg-[#374248] text-[#e9edef]' : 'text-[var(--color-wa-text-muted)] hover:bg-[#202c33]'}`}>
            <MessageSquare size={24} className={activeTab === 'chats' ? 'fill-current' : ''} />
          </button>
          <button onClick={() => setActiveTab('calls')} className={`p-2 rounded-lg transition-colors ${activeTab === 'calls' ? 'bg-[#374248] text-[#e9edef]' : 'text-[var(--color-wa-text-muted)] hover:bg-[#202c33]'}`}>
            <Phone size={24} className={activeTab === 'calls' ? 'fill-current' : ''} />
          </button>
          <button onClick={() => setActiveTab('status')} className={`p-2 rounded-lg transition-colors ${activeTab === 'status' ? 'bg-[#374248] text-[#e9edef]' : 'text-[var(--color-wa-text-muted)] hover:bg-[#202c33]'}`}>
            <CircleDashed size={24} className={activeTab === 'status' ? 'fill-current' : ''} />
          </button>
        </div>
        <div className="flex flex-col gap-2 w-full items-center">
          <button onClick={() => setActiveTab('settings')} className={`p-2 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-[#374248] text-[#e9edef]' : 'text-[var(--color-wa-text-muted)] hover:bg-[#202c33]'}`}>
            <Settings size={24} className={activeTab === 'settings' ? 'fill-current' : ''} />
          </button>
          <img src={ME_AVATAR} alt="My Avatar" className="w-[32px] h-[32px] rounded-full mt-2 cursor-pointer object-cover" />
        </div>
      </div>

      {/* Sidebar List (Chats / Settings / etc) */}
      <div className={`${isMobileChatOpen ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[350px] border-r border-[rgba(255,255,255,0.1)] bg-[var(--color-wa-bg)] z-10 shrink-0`}>
         <div className="flex-1 min-h-0 relative">
           {renderSidebarContent()}
         </div>
         
         {/* Mobile Bottom Nav */}
         <div className="flex md:hidden bg-[#0b141a] border-t border-[rgba(255,255,255,0.05)] pt-2 pb-2 items-center justify-around shrink-0 w-full z-50">
             <button onClick={() => setActiveTab('chats')} className="flex flex-col items-center gap-1 min-w-[70px] cursor-pointer">
                <div className={`flex items-center justify-center px-4 py-1 rounded-full ${activeTab === 'chats' ? 'bg-[#103629] text-[#d1f4cc]' : 'text-[#e9edef]'}`}>
                    <MessageSquare size={24} strokeWidth={2} className={activeTab === 'chats' ? 'fill-current text-[#d1f4cc]' : 'text-[#e9edef]'} />
                </div>
                <span className={`text-[13px] font-medium ${activeTab === 'chats' ? 'text-[#e9edef]' : 'text-[#e9edef]'}`}>Chats</span>
             </button>
             
             <button onClick={() => setActiveTab('status')} className="flex flex-col items-center gap-1 min-w-[70px] cursor-pointer">
                <div className={`flex items-center justify-center px-4 py-1 rounded-full ${activeTab === 'status' ? 'bg-[#103629] text-[#d1f4cc]' : 'text-[#e9edef]'}`}>
                    <CircleDashed size={24} strokeWidth={2} className={activeTab === 'status' ? 'fill-current text-[#d1f4cc]' : 'text-[#e9edef]'} />
                </div>
                <span className={`text-[13px] font-medium ${activeTab === 'status' ? 'text-[#e9edef]' : 'text-[#e9edef]'}`}>Updates</span>
             </button>

             <button onClick={() => setActiveTab('communities')} className="flex flex-col items-center gap-1 min-w-[70px] cursor-pointer">
                <div className={`flex items-center justify-center px-4 py-1 rounded-full ${activeTab === 'communities' ? 'bg-[#103629] text-[#d1f4cc]' : 'text-[#e9edef]'}`}>
                    <Users size={24} strokeWidth={2} className={activeTab === 'communities' ? 'fill-current text-[#d1f4cc]' : 'text-[#e9edef]'} />
                </div>
                <span className={`text-[13px] font-medium ${activeTab === 'communities' ? 'text-[#e9edef]' : 'text-[#e9edef]'}`}>Community's</span>
             </button>

             <button onClick={() => setActiveTab('calls')} className="flex flex-col items-center gap-1 min-w-[70px] cursor-pointer">
                <div className={`flex items-center justify-center px-4 py-1 rounded-full ${activeTab === 'calls' ? 'bg-[#103629] text-[#d1f4cc]' : 'text-[#e9edef]'}`}>
                    <Phone size={24} strokeWidth={2} className={activeTab === 'calls' ? 'fill-current text-[#d1f4cc]' : 'text-[#e9edef]'} />
                </div>
                <span className={`text-[13px] font-medium ${activeTab === 'calls' ? 'text-[#e9edef]' : 'text-[#e9edef]'}`}>Oproepen</span>
             </button>
         </div>
      </div>

      {/* Main Chat Area */}
      <div className={`${isMobileChatOpen ? 'flex' : 'hidden md:flex'} flex-1 flex flex-row relative w-full h-full bg-[#0b141a] overflow-hidden`}>
        <div 
          className="flex-1 flex flex-col relative h-full min-w-0"
          style={{ 
            backgroundImage: 'url(https://i.imgur.com/STKI1y4.jpeg)', 
            backgroundPosition: 'center', 
            backgroundSize: 'cover' 
          }}
        >
          {/* Chat Background overlay to darken and keep text highly readable */}
          <div className="absolute inset-0 bg-black/40 pointer-events-none z-0"></div>
        
        {/* Call Overlay overlaying Chat Area */}
        {callState !== 'idle' && !isCallMinimized && (
          <div className="absolute inset-0 z-[100] bg-[#0b141a] flex flex-col pt-4 overflow-hidden animate-in fade-in zoom-in duration-300">
            {isVideoCall ? (
               <div className="absolute inset-0 z-0 bg-black flex items-center justify-center">
                 {/* AI Video Vertical Pillar */}
                 <div className="relative h-[95vh] aspect-[9/16] bg-[#111b21] rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                   <video 
                     ref={videoRef} 
                     src={activeVideo} 
                     playsInline 
                     muted 
                     preload="auto"
                     className="absolute inset-0 w-full h-full object-cover"
                   />
                   <img 
                     ref={frameImgRef}
                     alt="Video frames"
                     className="absolute inset-0 w-full h-full object-cover"
                     style={{ display: 'none' }}
                   />
                   <img 
                     src={activeOverlay} 
                     alt="Video overlay" 
                     className="absolute inset-0 w-full h-full object-cover pointer-events-none z-[1]"
                   />
                   <img 
                     src="https://i.imgur.com/ojY1KVC.gif" 
                     alt="Extra overlay" 
                     className="absolute inset-0 w-full h-full object-cover pointer-events-none z-[2]"
                   />
                   {activeFilter === 'hamburger' && (
                     <img src="https://i.imgur.com/YXABJOo.png" alt="Hamburger filter" className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10" />
                   )}
                   {activeFilter === 'dog' && (
                     <img src="https://i.imgur.com/gBHmCR0.png" alt="Dog filter" className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10" />
                   )}
                   {activeFilter === 'cat' && (
                     <img src="https://i.imgur.com/BaxaC7g.png" alt="Cat filter" className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10" />
                   )}
                   <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none z-20"></div>
                 </div>
                 
                 {/* User PIP */}
                 <div className="absolute top-20 right-6 w-32 h-44 bg-[#1c272eb3] rounded-xl overflow-hidden border border-white/10 shadow-2xl z-20">
                    <video 
                      ref={localVideoRef}
                      autoPlay 
                      playsInline 
                      muted 
                      className="w-full h-full object-cover transform scale-x-[-1]" 
                    />
                 </div>
               </div>
            ) : (
                <>
                  <div className="absolute inset-0 opacity-15 pointer-events-none scale-110 blur-3xl z-0" style={{ backgroundImage: `url(${activeAvatar})`, backgroundPosition: 'center', backgroundSize: 'cover' }}></div>
                  <div className="absolute inset-0 bg-[#0b141a]/60 z-0"></div>
                </>
            )}
            
            {/* Top actions */}
            <div className="flex justify-between items-center px-6 pt-4 relative z-10">
               <button onClick={() => setIsCallMinimized(true)} className="p-2.5 bg-black/20 hover:bg-black/40 rounded-full text-white backdrop-blur-sm transition-all active:scale-95">
                 <ChevronDown size={28} />
               </button>
               <div className="flex flex-col items-center gap-1 drop-shadow-lg">
                 <div className="flex items-center gap-1.5 text-white/50 text-[11px] font-medium tracking-widest uppercase">
                   <Lock size={10} strokeWidth={3} />
                   END-TO-END VERSLEUTELD
                 </div>
               </div>
               <button onClick={() => showToast('U kunt in deze demo geen groepen aanmaken tijdens de call')} className="p-2.5 bg-black/20 hover:bg-black/40 rounded-full text-white backdrop-blur-sm transition-all active:scale-95">
                 <UserPlus size={24} />
               </button>
            </div>
 
            {/* Call Header info */}
            <div className={`flex flex-col items-center flex-1 relative z-10 w-full pointer-events-none ${isVideoCall ? 'pt-8' : 'justify-center -mt-16'}`}>
               {!isVideoCall && (
                 <div className="relative mb-10 group">
                    <div className={`absolute inset-0 rounded-full bg-[#00a884]/20 animate-ping duration-[3s] ${callState === 'connected' ? 'opacity-0' : 'opacity-100'}`}></div>
                    <img src={activeAvatar} alt={activeName} className="w-[180px] h-[180px] rounded-full relative z-10 object-cover shadow-[0_4px_30px_rgba(0,0,0,0.5)] ring-1 ring-white/10" />
                 </div>
               )}
               <h2 className="text-[32px] font-medium text-white mb-2 drop-shadow-xl">{activeName}</h2>
               <div className="flex flex-col items-center">
                 <p className={`${isVideoCall ? 'text-white/90' : 'text-white/60'} text-lg font-normal tracking-wide drop-shadow-md`}>
                   {callState === 'calling' ? 'Bellen...' : formatDuration(callDuration)}
                 </p>
               </div>
            </div>

            {/* Call Controls Panel - Modern WA Style Floating Island */}
            <div className="px-6 pb-12 relative z-10 w-full bg-gradient-to-t from-black/40 to-transparent">
              {showFilterMenu && isVideoCall && (
                <div className="max-w-md mx-auto mb-4 bg-[#1c272e]/95 backdrop-blur-2xl rounded-3xl p-4 flex gap-4 justify-center items-center shadow-xl border border-white/5 animate-in fade-in slide-in-from-bottom-2">
                  <button onClick={() => { setActiveFilter('none'); setShowFilterMenu(false); }} className={`w-14 h-14 rounded-full overflow-hidden border-2 transition-all shrink-0 ${activeFilter === 'none' ? 'border-[#00a884] scale-110' : 'border-transparent hover:border-white/30'}`}>
                    <img src="https://i.imgur.com/FyyMqCu.png" alt="Geen" className="w-full h-full object-cover bg-white" />
                  </button>
                  <button onClick={() => { setActiveFilter('hamburger'); setShowFilterMenu(false); }} className={`w-14 h-14 rounded-full overflow-hidden border-2 transition-all shrink-0 ${activeFilter === 'hamburger' ? 'border-[#00a884] scale-110' : 'border-transparent hover:border-white/30'}`}>
                    <img src="https://i.imgur.com/DCBuRlT.png" alt="Hamburger" className="w-full h-full object-cover bg-white" />
                  </button>
                  <button onClick={() => { setActiveFilter('dog'); setShowFilterMenu(false); }} className={`w-14 h-14 rounded-full overflow-hidden border-2 transition-all shrink-0 ${activeFilter === 'dog' ? 'border-[#00a884] scale-110' : 'border-transparent hover:border-white/30'}`}>
                    <img src="https://i.imgur.com/0PHglvx.png" alt="Hond" className="w-full h-full object-cover bg-white" />
                  </button>
                  <button onClick={() => { setActiveFilter('cat'); setShowFilterMenu(false); }} className={`w-14 h-14 rounded-full overflow-hidden border-2 transition-all shrink-0 ${activeFilter === 'cat' ? 'border-[#00a884] scale-110' : 'border-transparent hover:border-white/30'}`}>
                    <img src="https://i.imgur.com/YBF0lAw.png" alt="Kat" className="w-full h-full object-cover bg-white" />
                  </button>
                </div>
              )}
              <div className="max-w-md mx-auto bg-[#1c272e]/95 backdrop-blur-2xl rounded-[40px] px-8 py-6 flex items-center justify-between border border-white/5 shadow-2xl">
                 <button onClick={() => setIsSpeakerOn(!isSpeakerOn)} className="flex flex-col items-center gap-1.5">
                   <div className={`w-12 h-12 ${isSpeakerOn ? 'bg-[#00a884] text-white hover:bg-[#00a884]/80' : 'bg-white/5 hover:bg-white/10 text-white'} rounded-full flex items-center justify-center transition-all active:scale-90`}>
                     <CircleDashed size={24} />
                   </div>
                 </button>

                 <button onClick={() => setIsVideoOff(!isVideoOff)} className="flex flex-col items-center gap-1.5">
                   <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90 ${isVideoOff ? 'bg-red-500/20 text-red-500' : 'bg-white/5 hover:bg-white/10 text-white'}`}>
                     <Video size={24} />
                   </div>
                 </button>

                 <button onClick={() => setIsMicMuted(!isMicMuted)} className="flex flex-col items-center gap-1.5">
                   <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90 ${isMicMuted ? 'bg-red-500/20 text-red-500' : 'bg-white/5 hover:bg-white/10 text-white'}`}>
                     <Mic size={24} />
                   </div>
                 </button>

                 {isVideoCall && (
                   <button onClick={() => setShowFilterMenu(!showFilterMenu)} className="flex flex-col items-center gap-1.5">
                     <div className={`w-12 h-12 ${showFilterMenu ? 'bg-white/20 text-white' : 'bg-white/5 hover:bg-white/10 text-white'} rounded-full flex items-center justify-center transition-all active:scale-90`}>
                       <Smile size={24} />
                     </div>
                   </button>
                 )}

                 <button onClick={endCall} className="w-[68px] h-[68px] bg-[#ea0038] flex items-center justify-center rounded-full hover:bg-[#d00030] transition-all active:scale-95 shadow-[0_4px_20px_rgba(234,0,56,0.3)] shrink-0">
                   <PhoneOff size={32} className="text-white" />
                 </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Chat Header */}
        {isSelectMode ? (
          <div className="h-[60px] bg-[var(--color-wa-panel)] flex items-center px-4 justify-between shrink-0 relative z-[60] w-full">
            <div className="flex items-center gap-4 text-[#e9edef]">
               <button onClick={() => { setIsSelectMode(false); setActiveMessageIds(new Set()); }} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ArrowLeft size={24} /></button>
               <span className="font-medium text-[19px]">{activeMessageIds.size}</span>
            </div>
            <div className="flex gap-4 items-center">
               <button onClick={() => {
                  const selectedMessages = messages.filter(m => activeMessageIds.has(m.id)).map(m => m.text).filter(Boolean);
                  if (selectedMessages.length > 0) {
                      navigator.clipboard.writeText(selectedMessages.join('\n'));
                      showToast('Gekopieerd!');
                  }
                  setIsSelectMode(false);
                  setActiveMessageIds(new Set());
               }} className="text-[var(--color-wa-text-muted)] hover:text-[#e9edef] p-2 hover:bg-white/10 rounded-full transition-colors">
                 <Copy size={24} />
               </button>
               <button onClick={() => {
                  setShowDeleteModal(true);
               }} className="text-[var(--color-wa-text-muted)] hover:text-[#e9edef] p-2 hover:bg-white/10 rounded-full transition-colors">
                 <Trash2 size={24} />
               </button>
            </div>
          </div>
        ) : (
          <div className="h-[60px] bg-[var(--color-wa-panel)] flex items-center px-4 justify-between shrink-0 relative z-[60] w-full">
            <div className="flex items-center">
              <div className="md:hidden mr-3 cursor-pointer" onClick={() => setIsMobileChatOpen(false)}>
                  <ArrowLeft size={24} className="text-[var(--color-wa-text-muted)]" />
              </div>
              <img 
                src={activeAvatar} 
                alt={activeName} 
                className="w-10 h-10 rounded-full mr-4 object-cover cursor-pointer hover:opacity-80 transition-opacity" 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowContactProfile(true);
                }}
              />
              <div className="cursor-pointer" onClick={() => setShowContactProfile(true)}>
                <div className="font-medium text-[#e9edef]">{activeName}</div>
                <div className="text-xs text-[var(--color-wa-text-muted)]">
                  {isTyping ? <span className="text-[#e9edef]">typing...</span> : (callState === 'connected' ? 'In gesprek...' : 'online')}
                </div>
              </div>
            </div>
            <div className="flex gap-4 text-[var(--color-wa-text-muted)] items-center">
              {callState !== 'idle' && isCallMinimized ? (
                <button onClick={() => setIsCallMinimized(false)} className="bg-[#00a884] hover:bg-[#008f6f] px-4 py-1.5 rounded-full text-white text-sm font-semibold transition-colors flex items-center gap-2 mr-2">
                   <span>Terug naar oproep</span>
                   <span>{formatDuration(callDuration)}</span>
                </button>
              ) : (
                 <button onClick={handleStartAudioCall} className="hover:text-[#e9edef] p-1 transition-colors" title="Bellen">
                   <Phone size={20} />
                 </button>
              )}
              <button onClick={handleStartVideoCall} className="hover:text-[#e9edef] p-1 transition-colors" title="Videobellen">
                 <Video size={20} />
              </button>
              {activeContact !== 'gerda' && (
                <button onClick={() => setShowCustomContactSettings(true)} className="hover:text-[#e9edef] p-1 transition-colors" title="Instellingen">
                   <Settings size={20} />
                </button>
              )}
              <button onClick={() => setIsSearchingChat(!isSearchingChat)} className="hover:text-[#e9edef] p-1"><Search size={20} /></button>
              <div className="relative">
                <button onClick={(e) => { e.stopPropagation(); setShowMenuChat(!showMenuChat); }} className="hover:text-[#e9edef] p-1"><MoreVertical size={20} /></button>
                {showMenuChat && (
                  <div className="absolute right-0 top-10 w-[200px] bg-[#233138] rounded-md shadow-xl z-[100] py-2">
                    <div className="px-4 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer text-[#e9edef] text-sm" onClick={() => { setIsMobileChatOpen(false); setShowMenuChat(false); }}>Contactgegevens</div>
                    <div className="px-4 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer text-[#e9edef] text-sm" onClick={() => { setIsSelectMode(!isSelectMode); setShowMenuChat(false); }}>{isSelectMode ? 'Selecteren annuleren' : 'Berichten selecteren'}</div>
                    <div className="px-4 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer text-[#e9edef] text-sm" onClick={() => { setIsMuted(!isMuted); showToast(isMuted ? 'Meldingen aan' : 'Meldingen gedempt'); setShowMenuChat(false); }}>{isMuted ? 'Meldingen aan' : 'Meldingen dempen'}</div>
                    <div className="px-4 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer text-[#e9edef] text-sm" onClick={() => { setMessagesForContact(activeContact, () => []); setShowMenuChat(false); }}>Chat wissen</div>
                    <div className="px-4 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer text-[#e9edef] text-sm text-red-500 font-medium" onClick={() => { setMessagesForContact(activeContact, () => []); setIsMobileChatOpen(false); setShowMenuChat(false); }}>Chat verwijderen</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showCustomContactSettings ? (
          <div className="flex-1 overflow-y-auto bg-[var(--color-wa-bg)] relative z-10 p-8 custom-scrollbar">
            <div className="max-w-2xl mx-auto bg-[var(--color-wa-panel)] rounded-xl p-6 shadow-md border border-white/5">
               <h2 className="text-2xl font-semibold mb-6 flex items-center justify-between text-[#e9edef]">
                  Aangepast contact instellen
                  {activeContactConfig.isConfigured && (
                     <button onClick={() => setShowCustomContactSettings(false)} className="text-[#00a884] hover:underline text-sm font-normal">
                       Naar chat
                     </button>
                  )}
               </h2>
               <div className="space-y-5">
                 <div>
                   <label className="block text-[#8696a0] text-sm mb-2">Naam</label>
                   <input type="text" value={activeContactConfig.name} onChange={(e) => updateCustomContact(activeContact, { name: e.target.value })} className="w-full bg-[#2a3942] rounded-lg px-4 py-3 outline-none focus:ring-1 focus:ring-[#00a884] text-[#e9edef]" placeholder="Naam van contact" />
                  </div>
                  <div>
                    <label className="block text-[#8696a0] text-sm mb-2">Telefoonnummer</label>
                    <input type="text" value={activeContactConfig.phoneNumber || ''} onChange={(e) => updateCustomContact(activeContact, { phoneNumber: e.target.value })} className="w-full bg-[#2a3942] rounded-lg px-4 py-3 outline-none focus:ring-1 focus:ring-[#00a884] text-[#e9edef]" placeholder="Bijv.: 020-2254002" />
                  </div>
                  <div>
                    <label className="block text-[#8696a0] text-sm mb-2">Info / Status (Bio)</label>
                    <input type="text" value={activeContactConfig.bio || ''} onChange={(e) => updateCustomContact(activeContact, { bio: e.target.value })} className="w-full bg-[#2a3942] rounded-lg px-4 py-3 outline-none focus:ring-1 focus:ring-[#00a884] text-[#e9edef]" placeholder="Bijv.: Leker in de mekdonalts 🍔 met brendi's pasje" />
                 </div>
                 <div>
                   <label className="block text-[#8696a0] text-sm mb-2">Systeem Instructie (Karakter, Gedrag, Stem)</label>
                   <textarea value={activeContactConfig.sysInstruct} onChange={(e) => updateCustomContact(activeContact, { sysInstruct: e.target.value })} className="w-full bg-[#2a3942] rounded-lg px-4 py-3 outline-none focus:ring-1 focus:ring-[#00a884] min-h-[120px] text-[#e9edef]" placeholder="Je bent een..." />
                 </div>
                 <div>
                   <label className="block text-[#8696a0] text-sm mb-2">Profielfoto of referentie AI-beeld (URL of base64 via upload)</label>
                   <input type="text" value={activeContactConfig.profilePic} onChange={(e) => updateCustomContact(activeContact, { profilePic: e.target.value })} className="w-full bg-[#2a3942] rounded-lg px-4 py-3 outline-none focus:ring-1 focus:ring-[#00a884] text-[#e9edef]" />
                 </div>
                 <div>
                   <label className="block text-[#8696a0] text-sm mb-2">Stemprompt (Automatisch gegenereerde spreekstijl, intonatie of accent)</label>
                   <textarea value={activeContactConfig.voicePrompt || ''} onChange={(e) => updateCustomContact(activeContact, { voicePrompt: e.target.value })} className="w-full bg-[#2a3942] rounded-lg px-4 py-3 outline-none focus:ring-1 focus:ring-[#00a884] min-h-[60px] text-[#e9edef]" placeholder="Bijv.: Spreek langzaam, rustig en met een warme toon." />
                 </div>
                 <div className="pt-2">
                   <button onClick={() => document.getElementById('custom-pic-upload')?.click()} className="bg-[#2a3942] hover:bg-[#32424d] text-[#e9edef] px-4 py-2 rounded-lg font-medium transition-colors">Foto Uploaden</button>
                   <input type="file" id="custom-pic-upload" className="hidden" accept="image/*" onChange={(e) => {
                     const file = e.target.files?.[0];
                     if(file) {
                       const reader = new FileReader();
                       reader.onloadend = () => updateCustomContact(activeContact, { profilePic: reader.result as string });
                       reader.readAsDataURL(file);
                     }
                   }} />
                 </div>
                 
                 <div className="pt-6 border-t border-white/5 flex justify-end">
                   <button onClick={() => {
                     setIsSavingContact(true);
                     showToast('Een stem en stemprompt genereren...');
                     chooseVoiceAndPrompt(activeContactConfig.sysInstruct).then(res => {
                       updateCustomContact(activeContact, { isConfigured: true, voiceName: res.voiceName, voicePrompt: res.voicePrompt });
                       setShowCustomContactSettings(false);
                       showToast(`Stem: ${res.voiceName} geselecteerd met passend spraakprofiel!`);
                       setIsSavingContact(false);
                     }).catch(e => {
                       updateCustomContact(activeContact, { isConfigured: true, voiceName: 'Aoede', voicePrompt: activeContactConfig.voicePrompt || 'Spreek vriendelijk en op een natuurlijke toon.' });
                       setShowCustomContactSettings(false);
                       showToast('Contact opgeslagen! (Standaard stem Aoede)');
                       setIsSavingContact(false);
                     });
                   }} disabled={isSavingContact} className="bg-[#00a884] hover:bg-[#008f6f] disabled:opacity-50 px-6 py-2.5 rounded-lg text-white font-medium transition-colors">
                     {isSavingContact ? 'Bezig...' : 'Opslaan'}
                   </button>
                 </div>
               </div>
            </div>
          </div>
        ) : (
          <>
        {/* Chat Messages */}
        {isSearchingChat && (
           <div className="bg-[var(--color-wa-bg)] border-b border-[var(--color-wa-border)] flex items-center px-4 py-2 shrink-0 z-20">
              <div className="flex items-center flex-1 bg-[var(--color-wa-panel)] rounded-lg px-4 py-1.5 focus-within:bg-[var(--color-wa-bg)] focus-within:border-[#00a884] focus-within:border">
                 <Search size={18} className="text-[var(--color-wa-text-muted)] group-focus-within:text-[#00a884]" />
                 <input 
                   type="text" 
                   placeholder="Zoeken in gesprek" 
                   className="bg-transparent border-none outline-none text-[#e9edef] text-[15px] flex-1 ml-3"
                   value={chatMessageSearchQuery}
                   onChange={(e) => setChatMessageSearchQuery(e.target.value)}
                   autoFocus
                 />
                 <button onClick={() => { setIsSearchingChat(false); setChatMessageSearchQuery(''); }} className="text-[var(--color-wa-text-muted)] ml-2">
                    <X size={18} />
                 </button>
              </div>
           </div>
        )}
        <div className="flex-1 overflow-y-auto py-4 space-y-2 relative z-10 custom-scrollbar">
          <div className="flex justify-center mb-6 px-[5%] md:px-[10%]">
            <span className="bg-[var(--color-wa-panel)] text-[var(--color-wa-text-muted)] text-xs px-3 py-1 rounded-md uppercase">Vandaag</span>
          </div>

          <div className="flex justify-center mb-6 px-[5%] md:px-[10%]">
             <div className="bg-[#182229] border border-[#233138] text-[#ffd279] text-[13px] px-3 py-2 rounded-lg text-center max-w-sm">
                <span className="block mb-1">Berichten en oproepen zijn end-to-end versleuteld. Niemand buiten deze chat kan ze lezen of beluisteren, zelfs WhatsApp niet.</span>
             </div>
          </div>

          {messages.filter(msg => !chatMessageSearchQuery || msg.text?.toLowerCase().includes(chatMessageSearchQuery.toLowerCase())).map((msg, i, arr) => {
            const isMe = msg.sender === 'user';
            
            // Check if previous message goes with this one
            const prevMsg = arr[i-1];
            const isFirstInGroup = !prevMsg || prevMsg.sender !== msg.sender;
            
            return (
              <div 
                key={msg.id} 
                className={`flex items-center w-full px-[5%] md:px-[10%] relative ${isSelectMode ? 'cursor-pointer py-0.5' : ''} ${isSelectMode && !activeMessageIds.has(msg.id) ? 'hover:bg-white/5' : ''} ${activeMessageIds.has(msg.id) ? 'bg-[#00a884]/40' : ''} ${isFirstInGroup ? 'mt-2' : 'mt-0.5'}`}
                onClick={() => {
                   if (isSelectMode) {
                      const newSet = new Set(activeMessageIds);
                      if (newSet.has(msg.id)) newSet.delete(msg.id);
                      else newSet.add(msg.id);
                      setActiveMessageIds(newSet);
                   }
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    if (!isSelectMode) {
                        setIsSelectMode(true);
                        setActiveMessageIds(new Set([msg.id]));
                    }
                }}
              >
                <div className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div 
                    className={`relative max-w-[85%] md:max-w-[70%] px-2 py-1.5 rounded-lg shadow-sm text-[15px]
                      ${isMe ? 'bg-[var(--color-wa-msg-out)] text-[#e9edef] ' + (isFirstInGroup ? 'msg-tail-out rounded-tr-none' : '') : 'bg-[var(--color-wa-panel)] text-[#e9edef] ' + (isFirstInGroup ? 'msg-tail-in rounded-tl-none' : '')}
                    `}
                  >
                  {msg.isCallLog ? (
                    <div className="flex items-center gap-3 pr-10 pb-3 pl-1 min-w-[200px]">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-black/20 flex items-center justify-center">
                        {msg.isVideoCall ? <Video size={22} className="text-[#a6b1b6]" /> : <PhoneOutgoing size={22} className="text-[#a6b1b6]" />}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[16px] leading-tight text-[#e9edef] mb-0.5">{msg.isVideoCall ? 'Videogesprek' : 'Spraakoproep'}</span>
                        <span className="text-[14px] text-[#8696a0]">
                          {msg.callStatus === 'missed' ? 'Geen antwoord' : (
                            (msg.callDuration || 0) < 60 ? `${msg.callDuration || 0} sec` : `${Math.floor((msg.callDuration || 0) / 60)} min`
                          )}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {msg.imageUrl && (
                        <div className="mb-1 cursor-pointer" onClick={() => setViewImageUrl(msg.imageUrl!)}>
                          <img src={msg.imageUrl} alt="chat attachment" className="rounded-lg max-h-72 object-cover" />
                        </div>
                      )}
                      {msg.videoUrl && (
                        <div className="mb-1">
                          <video src={msg.videoUrl} controls playsInline className="rounded-lg max-h-72 max-w-full bg-black" />
                        </div>
                      )}
                      {msg.audioUrl && (
                        <AudioMessagePlayer 
                          avatar={isMe ? meAvatar : activeAvatar} 
                          duration={msg.audioDuration} 
                          isMe={isMe} 
                          audioUrl={msg.audioUrl} 
                        />
                      )}
                      {msg.text && (msg.sender !== 'user' || !msg.audioUrl) ? (
                        <div className="px-1 text-[#e9edef] leading-snug">
                          {(() => {
                            const isTikkie = msg.text.toLowerCase().includes('tikkie.me') || msg.text.toLowerCase().includes('tikkie');
                            if (isTikkie) {
                              const amountMatch = msg.text.match(/€\s*(\d+[,.]\d+)/);
                              const amount = amountMatch ? amountMatch[0] : '€ 6,50';
                              const forMatch = msg.text.match(/voor\s*['"]([^'"]+)['"]/i);
                              const purpose = forMatch ? forMatch[1] : 'Patat';
                              
                              return (
                                <div className="flex flex-col min-w-[240px] md:min-w-[280px]">
                                  {/* Tikkie Preview Card */}
                                  <a 
                                    href="https://tikkie.me" 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className={`flex items-center gap-3 p-2 rounded-lg mb-2 transition-colors border-l-4 border-[#00a884] block
                                      ${isMe ? 'bg-[#004e3f] hover:bg-[#004537]' : 'bg-[#121b22] hover:bg-[#1a2730]'}
                                    `}
                                  >
                                    <div className="w-12 h-12 bg-white rounded-lg flex-shrink-0 flex items-center justify-center shadow-sm">
                                      <div className="w-9 h-9 rounded-full bg-[#00a884] flex items-center justify-center text-white font-bold text-lg select-none">
                                        €
                                      </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[13px] font-semibold text-white truncate leading-tight">Betaalverzoekjes via Tikkie</div>
                                      <div className="text-[11px] text-[#8696a0] truncate leading-normal font-normal">Eenvoudig, snel én veilig betalen</div>
                                      <div className="text-[11px] text-[#00a884] font-medium flex items-center gap-1 mt-0.5">
                                        <Globe size={11} className="inline flex-shrink-0" />
                                        <span>tikkie.me</span>
                                      </div>
                                    </div>
                                  </a>
                                  
                                  {/* Text with highlighted links */}
                                  <p className={`whitespace-pre-wrap pb-3 ${msg.text.length < 10 ? 'mr-12' : 'mr-2'}`}>
                                    {renderHighlightedText(msg.text)}
                                  </p>
                                </div>
                              );
                            }
                            
                            return (
                              <p className={`whitespace-pre-wrap ${msg.text.length < 10 ? 'mr-12' : 'mr-4 pb-3'}`}>
                                {renderHighlightedText(msg.text)}
                              </p>
                            );
                          })()}
                        </div>
                      ) : null}
                    </>
                  )}
                  <span className="text-[11px] text-[#8696a0] absolute bottom-1 right-2 w-max leading-none flex items-center gap-1">
                    {msg.timestamp}
                    {isMe && <span className="text-[#53bdeb] text-[13px]">✓✓</span>}
                  </span>
                </div>
                </div>
              </div>
            );
          })}
          
          {isTyping && <TypingIndicator />}
          
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-transparent px-3 pb-4 pt-1 flex items-end gap-2 relative z-10 w-full shrink-0 mt-auto min-h-[62px]">
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFileChange} />
          
          <div className="flex flex-col w-full relative">
            {pendingImage && (
                <div className="mb-2 ml-2 relative w-20 h-20 bg-[#202c33] p-1.5 rounded-lg border border-white/10 shadow-lg">
                    <img src={pendingImage} className="w-full h-full object-cover rounded" />
                    <button onClick={() => setPendingImage(null)} className="absolute -top-1.5 -right-1.5 bg-[#00a884] rounded-full p-0.5 text-white text-xs w-5 h-5 flex items-center justify-center font-bold">✕</button>
                </div>
            )}
            {pendingVideo && (
                <div className="mb-2 ml-2 relative w-28 h-20 bg-[#202c33] p-1.5 rounded-lg border border-white/10 shadow-lg">
                    <video src={pendingVideo.url} className="w-full h-full object-cover rounded" muted />
                    <button onClick={() => { URL.revokeObjectURL(pendingVideo.url); setPendingVideo(null); }} className="absolute -top-1.5 -right-1.5 bg-[#00a884] rounded-full p-0.5 text-white text-xs w-5 h-5 flex items-center justify-center font-bold">✕</button>
                </div>
            )}
            <div className="flex items-end gap-2 w-full">
              {/* Pill-shaped capsule input container */}
              <div className="flex-1 bg-[#202c33] rounded-[24px] px-3.5 py-1.5 flex items-center gap-2.5 border border-white/5 min-h-[48px] relative shadow-md">
                {isRecording ? (
                  /* Recording interface */
                  <div className="flex-1 flex items-center justify-between text-[#ff4c4c] font-medium px-2 py-1 select-none">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#ff4c4c] animate-pulse shrink-0"></div>
                      <span className="text-[#e9edef] font-mono text-[15px]">{formatVoiceDuration(recordingSeconds)}</span>
                    </div>
                    <span className="text-[#8696a0] text-sm animate-pulse">Aan het opnemen...</span>
                    <button 
                      type="button"
                      onClick={cancelRecording}
                      className="text-[#8696a0] hover:text-[#ff4c4c] transition-colors p-1"
                      title="Opname annuleren"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Emoji button */}
                    <div className="relative flex items-center justify-center shrink-0">
                      <button 
                        type="button"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)} 
                        className="text-[#8696a0] hover:text-[#e9edef] transition-colors p-1"
                        title="Emoji's"
                      >
                        <Smile size={24} strokeWidth={2} />
                      </button>
                      {showEmojiPicker && (
                         <div className="absolute bottom-14 left-0 z-50 shadow-2xl rounded-xl overflow-hidden">
                             <EmojiPicker onEmojiClick={(emojiData: EmojiClickData) => {
                                 setInputText(prev => prev + emojiData.emoji);
                                 setShowEmojiPicker(false);
                             }} />
                         </div>
                      )}
                    </div>

                    {/* Text Area Input */}
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSend();
                      }} 
                      className="flex-1 flex items-center relative"
                    >
                      <textarea 
                        value={inputText}
                        onChange={e => setInputText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder="Bericht"
                        
                        rows={1}
                        style={{ caretColor: '#00a884' }}
                        className="bg-transparent border-none outline-none w-full text-[16px] placeholder-[#8696a0] text-[#e9edef] px-1 py-1.5 resize-none overflow-hidden max-h-[100px] leading-relaxed"
                      />
                    </form>

                    {/* Attachment Menu & Paperclip button */}
                    <div className="relative flex items-center justify-center shrink-0">
                      <button 
                        type="button" 
                        onClick={(e) => { e.stopPropagation(); setShowMenuPlus(!showMenuPlus); }} 
                        className="text-[#8696a0] hover:text-[#e9edef] transition-colors p-1"
                        title="Bijlage toevoegen"
                      >
                        <Paperclip size={22} className={`transition-transform duration-200 ${showMenuPlus ? 'rotate-45 text-[#e9edef]' : ''}`} />
                      </button>
                      {showMenuPlus && (
                        <div className="absolute bottom-14 right-0 w-[200px] bg-[#233138] rounded-xl shadow-2xl z-[100] py-2 overflow-hidden border border-white/10 animate-in slide-in-from-bottom-2">
                           <div className="px-4 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer text-[#e9edef] text-[15px] flex items-center gap-3 active:bg-[#182229]" onClick={() => { fileInputRef.current?.click(); setShowMenuPlus(false); }}>
                             <div className="w-8 h-8 rounded-full bg-[#bf59cf] flex items-center justify-center text-white font-bold"><Plus size={18} /></div>
                             Documenten
                           </div>
                           <div className="px-4 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer text-[#e9edef] text-[15px] flex items-center gap-3 active:bg-[#182229]" onClick={() => { fileInputRef.current?.click(); setShowMenuPlus(false); }}>
                             <div className="w-8 h-8 rounded-full bg-[#007bfc] flex items-center justify-center text-white font-bold"><Plus size={18} /></div>
                             Foto's en video's
                           </div>
                           <div className="px-4 py-3 hover:bg-[var(--color-wa-hover)] cursor-pointer text-[#e9edef] text-[15px] flex items-center gap-3 active:bg-[#182229]" onClick={() => { fileInputRef.current?.click(); setShowMenuPlus(false); }}>
                             <div className="w-8 h-8 rounded-full bg-[#ff2e74] flex items-center justify-center text-white font-bold"><Video size={16} /></div>
                             Camera
                           </div>
                        </div>
                      )}
                    </div>

                    {/* Camera button inside capsule */}
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()} 
                      className="text-[#8696a0] hover:text-[#e9edef] transition-colors shrink-0 p-1"
                      title="Camera upload"
                    >
                      <Video size={22} />
                    </button>
                  </>
                )}
              </div>

              {/* Outside green circle button for Send or Voice Message */}
              <div className="shrink-0 flex items-center justify-center pb-0.5">
                {(inputText.trim() || pendingImage) ? (
                  <button 
                    onClick={() => handleSend()} 
                    className="w-[48px] h-[48px] rounded-full bg-[#00a884] hover:bg-[#00c298] flex items-center justify-center text-white shadow-lg active:scale-90 transition-all cursor-pointer"
                    title="Verzenden"
                  >
                     <Send size={20} className="ml-[2px]" />
                  </button>
                ) : (
                  <button 
                     onClick={isRecording ? stopRecording : startRecording} 
                     className={`w-[48px] h-[48px] rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-all cursor-pointer ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-[#00a884] hover:bg-[#00c298]'}`}
                     title={isRecording ? "Opname stoppen en versturen" : "Spraakbericht opnemen"}
                  >
                     {isRecording ? <Send size={20} className="ml-[2px]" /> : <Mic size={20} />}
                  </button>
                )}
              </div>

            </div>
          </div>
        </div>
        </>
        )}
        </div>

        {/* Contact Profile Sidebar */}
        {showContactProfile && (
          <div className="absolute inset-0 md:static md:inset-auto w-full md:w-[380px] h-full bg-[#111b21] border-l border-[var(--color-wa-border)] flex flex-col z-[150] animate-in slide-in-from-right duration-300">
             {/* Header */}
             <div className="h-[60px] bg-[#202c33] flex items-center px-4 gap-4 shrink-0 text-[#e9edef] border-b border-[#222e35]">
                <button 
                  onClick={() => setShowContactProfile(false)} 
                  className="p-1 hover:bg-white/5 rounded-full transition-colors text-[var(--color-wa-text-muted)] hover:text-[#e9edef]"
                  title="Sluiten"
                >
                  <X size={24} />
                </button>
                <span className="font-semibold text-base text-[#e9edef]">Contactgegevens</span>
             </div>

             {/* Sidebar Body */}
             <div className="flex-1 overflow-y-auto bg-[#0b141a] custom-scrollbar pb-8 space-y-3">
                
                {/* Profile Card */}
                <div className="bg-[#111b21] px-6 py-7 flex flex-col items-center shadow-sm border-b border-white/5">
                   <img 
                     src={activeAvatar} 
                     alt={activeName} 
                     className="w-[180px] h-[180px] rounded-full object-cover shadow-lg hover:scale-[1.02] transition-transform duration-200 cursor-pointer mb-5"
                     onClick={() => setViewImageUrl(activeAvatar)}
                   />
                   <h3 className="text-xl font-bold text-[#e9edef] text-center tracking-wide">{activeName}</h3>
                   <p className="text-sm font-mono text-[#8696a0] mt-1.5">{activePhone}</p>
                </div>

                {/* Bio / About Card */}
                <div className="bg-[#111b21] px-6 py-5 flex flex-col gap-1.5 shadow-sm border-b border-white/5">
                   <span className="text-xs font-semibold text-[#00a884] uppercase tracking-wider">Info</span>
                   <p className="text-[15px] text-[#e9edef] whitespace-pre-line leading-relaxed font-normal">{activeBio}</p>
                   <span className="text-[11px] text-[#8696a0] mt-1.5">Gewijzigd: 2 dagen geleden</span>
                </div>

                {/* Encryption Security Warning */}
                <div className="bg-[#111b21] px-6 py-4.5 flex items-start gap-4 shadow-sm border-b border-white/5 text-[13px] text-[var(--color-wa-text-muted)]">
                   <Lock size={20} className="text-[#00a884] shrink-0 mt-0.5" />
                   <div>
                      <div className="text-[#e9edef] font-medium mb-0.5">Versleuteling</div>
                      <div>Berichten en oproepen zijn end-to-end versleuteld. Tik om te verifiëren.</div>
                   </div>
                </div>

                {/* Settings Actions for custom contacts */}
                {activeContact !== 'gerda' && (
                  <div className="bg-[#111b21] px-6 py-4 flex flex-col gap-3 shadow-sm border-b border-white/5">
                     <div className="text-xs font-semibold text-[#8696a0] uppercase tracking-wider">Aangepast contact</div>
                     <button 
                       onClick={() => {
                         setShowContactProfile(false);
                         setShowCustomContactSettings(true);
                       }}
                       className="w-full bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] py-2 px-4 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
                     >
                        <Settings size={16} />
                        Contact bewerken
                     </button>
                  </div>
                )}

                {/* Additional simulated options for WhatsApp detail feel */}
                <div className="bg-[#111b21] px-6 py-3 flex flex-col shadow-sm border-b border-white/5 divide-y divide-white/5">
                   <div className="py-3 flex items-center justify-between text-[15px] text-[#e9edef] cursor-pointer hover:bg-white/5 -mx-6 px-6 transition-colors">
                      <div className="flex items-center gap-4">
                         <Bell size={20} className="text-[#8696a0]" />
                         <span>Meldingen dempen</span>
                      </div>
                      <input type="checkbox" className="accent-[#00a884] h-4 w-4" defaultChecked={false} />
                   </div>
                   <div className="py-4 flex items-center gap-4 text-[15px] text-[#e9edef] cursor-pointer hover:bg-white/5 -mx-6 px-6 transition-colors">
                      <Lock size={20} className="text-[#8696a0]" />
                      <div className="flex-1">
                         <div>Tijdelijke berichten</div>
                         <div className="text-xs text-[var(--color-wa-text-muted)] mt-0.5">Uit</div>
                      </div>
                   </div>
                </div>

                {/* Red block actions */}
                <div className="bg-[#111b21] px-6 py-2 shadow-sm border-b border-white/5 divide-y divide-white/5">
                   <div className="py-3 flex items-center gap-4 text-[15px] text-[#ea0038] hover:bg-white/5 -mx-6 px-6 cursor-pointer transition-colors font-medium">
                      <Trash2 size={20} className="text-[#ea0038]" />
                      <span>Chat wissen</span>
                   </div>
                   <div className="py-3 flex items-center gap-4 text-[15px] text-[#ea0038] hover:bg-white/5 -mx-6 px-6 cursor-pointer transition-colors font-medium">
                      <MoreVertical size={20} className="text-[#ea0038] rotate-90" />
                      <span>Gerapporteerd contact</span>
                   </div>
                </div>

             </div>
          </div>
        )}
      </div>
      {/* Modals and Overlays */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
          <div className="bg-[#3b4a54] rounded py-5 px-6 w-full max-w-[340px] shadow-2xl flex flex-col">
             <div className="text-[#e9edef] text-[17px] mb-6">{activeMessageIds.size} bericht{activeMessageIds.size !== 1 ? 'en' : ''} verwijderen?</div>
             <div className="flex flex-col mt-2">
               <button 
                 onClick={() => {
                    setMessagesForContact(activeContact, prev => prev.filter(m => !activeMessageIds.has(m.id)));
                    setIsSelectMode(false);
                    setActiveMessageIds(new Set());
                    setShowDeleteModal(false);
                 }}
                 className="text-[#00a884] font-medium text-[15px] px-3 py-3 hover:bg-white/5 rounded text-right transition-colors"
               >
                 Verwijderen voor iedereen
               </button>
               <button 
                 onClick={() => {
                    setMessagesForContact(activeContact, prev => prev.filter(m => !activeMessageIds.has(m.id)));
                    setIsSelectMode(false);
                    setActiveMessageIds(new Set());
                    setShowDeleteModal(false);
                 }}
                 className="text-[#00a884] font-medium text-[15px] px-3 py-3 hover:bg-white/5 rounded text-right transition-colors"
               >
                 Verwijderen voor mezelf
               </button>
               <button 
                 onClick={() => setShowDeleteModal(false)}
                 className="text-[#00a884] font-medium text-[15px] px-3 py-3 hover:bg-white/5 rounded text-right transition-colors"
               >
                 Annuleren
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

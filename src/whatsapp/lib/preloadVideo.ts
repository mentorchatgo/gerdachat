export let globalFrames: string[] = [];
let isPreloading = false;
let currentUrl = "";

export const preloadVideoFrames = async (videoUrl: string) => {
    if (isPreloading) return;
    if (currentUrl === videoUrl && globalFrames.length > 0) return;
    
    isPreloading = true;
    currentUrl = videoUrl;
    globalFrames = []; // Clear frames
    
    try {
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = "anonymous";
        await new Promise(r => { video.onloadeddata = r; });
        
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        
        const fps = 20; // 20 frames per second is smooth enough for volume
        const duration = video.duration || 1;
        const totalFrames = Math.floor(duration * fps);
        const frames = [];
        
        for (let i = 0; i < totalFrames; i++) {
             video.currentTime = i / fps;
             await new Promise(r => { 
                let timeoutId: number;
                const listener = () => { 
                    clearTimeout(timeoutId);
                    video.removeEventListener('seeked', listener); 
                    r(null); 
                };
                timeoutId = window.setTimeout(listener, 500); // 500ms timeout
                video.addEventListener('seeked', listener);
             });
             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
             frames.push(canvas.toDataURL('image/jpeg', 0.5));
        }
        globalFrames = frames;
        console.log("Preloaded", frames.length, "frames for", videoUrl);
    } catch(e) {
        console.error("Frame extraction error", e);
    }
    isPreloading = false;
};

// Start preloading immediately as soon as this module is loaded
preloadVideoFrames("https://i.imgur.com/eCBZgoo.mp4").catch(console.error);

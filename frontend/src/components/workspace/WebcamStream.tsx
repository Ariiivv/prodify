import { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { getWsUrl } from '@/lib/config';
import { CameraOff, Camera, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type CameraStatus = 'loading' | 'streaming' | 'error' | 'disabled';

interface CameraErrorInfo {
  type: 'NotAllowedError' | 'NotFoundError' | 'NotReadableError' | 'ConnectionError' | 'TimeoutError' | 'Unknown';
  message: string;
}

interface WebcamStreamProps {
  onDistractionDetected: (reason?: string) => void;
  onStatus?: (status: CameraStatus, error?: CameraErrorInfo) => void;
  onEngagementState?: (state: string) => void;
  isEnabled: boolean;
  isTimerRunning?: boolean;
}

const FRAME_INTERVAL_MS = 2000; // Send a frame every 2 seconds
const CAMERA_TIMEOUT_MS = 10_000; // Fail-fast if getUserMedia doesn't resolve in 10s

export default function WebcamStream({ onDistractionDetected, onStatus, onEngagementState, isEnabled }: WebcamStreamProps) {
  const webcamRef = useRef<Webcam>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cameraStatus, setCameraStatusInternal] = useState<CameraStatus>('disabled');
  const [cameraError, setCameraErrorInternal] = useState<CameraErrorInfo | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStatusRef = useRef<string>("focused");
  const isTypingRef = useRef<boolean>(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setVideoDevices(videoInputs);
    });
  }, []);

  // Refs for callback props so the socket/interval handlers always see the latest versions
  const onDistractionDetectedRef = useRef(onDistractionDetected);
  const onStatusRef = useRef(onStatus);
  const onEngagementStateRef = useRef(onEngagementState);
  useEffect(() => { onDistractionDetectedRef.current = onDistractionDetected; }, [onDistractionDetected]);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);
  useEffect(() => { onEngagementStateRef.current = onEngagementState; }, [onEngagementState]);

  // Unified status setter that also calls onStatus
  const setCameraStatus = useCallback((status: CameraStatus, error?: CameraErrorInfo) => {
    setCameraStatusInternal(status);
    if (error) setCameraErrorInternal(error);
    else if (status !== 'error') setCameraErrorInternal(null);
    onStatusRef.current?.(status, error);
  }, []);

  // --- Lightweight keyboard activity detection (2s debounce) ---
  useEffect(() => {
    if (!isEnabled) {
      isTypingRef.current = false;
      return;
    }

    const handleKeyDown = () => {
      isTypingRef.current = true;
      // Clear any existing timeout and reset the 2s decay
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false;
      }, 2000);
    };

    window.addEventListener('keydown', handleKeyDown, { passive: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      isTypingRef.current = false;
    };
  }, [isEnabled]);

  // --- Main WebSocket + Camera init — runs only when isEnabled changes ---
  useEffect(() => {
    if (!isEnabled) {
      // Cleanup everything
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (socketRef.current) { socketRef.current.close(); socketRef.current = null; }
      setCameraStatus('disabled');
      return;
    }

    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const startCamera = async () => {
      if (!isMounted) return;
      setCameraStatus('loading');

      // Fail-safe: reject if camera enumeration / permission takes too long
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new DOMException(
            `Camera not detected within ${CAMERA_TIMEOUT_MS / 1000}s. Check permissions or camera connection.`,
            'TimeoutError'
          ));
        }, CAMERA_TIMEOUT_MS);
      });

      try {
        // Race getUserMedia against a timeout so we never hang on "Initializing..." forever
        const stream: MediaStream = await Promise.race([
          navigator.mediaDevices.getUserMedia({ video: true }),
          timeoutPromise,
        ]);

        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }

        // If we got a stream, stop it immediately — react-webcam handles its own stream
        stream.getTracks().forEach(track => track.stop());

        if (!isMounted) return;

        setCameraStatus('streaming');

        // --- WebSocket: create only once per mount ---
        if (socketRef.current) {
          console.log("🔌 [SOCKET] Already connected — skipping duplicate creation");
          return;
        }

        const wsUrl = getWsUrl("/vision");
        console.log("🔌 [SOCKET] Attempting to connect to Vision WS:", wsUrl);
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          console.log("✅ [SOCKET] Connected!");
          reconnectAttemptsRef.current = 0;
          // Start frame capture interval ONLY after socket is open
          intervalRef.current = setInterval(() => {
            if (socketRef.current?.readyState !== WebSocket.OPEN) return;
            const screenshot = webcamRef.current?.getScreenshot();
            if (!screenshot) return;
            console.log("📸 [CAMERA] Snapped frame, sending to socket...");
            socketRef.current.send(JSON.stringify({ image: screenshot, typing: isTypingRef.current }));
          }, FRAME_INTERVAL_MS);
        };

        socket.onerror = (err: Event) => {
          console.error("❌ [SOCKET] WebSocket error event:", err);
          console.error("❌ [SOCKET] wsUrl was:", wsUrl);
          // Don't set error status here, let onclose handle reconnection logic
        };

        socket.onclose = (closeEvent: CloseEvent) => {
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
          socketRef.current = null;
          console.warn("🔌 [SOCKET] Closed:", closeEvent.code, closeEvent.reason);
          
          if (!isMounted) return;

          if (closeEvent.code !== 1000) {
            if (reconnectAttemptsRef.current < 3) {
              reconnectAttemptsRef.current += 1;
              const delay = Math.pow(2, reconnectAttemptsRef.current - 1) * 1000;
              console.log(`🔌 [SOCKET] Reconnecting in ${delay}ms... (Attempt ${reconnectAttemptsRef.current}/3)`);
              setCameraStatus('loading');
              if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
              reconnectTimeoutRef.current = setTimeout(() => {
                setRetryKey(k => k + 1);
              }, delay);
            } else {
              setCameraStatus('error', {
                type: 'ConnectionError',
                message: 'Lost connection to Vision Server. Max retries exceeded.',
              });
            }
          }
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // Bubble up engagement state for CoachInsightPanel
            if (data.engagement_state) {
              onEngagementStateRef.current?.(data.engagement_state);
            }
            // Skip 'ready' status — it's the initialization handshake, not a distraction
            if (data.status === 'ready') {
              console.log('🟢 [VISION] READY handshake received from backend');
              return;
            }
            if (data.status === 'distracted' && lastStatusRef.current === 'focused') {
              console.log("🚨 DISTRACTION SIGNAL RECEIVED FROM BACKEND:", data.reason);
              onDistractionDetectedRef.current(data.reason);
            } else if (data.status === 'focused' && lastStatusRef.current === 'distracted') {
              console.log("🌟 [FRONTEND] User returned to frame. Focus regained.");
            }
            lastStatusRef.current = data.status;
          } catch (e) {
            console.error("Vision WebSocket parse error:", e);
          }
        };
      } catch (err: any) {
        if (!isMounted) return;

        // Clear the timeout if it's still pending
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }

        let errorInfo: CameraErrorInfo;

        if (err.name === 'TimeoutError') {
          errorInfo = {
            type: 'TimeoutError',
            message: err.message || `Camera initialization timed out after ${CAMERA_TIMEOUT_MS / 1000}s.`,
          };
          console.error("⏱️ [CAMERA] getUserMedia timed out. Is the camera connected and permissions granted?");
        } else if (err.name === 'NotAllowedError') {
          errorInfo = {
            type: 'NotAllowedError',
            message: err.message?.includes('policy')
              ? 'Camera access blocked by browser policy. Check your browser settings.'
              : 'Camera permission denied. Please allow camera access in your browser settings and reload.',
          };
          console.error("🚫 [CAMERA] Permission denied:", err.message);
        } else if (err.name === 'NotFoundError') {
          errorInfo = {
            type: 'NotFoundError',
            message: 'No camera found. Please check your hardware or plug in a webcam.',
          };
          console.error("🔍 [CAMERA] No camera device found:", err.message);
        } else if (err.name === 'NotReadableError') {
          errorInfo = {
            type: 'NotReadableError',
            message: 'Camera is already in use by another application. Close other apps using the camera.',
          };
          console.error("🔒 [CAMERA] Camera busy:", err.message);
        } else {
          errorInfo = {
            type: 'Unknown',
            message: `Camera error: ${err.message || 'An unexpected error occurred.'}`,
          };
          console.error("❌ [CAMERA] Unknown error:", err);
        }

        setCameraStatus('error', errorInfo);
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
        console.log("🔌 [SOCKET] Closed and nulled on cleanup");
      }
    };
  }, [isEnabled, setCameraStatus]);

  // Handle react-webcam's own error callback (catches errors during actual stream init)
  const handleUserMediaError = useCallback((err: string | DOMException) => {
    const message = typeof err === 'string' ? err : err.message || 'Unknown camera error';
    const name = typeof err === 'object' && 'name' in err ? (err as DOMException).name : 'Unknown';

    console.error("📷 [REACT-WEBCAM] UserMedia error:", name, message);

    let errorInfo: CameraErrorInfo;

    if (name === 'NotAllowedError') {
      errorInfo = { type: 'NotAllowedError', message: 'Camera permission denied by browser.' };
    } else if (name === 'NotFoundError') {
      errorInfo = { type: 'NotFoundError', message: 'No camera device found.' };
    } else if (name === 'NotReadableError') {
      errorInfo = { type: 'NotReadableError', message: 'Camera is busy or unavailable.' };
    } else {
      errorInfo = { type: 'Unknown', message };
    }

    setCameraStatus('error', errorInfo);
  }, [setCameraStatus]);

  // Handle successful media stream from react-webcam
  const handleUserMedia = useCallback(() => {
    console.log("📷 [REACT-WEBCAM] Stream started successfully");
    setCameraStatus('streaming');
  }, [setCameraStatus]);

  // Inline retry handler: re-mount Webcam by bumping retryKey
  const handleRetry = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (socketRef.current) { socketRef.current.close(); socketRef.current = null; }
    if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
    reconnectAttemptsRef.current = 0;
    setCameraStatus('loading');
    setRetryKey(k => k + 1);
  }, [setCameraStatus]);

  // --- Render ---

  // If not enabled, render nothing
  if (!isEnabled) {
    return null;
  }

  // Loading state — show a subtle placeholder
  if (cameraStatus === 'loading') {
    const isReconnecting = reconnectAttemptsRef.current > 0;
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/40 text-muted-foreground text-xs">
        <Camera className="w-3.5 h-3.5 animate-pulse" />
        <span>{isReconnecting ? `Reconnecting... (Attempt ${reconnectAttemptsRef.current}/3)` : 'Initializing camera...'}</span>
      </div>
    );
  }

  // Error state — show detailed fallback UI
  if (cameraStatus === 'error' && cameraError) {
    const isPermissionError = cameraError.type === 'NotAllowedError';
    const isNotFoundError = cameraError.type === 'NotFoundError';
    const isConnectionError = cameraError.type === 'ConnectionError';
    const isTimeoutError = cameraError.type === 'TimeoutError';

    return (
      <div className={`rounded-xl border p-4 ${
        isConnectionError || isTimeoutError
          ? 'bg-amber-500/5 border-amber-500/30'
          : 'bg-red-500/5 border-red-500/30'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isConnectionError || isTimeoutError ? 'bg-amber-500/15 text-amber-500' : 'bg-red-500/15 text-red-500'
          }`}>
            {isNotFoundError ? <CameraOff className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${
              isConnectionError || isTimeoutError ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {isPermissionError && 'Camera Access Blocked'}
              {isNotFoundError && 'No Camera Detected'}
              {isConnectionError && 'Vision Service Unavailable'}
              {isTimeoutError && 'Camera Timed Out'}
              {!isPermissionError && !isNotFoundError && !isConnectionError && !isTimeoutError && 'Camera Error'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{cameraError.message}</p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground/10 text-foreground hover:bg-foreground/20 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Retry Camera
              </button>
              {isPermissionError && (
                <button
                  onClick={() => {
                    toastPermissionHint();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
                >
                  How to Allow Access
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Streaming state — render the Webcam visibly so react-webcam can capture frames
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Webcam
          key={retryKey}
          ref={webcamRef}
          className="w-full h-auto rounded-md"
          audio={false}
          videoConstraints={{ 
            width: 640, 
            height: 480, 
            deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
            facingMode: selectedDeviceId ? undefined : 'user'
          }}
          screenshotFormat="image/jpeg"
          onUserMedia={handleUserMedia}
          onUserMediaError={handleUserMediaError}
        />
      </div>
      {videoDevices.length > 1 && (
        <select 
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white text-xs p-1.5 outline-none cursor-pointer rounded-none"
          value={selectedDeviceId || ''}
          onChange={(e) => {
            setSelectedDeviceId(e.target.value);
            setRetryKey(k => k + 1);
          }}
        >
          <option value="" disabled>Switch Camera</option>
          {videoDevices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Camera ${videoDevices.indexOf(device) + 1}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// Helper to show a toast with permission instructions
function toastPermissionHint() {
  toast.info("Camera Permission Instructions", {
    description: "Click the camera icon in your browser's address bar and select 'Allow', then retry.",
    duration: 5000,
  });
}

// Export type for external use
export type { CameraStatus, CameraErrorInfo };
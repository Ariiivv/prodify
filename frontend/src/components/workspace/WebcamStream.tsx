import { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { getWsUrl } from '@/lib/config';
import { CameraOff, Camera, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type CameraStatus = 'loading' | 'streaming' | 'error' | 'disabled';

interface CameraErrorInfo {
  type: 'NotAllowedError' | 'NotFoundError' | 'NotReadableError' | 'ConnectionError' | 'Unknown';
  message: string;
}

interface WebcamStreamProps {
  onDistractionDetected: () => void;
  onStatus?: (status: CameraStatus, error?: CameraErrorInfo) => void;
  isEnabled: boolean;
  isTimerRunning?: boolean;
}

const FRAME_INTERVAL_MS = 2000; // Send a frame every 2 seconds

export default function WebcamStream({ onDistractionDetected, onStatus, isEnabled }: WebcamStreamProps) {
  const webcamRef = useRef<Webcam>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cameraStatus, setCameraStatusInternal] = useState<CameraStatus>('disabled');
  const [cameraError, setCameraErrorInternal] = useState<CameraErrorInfo | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const lastStatusRef = useRef<string>("focused");

  // Refs for callback props so the socket/interval handlers always see the latest versions
  const onDistractionDetectedRef = useRef(onDistractionDetected);
  const onStatusRef = useRef(onStatus);
  useEffect(() => { onDistractionDetectedRef.current = onDistractionDetected; }, [onDistractionDetected]);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);

  // Unified status setter that also calls onStatus
  const setCameraStatus = useCallback((status: CameraStatus, error?: CameraErrorInfo) => {
    setCameraStatusInternal(status);
    if (error) setCameraErrorInternal(error);
    else if (status !== 'error') setCameraErrorInternal(null);
    onStatusRef.current?.(status, error);
  }, []);

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

    const startCamera = async () => {
      if (!isMounted) return;
      setCameraStatus('loading');

      try {
        // Explicitly request camera to catch permission/hardware errors early
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
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
        console.log("🔌 [SOCKET] Attempting to connect...");
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          console.log("✅ [SOCKET] Connected!");
          // Start frame capture interval ONLY after socket is open
          intervalRef.current = setInterval(() => {
            if (socketRef.current?.readyState !== WebSocket.OPEN) return;
            const screenshot = webcamRef.current?.getScreenshot();
            if (!screenshot) return;
            console.log("📸 [CAMERA] Snapped frame, sending to socket...");
            socketRef.current.send(JSON.stringify({ image: screenshot }));
          }, FRAME_INTERVAL_MS);
        };

        socket.onerror = (err) => {
          console.error("❌ [SOCKET] Error:", err);
          setCameraStatus('error', {
            type: 'ConnectionError',
            message: 'Unable to connect to Vision Server. Check your connection or browser shields.',
          });
        };

        socket.onclose = () => {
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
          socketRef.current = null;
          // Don't auto-reconnect — component will remount if still enabled
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.status === 'distracted' && lastStatusRef.current === 'focused') {
              console.log("🚨 DISTRACTION SIGNAL RECEIVED FROM BACKEND");
              onDistractionDetectedRef.current();
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

        let errorInfo: CameraErrorInfo;

        if (err.name === 'NotAllowedError') {
          errorInfo = {
            type: 'NotAllowedError',
            message: err.message?.includes('policy')
              ? 'Camera access blocked by browser policy. Check your browser settings.'
              : 'Camera permission denied. Please allow camera access in your browser settings and reload.',
          };
        } else if (err.name === 'NotFoundError') {
          errorInfo = {
            type: 'NotFoundError',
            message: 'No camera found. Please check your hardware or plug in a webcam.',
          };
        } else if (err.name === 'NotReadableError') {
          errorInfo = {
            type: 'NotReadableError',
            message: 'Camera is already in use by another application. Close other apps using the camera.',
          };
        } else {
          errorInfo = {
            type: 'Unknown',
            message: `Camera error: ${err.message || 'An unexpected error occurred.'}`,
          };
        }

        setCameraStatus('error', errorInfo);
      }
    };

    startCamera();

    return () => {
      isMounted = false;
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
    setCameraStatus('streaming');
  }, [setCameraStatus]);

  // Inline retry handler: re-mount Webcam by bumping retryKey
  const handleRetry = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (socketRef.current) { socketRef.current.close(); socketRef.current = null; }
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
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/40 text-muted-foreground text-xs">
        <Camera className="w-3.5 h-3.5 animate-pulse" />
        <span>Initializing camera...</span>
      </div>
    );
  }

  // Error state — show detailed fallback UI
  if (cameraStatus === 'error' && cameraError) {
    const isPermissionError = cameraError.type === 'NotAllowedError';
    const isNotFoundError = cameraError.type === 'NotFoundError';
    const isConnectionError = cameraError.type === 'ConnectionError';

    return (
      <div className={`rounded-xl border p-4 ${
        isConnectionError
          ? 'bg-amber-500/5 border-amber-500/30'
          : 'bg-red-500/5 border-red-500/30'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isConnectionError ? 'bg-amber-500/15 text-amber-500' : 'bg-red-500/15 text-red-500'
          }`}>
            {isNotFoundError ? <CameraOff className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${
              isConnectionError ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {isPermissionError && 'Camera Access Blocked'}
              {isNotFoundError && 'No Camera Detected'}
              {isConnectionError && 'Vision Service Unavailable'}
              {!isPermissionError && !isNotFoundError && !isConnectionError && 'Camera Error'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{cameraError.message}</p>
            <div className="flex items-center gap-2 mt-3">
              {!isConnectionError && (
                <button
                  onClick={handleRetry}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground/10 text-foreground hover:bg-foreground/20 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry Camera
                </button>
              )}
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
    <Webcam
      key={retryKey}
      ref={webcamRef}
      className="w-full h-auto rounded-md"
      audio={false}
      videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
      screenshotFormat="image/jpeg"
      onUserMedia={handleUserMedia}
      onUserMediaError={handleUserMediaError}
    />
  );
}

// Helper to show a toast with permission instructions
function toastPermissionHint() {
  toast.info("Camera Permission Instructions", {
    description: "Click the camera icon in your browser's address bar and select 'Allow', then retry.",
    duration: 5000,
  });
}
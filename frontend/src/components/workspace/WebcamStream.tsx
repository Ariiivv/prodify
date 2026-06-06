import { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { getWsUrl } from '@/lib/config'; // Ensure this points to your config module

interface WebcamStreamProps {
  onDistractionDetected: () => void;
  isEnabled: boolean;
}

export default function WebcamStream({ onDistractionDetected, isEnabled }: WebcamStreamProps) {
  const webcamRef = useRef<Webcam>(null);
  const ws = useRef<WebSocket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout>();
  const retryCount = useRef(0);

  // Robust Connection Logic with Exponential Backoff
  const connect = useCallback(() => {
    const wsUrl = getWsUrl();
    const socket = new WebSocket(wsUrl);
    ws.current = socket;

    socket.onopen = () => {
      console.log("✅ WebSocket Connected");
      setError(null);
      retryCount.current = 0; // Reset backoff on success
    };

    socket.onclose = () => {
      if (isEnabled) {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s... max 30s
        const delay = Math.min(Math.pow(2, retryCount.current) * 1000, 30000);
        console.log(`🔌 WebSocket Closed. Retrying in ${delay}ms...`);
        reconnectTimeout.current = setTimeout(connect, delay);
        retryCount.current += 1;
      }
    };

    socket.onerror = (err) => {
      console.error("WebSocket Connection Error:", err);
      // Ad-blockers or blocked ports often trigger this
      setError("Unable to connect to Vision Server. Check connection or browser shields.");
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.distracted) onDistractionDetected();
      } catch (e) {
        console.error("Vision WebSocket parse error:", e);
      }
    };
  }, [isEnabled, onDistractionDetected]);

  // Hardware Initialization with Permission Handling
  useEffect(() => {
    let isMounted = true;

    const startCamera = async () => {
      try {
        // Explicitly request video stream to check for errors early
        await navigator.mediaDevices.getUserMedia({ video: true });
        if (isMounted) {
          setError(null);
          connect();
        }
      } catch (err: any) {
        if (!isMounted) return;
        
        if (err.name === 'NotAllowedError') {
          setError("Camera permission denied. Please allow camera access in your browser settings.");
        } else if (err.name === 'NotFoundError') {
          setError("No camera found. Please check your hardware.");
        } else {
          setError(`Camera error: ${err.message}`);
        }
      }
    };

    if (isEnabled) {
      startCamera();
    } else {
      if (ws.current) ws.current.close();
    }

    return () => {
      isMounted = false;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (ws.current) ws.current.close();
    };
  }, [isEnabled, connect]);

  // Fallback UI for when tracking fails
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-center">
        <p className="font-semibold">Tracking Unavailable</p>
        <p className="text-sm opacity-80 mb-4">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
        >
          Retry Permission
        </button>
      </div>
    );
  }

  return (
    <Webcam
      ref={webcamRef}
      className="hidden"
      videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
      screenshotFormat="image/jpeg"
    />
  );
}
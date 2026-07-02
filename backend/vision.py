import cv2
import numpy as np
import base64
import logging
import time
import os
import urllib.request

# Use the modern Tasks API instead of the broken legacy 'solutions'
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

logger = logging.getLogger("prodify_vision")

# Auto-download the neural network model file if it doesn't exist
MODEL_PATH = "blaze_face_short_range.tflite"
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"

def ensure_model_exists():
    if not os.path.exists(MODEL_PATH):
        print("📥 [VISION] Downloading MediaPipe Face Model (this only happens once)...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("✅ [VISION] Model downloaded successfully!")

# Singleton instance
_face_detector = None

def _get_face_detector():
    global _face_detector
    if _face_detector is None:
        ensure_model_exists()
        base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
        # 0.7 confidence threshold
        options = vision.FaceDetectorOptions(base_options=base_options, min_detection_confidence=0.7)
        _face_detector = vision.FaceDetector.create_from_options(options)
        logger.info("MediaPipe Tasks FaceDetector initialized successfully!")
    return _face_detector

class FocusTracker:
    """
    Tracks whether the user is focused based on face presence.
    Uses the modern MediaPipe Tasks API for robust, lighting-invariant results.
    """

    def __init__(self, distraction_timeout: float = 5.0):
        self.distraction_timeout = distraction_timeout
        self._last_face_seen: float = time.time()
        self._current_status: str = "focused"

    def process_frame(self, base64_string: str) -> dict:
        try:
            # Strip data URL prefix if present
            if ',' in base64_string:
                base64_string = base64_string.split(',')[1]

            # Decode base64 -> numpy array
            img_data = base64.b64decode(base64_string)
            nparr = np.frombuffer(img_data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if frame is None:
                return {"status": self._current_status, "error": "Invalid frame"}

            # Pitch-Black / Covered camera check
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            mean_brightness = cv2.mean(gray)[0]

            if mean_brightness < 15:
                face_found = False
                print(f"⚫ [VISION] Pitch-black/brightness={mean_brightness:.1f} < 15 — treating as NO FACE")
            else:
                # The modern Tasks API requires converting the frame to an mp.Image object
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

                # Run detection
                detector = _get_face_detector()
                detection_result = detector.detect(mp_image)

                # Check if the list of detections has at least one face
                face_found = len(detection_result.detections) > 0

            now = time.time()
            elapsed_since_last_face = now - self._last_face_seen

            if face_found:
                print(f"🟢 [VISION] Face detected. Resetting missing timer.")
                self._last_face_seen = now
                if self._current_status != "focused":
                    self._current_status = "focused"
                    logger.info("User is now FOCUSED")
            else:
                print(f"🔴 [VISION] No face! Missing for {elapsed_since_last_face:.1f}s (threshold={self.distraction_timeout}s)")
                if elapsed_since_last_face >= self.distraction_timeout and self._current_status != "distracted":
                    print(f"🚨 [VISION] {self.distraction_timeout}s THRESHOLD MET! SENDING 'distracted' JSON OVER SOCKET!")
                    self._current_status = "distracted"
                    logger.info("User is now DISTRACTED")

            return {"status": self._current_status}

        except Exception as e:
            logger.error("Frame processing error: %s", e)
            return {"status": self._current_status, "error": str(e)}
import cv2
import numpy as np
import base64
import logging
import time
import os
import urllib.request

# Use the modern Tasks API
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

logger = logging.getLogger("prodify_vision")

# ---------------------------------------------------------------------------
# Model paths — auto-download if missing
# ---------------------------------------------------------------------------
FACE_DETECTOR_PATH = os.path.join("data", "models", "blaze_face_short_range.tflite")
FACE_DETECTOR_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"

FACE_LANDMARKER_PATH = os.path.join("data", "models", "face_landmarker.task")
FACE_LANDMARKER_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"


def _ensure_model(path: str, url: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        print(f"📥 [VISION] Downloading {path} (this only happens once)...")
        urllib.request.urlretrieve(url, path)
        print(f"✅ [VISION] {path} downloaded successfully!")


# ---------------------------------------------------------------------------
# Singleton detectors
# ---------------------------------------------------------------------------
_face_detector = None
_face_landmarker = None


def _get_face_detector():
    global _face_detector
    if _face_detector is None:
        _ensure_model(FACE_DETECTOR_PATH, FACE_DETECTOR_URL)
        base_options = python.BaseOptions(model_asset_path=FACE_DETECTOR_PATH)
        options = vision.FaceDetectorOptions(
            base_options=base_options, min_detection_confidence=0.7
        )
        _face_detector = vision.FaceDetector.create_from_options(options)
        logger.info("MediaPipe Tasks FaceDetector initialized.")
    return _face_detector


def _get_face_landmarker():
    """Initialise the Face Landmarker (478 landmarks per face, includes EAR)."""
    global _face_landmarker
    if _face_landmarker is None:
        _ensure_model(FACE_LANDMARKER_PATH, FACE_LANDMARKER_URL)
        base_options = python.BaseOptions(model_asset_path=FACE_LANDMARKER_PATH)
        options = vision.FaceLandmarkerOptions(
            base_options=base_options,
            output_face_blendshapes=True,  # gives us eyeBlinkLeft/Right
            num_faces=2,  # detect up to 2 faces (stranger detection)
        )
        _face_landmarker = vision.FaceLandmarker.create_from_options(options)
        logger.info("MediaPipe Tasks FaceLandmarker initialized (with blendshapes).")
    return _face_landmarker


# ---------------------------------------------------------------------------
# Engagement State — Developer-Intent posture classification
# ---------------------------------------------------------------------------

class EngagementState:
    """
    State machine for developer-intent engagement classification.

    States:
        ACTIVE_WORK     — Face present, eyes open, normal posture
        FOCUSED_THINKING — Head down / in hands (developer is writing or thinking)
        FACE_ABSENT     — No face detected (may have walked away)
        EYES_CLOSED     — Eyes shut for extended period (falling asleep)
        STRANGER        — Multiple faces detected (someone else is present)

    Distraction triggers ONLY fire on:
        CASE A: Face missing > 5 seconds CONTINUOUS
        CASE B: Eyes closed > 5 seconds CONTINUOUS
        CASE C: Stranger face detected
    """

    # Thresholds (seconds) — unified 5-second continuous requirement
    FACE_ABSENT_TIMEOUT = 5.0
    EYES_CLOSED_TIMEOUT = 5.0
    # Blendshape threshold for "eyes closed" (0.0 = fully open, 1.0 = fully closed)
    EYE_BLINK_THRESHOLD = 0.55

    def __init__(self):
        self.state: str = "INITIALIZING"
        self.confidence: float = 1.0

        # Timers
        self._last_face_seen: float = time.time()
        self._eyes_closed_since: float | None = None  # None = eyes are open

        # Continuous tracking: how many consecutive frames confirm a condition
        self._consecutive_face_missing: int = 0
        self._consecutive_eyes_closed: int = 0

        # Head pose tracking
        self._head_pose: str = "neutral"  # neutral, looking_down, head_in_hands

    def classify(
        self,
        face_count: int,
        eyes_closed: bool,
        head_looking_down: bool,
        eye_close_confidence: float,
        user_is_typing: bool = False,
    ) -> tuple[str, str, float]:
        """
        Classify the current engagement state.

        Args:
            face_count: Number of faces detected in the frame.
            eyes_closed: Whether the primary face has eyes closed.
            head_looking_down: Whether the user is looking down.
            eye_close_confidence: Blendshape confidence for eye closure.
            user_is_typing: Whether the user is actively typing/using mouse.

        Returns:
            (state, reason, confidence)
        """
        now = time.time()

        # ── CASE C: Stranger Detection ──────────────────────────────────
        if face_count > 1:
            self.state = "STRANGER"
            self.confidence = 0.95
            self._consecutive_face_missing = 0
            self._consecutive_eyes_closed = 0
            return (
                "STRANGER",
                f"Multiple faces detected ({face_count}). Possible stranger at screen.",
                0.95,
            )

        # ── Face presence tracking ──────────────────────────────────────
        if face_count >= 1:
            self._last_face_seen = now
            self._consecutive_face_missing = 0
        else:
            self._consecutive_face_missing += 1

        face_missing_duration = now - self._last_face_seen

        # ── CASE A: Face absent > 5s CONTINUOUS ─────────────────────────
        # Only trigger if face has been missing for multiple consecutive frames
        # AND the continuous duration exceeds the threshold.
        # If the user is typing, NEVER trigger face-absent distraction.
        if face_count == 0 and face_missing_duration > self.FACE_ABSENT_TIMEOUT:
            if user_is_typing:
                # User is typing — they're just looking at keyboard / off-angle
                print(
                    f"⌨️  [VISION] Face missing {face_missing_duration:.1f}s but user "
                    f"is TYPING — suppressing distraction"
                )
                self.state = "FOCUSED_THINKING"
                self.confidence = 0.80
                return (
                    "FOCUSED_THINKING",
                    f"Face absent {face_missing_duration:.0f}s but keyboard/mouse active — classified as working.",
                    0.80,
                )
            # Genuine absence
            self.state = "FACE_ABSENT"
            self.confidence = 0.90
            return (
                "FACE_ABSENT",
                f"No face detected for {face_missing_duration:.0f}s (walked away?).",
                0.90,
            )

        # If face is missing but under threshold, stay in current state
        if face_count == 0:
            # Short absence — don't penalize yet
            print(
                f"👤 [VISION] Face missing for {face_missing_duration:.1f}s "
                f"(threshold: {self.FACE_ABSENT_TIMEOUT}s)"
            )
            return (self.state, f"Face temporarily absent ({face_missing_duration:.0f}s)", self.confidence)

        # ── CASE B: Eyes closed > 5s CONTINUOUS ─────────────────────────
        if eyes_closed:
            if self._eyes_closed_since is None:
                self._eyes_closed_since = now
            self._consecutive_eyes_closed += 1
            closed_duration = now - self._eyes_closed_since

            if closed_duration > self.EYES_CLOSED_TIMEOUT:
                if user_is_typing:
                    # User is typing with eyes appearing closed (looking down at keyboard)
                    print(
                        f"⌨️  [VISION] Eyes closed {closed_duration:.1f}s but user "
                        f"is TYPING — suppressing distraction"
                    )
                    self.state = "FOCUSED_THINKING"
                    self.confidence = 0.75
                    return (
                        "FOCUSED_THINKING",
                        f"Eyes appear closed {closed_duration:.0f}s but keyboard/mouse active — classified as deep focus.",
                        0.75,
                    )
                self.state = "EYES_CLOSED"
                self.confidence = eye_close_confidence
                return (
                    "EYES_CLOSED",
                    f"Eyes closed for {closed_duration:.0f}s (falling asleep?).",
                    eye_close_confidence,
                )
            # Still under threshold — may just be blinking or thinking
        else:
            self._eyes_closed_since = None
            self._consecutive_eyes_closed = 0

        # ── Developer-Intent: Head down / in hands = FOCUSED_THINKING ───
        if head_looking_down:
            self._head_pose = "looking_down"
            self.state = "FOCUSED_THINKING"
            self.confidence = 0.85
            print(
                f"[Prodify] Engaged: Deep Thinking / Writing (Posture: {self._head_pose})"
            )
            return (
                "FOCUSED_THINKING",
                f"Developer posture: head down / writing. Classified as DEEP THINKING.",
                0.85,
            )

        # ── Default: ACTIVE_WORK ────────────────────────────────────────
        self._head_pose = "neutral"
        self.state = "ACTIVE_WORK"
        self.confidence = 1.0
        return ("ACTIVE_WORK", "Face present, eyes open, engaged posture.", 1.0)


# ---------------------------------------------------------------------------
# FocusTracker — main class used by the WebSocket and telemetry
# ---------------------------------------------------------------------------

class FocusTracker:
    """
    Developer-Intent Focus Tracker.

    Combines face/eye/posture analysis with window activity classification.
    Distraction is ONLY triggered by the EngagementState machine (face absent,
    eyes closed, stranger) — NOT by head-down / thinking postures.

    Features:
        - 3-second Initialization Grace Period on session start
        - 5-second continuous threshold for face/eye distraction
        - Keyboard/mouse activity suppresses vision-based distractions
        - Sends READY handshake before session scoring begins
    """

    # Grace period: ignore ALL distraction states for this many seconds after init
    WARMUP_GRACE_SECONDS = 3.0

    def __init__(self, distraction_timeout: float = 5.0):
        # Legacy field kept for API compat — actual timeouts live in EngagementState
        self.distraction_timeout = distraction_timeout
        self._engagement = EngagementState()
        self._current_status: str = "focused"

        # Window activity state (updated via HTTP from Electron)
        self._window_status: str = "focused"
        self._window_reason: str = "No window data yet"
        self._last_window_update: float = 0

        # Warm-up grace period — suppress ALL distraction signals during init
        self._startup_time: float = time.time()
        self._warmup_complete: bool = False
        self._ready_sent: bool = False

        # User input activity tracking (keyboard/mouse)
        self._last_user_input_time: float = time.time()
        self._user_typing_timeout: float = 5.0  # Consider "typing" if input < 5s ago

        # Frame counter for READY handshake
        self._frame_count: int = 0

    def reset_warmup(self):
        """Reset the warm-up grace period (e.g. when a new session starts)."""
        self._startup_time = time.time()
        self._warmup_complete = False
        self._ready_sent = False
        self._frame_count = 0
        self._engagement = EngagementState()
        logger.info("[VISION] Warm-up grace period RESET — 3s initialization buffer active")

    def report_user_input(self):
        """
        Called from telemetry/activity endpoint or WebSocket payload to signal
        that the user is actively using keyboard/mouse.
        """
        self._last_user_input_time = time.time()

    @property
    def user_is_typing(self) -> bool:
        """True if the user had keyboard/mouse activity within the last 5 seconds."""
        return (time.time() - self._last_user_input_time) < self._user_typing_timeout

    def update_window_activity(
        self, window_title: str, app_name: str, window_status: str, reason: str
    ):
        """Called from /api/telemetry/activity to update window state."""
        self._window_status = window_status
        self._window_reason = reason
        self._last_window_update = time.time()
        # Window activity implies user input (they switched/interacted with a window)
        self._last_user_input_time = time.time()
        logger.info(
            f"[WINDOW] {window_status.upper()}: {reason} "
            f"(app={app_name}, title='{window_title[:50]}')"
        )

    def get_combined_status(self) -> tuple[str, str]:
        """
        Combine vision engagement state with window activity.

        Engagement states mapped to focus:
            ACTIVE_WORK / FOCUSED_THINKING → vision_focused = True
            FACE_ABSENT / EYES_CLOSED / STRANGER → vision_focused = False

        During the warm-up grace period, ALL states are forced to "focused".
        """
        now = time.time()
        elapsed_since_startup = now - self._startup_time
        eng_state = self._engagement.state

        # ── WARM-UP GRACE PERIOD ────────────────────────────────────────
        if elapsed_since_startup < self.WARMUP_GRACE_SECONDS:
            print(
                f"⏳ [GRACE] Warm-up active ({elapsed_since_startup:.1f}s / "
                f"{self.WARMUP_GRACE_SECONDS}s) — ALL signals forced FOCUSED"
            )
            return "focused", f"Initialization grace period ({self.WARMUP_GRACE_SECONDS - elapsed_since_startup:.0f}s remaining)"

        # Mark warm-up complete on first exit
        if not self._warmup_complete:
            self._warmup_complete = True
            logger.info("[VISION] Warm-up grace period COMPLETE — distraction detection ACTIVE")

        # Vision: distracted only on hard triggers
        vision_focused = eng_state in ("ACTIVE_WORK", "FOCUSED_THINKING", "INITIALIZING")

        # Window: check status
        window_focused = self._window_status == "focused"

        # Debug
        print(
            f"🔍 [COMBINED] vision={eng_state}(focused={vision_focused}) | "
            f"window_focused={window_focused} | _window_status={self._window_status} | "
            f"typing={self.user_is_typing} | confidence={self._engagement.confidence:.2f}"
        )

        if vision_focused and window_focused:
            if eng_state == "FOCUSED_THINKING":
                return "focused", "Deep Thinking / Writing — developer posture detected"
            return "focused", "Face present and productive window"
        elif not vision_focused and not window_focused:
            return (
                "distracted",
                f"Vision: {eng_state} AND unproductive window ({self._window_reason})",
            )
        elif not vision_focused:
            return "distracted", f"Vision: {eng_state}"
        else:
            return "distracted", f"Unproductive window: {self._window_reason}"

    def _analyze_blendshapes(self, landmarker_result) -> tuple[bool, bool, float]:
        """
        Extract eye-close and head-down signals from Face Landmarker blendshapes.

        Returns:
            (eyes_closed, head_looking_down, eye_close_confidence)
        """
        eyes_closed = False
        head_looking_down = False
        eye_close_confidence = 0.0

        if not landmarker_result.face_blendshapes:
            return eyes_closed, head_looking_down, eye_close_confidence

        # Use the first (primary) face
        blendshapes = landmarker_result.face_blendshapes[0]
        bs_dict = {b.category_name: b.score for b in blendshapes}

        # Eye blink detection — average of left and right
        left_blink = bs_dict.get("eyeBlinkLeft", 0.0)
        right_blink = bs_dict.get("eyeBlinkRight", 0.0)
        avg_blink = (left_blink + right_blink) / 2.0
        eye_close_confidence = avg_blink

        if avg_blink > EngagementState.EYE_BLINK_THRESHOLD:
            eyes_closed = True

        # Head looking down — use lookDown blendshape
        look_down = bs_dict.get("eyeLookDownLeft", 0.0) + bs_dict.get("eyeLookDownRight", 0.0)
        look_down_avg = look_down / 2.0
        if look_down_avg > 0.45:
            head_looking_down = True

        return eyes_closed, head_looking_down, eye_close_confidence

    def process_frame(self, base64_string: str) -> dict:
        try:
            self._frame_count += 1

            # Strip data URL prefix if present
            if "," in base64_string:
                base64_string = base64_string.split(",")[1]

            # Decode base64 → numpy array
            img_data = base64.b64decode(base64_string)
            nparr = np.frombuffer(img_data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if frame is None:
                status, reason = self.get_combined_status()
                return {"status": status, "reason": reason, "error": "Invalid frame"}

            # ── READY handshake on first valid frame ────────────────────
            if not self._ready_sent:
                self._ready_sent = True
                logger.info("[VISION] First valid frame received — sending READY handshake")
                print("🟢 [VISION] READY — Vision engine initialized, first frame decoded successfully")
                # Return READY status so frontend knows the engine is operational
                # before distraction scoring begins
                return {
                    "status": "ready",
                    "reason": "Vision engine initialized. Warm-up grace period active.",
                    "engagement_state": "INITIALIZING",
                    "engagement_confidence": 1.0,
                    "vision_ready": True,
                }

            # Pitch-black / covered camera check
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            mean_brightness = cv2.mean(gray)[0]

            if mean_brightness < 15:
                face_count = 0
                eyes_closed = False
                head_looking_down = False
                eye_close_confidence = 0.0
                print(
                    f"⚫ [VISION] Pitch-black/brightness={mean_brightness:.1f} < 15 "
                    f"— treating as NO FACE"
                )
            else:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

                # ── Primary: Face Landmarker (blendshapes + multi-face) ──
                try:
                    landmarker = _get_face_landmarker()
                    landmarker_result = landmarker.detect(mp_image)
                    face_count = len(landmarker_result.face_landmarks)
                    eyes_closed, head_looking_down, eye_close_confidence = (
                        self._analyze_blendshapes(landmarker_result)
                    )
                except Exception as lm_err:
                    # Fallback to simple face detector if landmarker fails
                    logger.warning(f"[VISION] Landmarker failed, falling back to detector: {lm_err}")
                    detector = _get_face_detector()
                    detection_result = detector.detect(mp_image)
                    face_count = len(detection_result.detections)
                    eyes_closed = False
                    head_looking_down = False
                    eye_close_confidence = 0.0

            # ── Run the Developer-Intent state machine ──────────────────
            eng_state, eng_reason, eng_confidence = self._engagement.classify(
                face_count=face_count,
                eyes_closed=eyes_closed,
                head_looking_down=head_looking_down,
                eye_close_confidence=eye_close_confidence,
                user_is_typing=self.user_is_typing,
            )

            # Get combined status (vision + window)
            status, reason = self.get_combined_status()

            # Log status changes
            if status != self._current_status:
                print(f"🔄 [VISION] Status changed: {self._current_status} -> {status} ({reason})")
                logger.info(f"User is now {status.upper()}: {reason}")
                self._current_status = status

            return {
                "status": status,
                "reason": reason,
                "engagement_state": eng_state,
                "engagement_confidence": round(eng_confidence, 2),
                "user_typing": self.user_is_typing,
            }

        except Exception as e:
            logger.error("Frame processing error: %s", e)
            return {"status": self._current_status, "error": str(e)}

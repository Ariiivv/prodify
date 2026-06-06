import cv2
import base64
import numpy as np
# Import the solution directly to bypass the initialization attribute error
from mediapipe.python.solutions import face_mesh as mp_face_mesh

# Initialize MediaPipe Face Mesh
# We use the alias we created above
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False, 
    max_num_faces=1, 
    refine_landmarks=True,
    min_detection_confidence=0.5
)

def process_frame(base64_string: str):
    """
    Decodes the base64 image, runs face detection, 
    and returns distraction status.
    """
    try:
        # 1. Clean the base64 string
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]

        # 2. Decode to OpenCV image
        img_data = base64.b64decode(base64_string)
        nparr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return {"distracted": False, "error": "Invalid frame data"}

        # 3. Process with MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb_frame)

        # 4. Logic: If no face is detected, the user is looking away or gone
        is_distracted = results.multi_face_landmarks is None

        return {"distracted": is_distracted}

    except Exception as e:
        return {"distracted": False, "error": str(e)}
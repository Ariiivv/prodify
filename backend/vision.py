import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# 1. Setup the detector using the modern Task API
base_options = python.BaseOptions(model_asset_path='face_landmarker.task')
options = vision.FaceLandmarkerOptions(
    base_options=base_options,
    output_face_blendshapes=False,
    output_facial_transformation_matrixes=False,
    num_faces=1
)
detector = vision.FaceLandmarker.create_from_options(options)

def process_frame(base64_string: str):
    try:
        # Clean the base64 string
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]

        # Decode
        import base64
        img_data = base64.b64decode(base64_string)
        nparr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return {"distracted": False, "error": "Invalid frame"}

        # Convert to MediaPipe Image
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        # Run inference
        results = detector.detect(mp_image)

        # Logic: If no face landmarks detected, the user is distracted
        is_distracted = len(results.face_landmarks) == 0

        return {"distracted": is_distracted}

    except Exception as e:
        return {"distracted": False, "error": str(e)}
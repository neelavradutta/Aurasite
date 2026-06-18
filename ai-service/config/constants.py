import time

START_TIME = time.time()

VEHICLE_CLASSES = {"car", "truck", "bus", "motorcycle", "bicycle", "van"}
COCO_VEHICLE_IDS = {2, 3, 5, 7}

PLATE_PATTERN = r"^[A-Z0-9]{2,3}[-\s]?[A-Z0-9]{3,4}$"

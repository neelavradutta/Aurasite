CREATE DATABASE IF NOT EXISTS anpr_db;
USE anpr_db;

CREATE TABLE IF NOT EXISTS vehicles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plate_number VARCHAR(20) UNIQUE NOT NULL,
  first_detected_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_detected_timestamp DATETIME,
  detection_count INT DEFAULT 1,
  vehicle_type VARCHAR(50),
  model VARCHAR(80),
  manufacturing_year VARCHAR(4),
  modifications VARCHAR(255),
  engine_number VARCHAR(50),
  chassis_number VARCHAR(50),
  fuel_type VARCHAR(30),
  insurance_status VARCHAR(30),
  registration_date DATE,
  color VARCHAR(30),
  owner_name VARCHAR(100),
  work VARCHAR(100),
  owner_contact VARCHAR(20),
  owner_email VARCHAR(120),
  owner_address VARCHAR(255),
  driving_license VARCHAR(50),
  registration_number VARCHAR(30),
  is_suspicious BOOLEAN DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  flagged_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_plate (plate_number),
  INDEX idx_timestamp (first_detected_timestamp),
  INDEX idx_suspicious (is_suspicious)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cameras (
  id INT PRIMARY KEY AUTO_INCREMENT,
  camera_code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  video_source VARCHAR(255) UNIQUE NOT NULL,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  place_name VARCHAR(255),
  gps_updated_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_camera_video_source (video_source)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS detections (
  id INT PRIMARY KEY AUTO_INCREMENT,
  vehicle_id INT,
  detection_timestamp DATETIME NOT NULL,
  plate_number VARCHAR(20),
  plate_confidence FLOAT,
  vehicle_confidence FLOAT,
  frame_number INT,
  bounding_box JSON,
  plate_bbox JSON,
  vehicle_type VARCHAR(50),
  vehicle_color VARCHAR(30),
  video_source VARCHAR(255),
  frame_image_path VARCHAR(255),
  is_repeat_detection BOOLEAN DEFAULT 0,
  detection_quality VARCHAR(50),
  track_id VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  INDEX idx_timestamp (detection_timestamp),
  INDEX idx_plate (plate_number),
  INDEX idx_confidence (vehicle_confidence),
  INDEX idx_repeat (is_repeat_detection)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alerts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  detection_id INT,
  vehicle_id INT,
  alert_type ENUM('suspicious', 'repeat', 'low_confidence', 'wanted', 'manual') NOT NULL,
  alert_message TEXT,
  severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  resolved_by VARCHAR(100),
  FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE SET NULL,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  INDEX idx_severity (severity),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS traffic_analytics (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE NOT NULL,
  hour_slot INT NOT NULL,
  vehicle_count INT DEFAULT 0,
  unique_vehicles INT DEFAULT 0,
  avg_confidence FLOAT,
  peak_hour BOOLEAN DEFAULT 0,
  UNIQUE KEY unique_hour (hour_slot, date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS confidence_metrics (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE NOT NULL,
  confidence_band VARCHAR(20) NOT NULL,
  detection_count INT DEFAULT 0,
  percentage FLOAT,
  UNIQUE KEY unique_band (confidence_band, date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role ENUM('admin', 'operator', 'viewer') DEFAULT 'operator',
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email)
) ENGINE=InnoDB;

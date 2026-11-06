-- =====================================================================
-- TransportGo - MySQL schema (MySQL 8.0+, InnoDB)
-- Tables: users, vehicles, trips, reservations
-- Run on the Ubuntu server:  mysql -u app_user -p transport < schema.sql
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- USERS : clients, drivers and administrators
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,                       -- bcrypt hash, never the password
  role          ENUM('client','driver','admin') NOT NULL DEFAULT 'client',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- VEHICLES : the bus fleet
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  plate      VARCHAR(20)  NOT NULL,
  model      VARCHAR(100) NOT NULL,
  capacity   SMALLINT UNSIGNED NOT NULL,                     -- number of seats
  status     VARCHAR(20)  NOT NULL DEFAULT 'available',      -- available | maintenance | retired
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_vehicles_plate (plate),
  CONSTRAINT ck_vehicles_capacity CHECK (capacity > 0),
  CONSTRAINT ck_vehicles_status   CHECK (status IN ('available','maintenance','retired'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- TRIPS : planned journeys, with an assigned vehicle and driver
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trips (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  origin       VARCHAR(100) NOT NULL,
  destination  VARCHAR(100) NOT NULL,
  departure_at DATETIME     NOT NULL,
  price        DECIMAL(8,2) NOT NULL,
  vehicle_id   INT UNSIGNED NOT NULL,
  driver_id    INT UNSIGNED NULL,                            -- NULL until a driver is assigned
  status       VARCHAR(20)  NOT NULL DEFAULT 'planned',      -- planned | departed | cancelled | completed
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_trips_search (origin, destination, departure_at),
  KEY idx_trips_driver (driver_id),
  CONSTRAINT fk_trips_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id),
  CONSTRAINT fk_trips_driver  FOREIGN KEY (driver_id)  REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT ck_trips_price  CHECK (price >= 0),
  CONSTRAINT ck_trips_status CHECK (status IN ('planned','departed','cancelled','completed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- RESERVATIONS : one seat on one trip for one client
--
-- seat_lock is a GENERATED column: "tripId:seatNumber" while the
-- reservation is active (confirmed or validated), NULL once cancelled.
-- Its UNIQUE index means MySQL itself refuses a second active booking
-- of the same seat, even with simultaneous requests. NULLs never
-- conflict, so a cancelled seat can be booked again.
-- The API must NOT write seat_lock: MySQL computes it from status.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code         VARCHAR(40)  NOT NULL,                        -- unique reservation number (also in the QR Code)
  user_id      INT UNSIGNED NOT NULL,
  trip_id      INT UNSIGNED NOT NULL,
  seat_number  SMALLINT UNSIGNED NOT NULL,
  status       VARCHAR(20)  NOT NULL DEFAULT 'confirmed',    -- confirmed | validated | cancelled
  seat_lock    VARCHAR(30) GENERATED ALWAYS AS (
                 IF(status IN ('confirmed','validated'), CONCAT(trip_id, ':', seat_number), NULL)
               ) STORED,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  validated_at DATETIME NULL,
  validated_by INT UNSIGNED NULL,                            -- the driver or admin who scanned the ticket
  PRIMARY KEY (id),
  UNIQUE KEY uk_reservations_code (code),
  UNIQUE KEY uk_reservations_seat_lock (seat_lock),
  KEY idx_reservations_user (user_id),
  KEY idx_reservations_trip (trip_id),
  CONSTRAINT fk_reservations_user   FOREIGN KEY (user_id)      REFERENCES users (id),
  CONSTRAINT fk_reservations_trip   FOREIGN KEY (trip_id)      REFERENCES trips (id),
  CONSTRAINT fk_reservations_driver FOREIGN KEY (validated_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT ck_reservations_seat   CHECK (seat_number > 0),
  CONSTRAINT ck_reservations_status CHECK (status IN ('confirmed','validated','cancelled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- SAMPLE DATA (optional, for development only)
-- The password_hash values are placeholders: these accounts cannot log
-- in. Create real accounts with POST /api/auth/register once the API
-- exists, then change roles with an UPDATE if you need a driver/admin.
-- =====================================================================
INSERT INTO users (name, email, password_hash, role) VALUES
  ('Admin Test',  'admin@transportgo.test',  'PLACEHOLDER_HASH', 'admin'),
  ('Driver Test', 'driver@transportgo.test', 'PLACEHOLDER_HASH', 'driver'),
  ('Client Test', 'client@transportgo.test', 'PLACEHOLDER_HASH', 'client');

INSERT INTO vehicles (plate, model, capacity, status) VALUES
  ('123-TUN-4567', 'Mercedes Tourismo', 50, 'available'),
  ('987-TUN-1234', 'Iveco Crossway',    40, 'available');

INSERT INTO trips (origin, destination, departure_at, price, vehicle_id, driver_id, status) VALUES
  ('Tunis', 'Sousse', DATE_ADD(NOW(), INTERVAL 1 DAY), 12.50, 1, 2, 'planned'),
  ('Tunis', 'Sfax',   DATE_ADD(NOW(), INTERVAL 2 DAY), 20.00, 2, 2, 'planned'),
  ('Sousse', 'Tunis', DATE_ADD(NOW(), INTERVAL 3 DAY), 12.50, 1, 2, 'planned');

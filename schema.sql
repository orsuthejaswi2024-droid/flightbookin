-- Supabase SQL Schema for Airline Ticket Booking App

-- 1. Enable UUID Extension if not already active
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS flights CASCADE;


-- 3. Create Flights Table
CREATE TABLE flights (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    airline TEXT NOT NULL CHECK (airline IN ('Indigo', 'Air India', 'Vistara')),
    flight_number TEXT NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    departure_time TIMESTAMPTZ NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    total_seats INT NOT NULL DEFAULT 60 CHECK (total_seats > 0)
);

-- Disable Row Level Security (RLS) to allow read/write access via the anon key
ALTER TABLE flights DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access" ON flights;
CREATE POLICY "Allow public access" ON flights FOR ALL USING (true) WITH CHECK (true);

-- 4. Create Bookings Table
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flight_id INT NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL CHECK (length(trim(customer_name)) > 0),
    seat_number TEXT NOT NULL CHECK (length(trim(seat_number)) > 0),
    booking_date TIMESTAMPTZ DEFAULT NOW(),
    -- Constraint to prevent double-booking of a seat on a single flight
    CONSTRAINT unique_flight_seat UNIQUE (flight_id, seat_number)
);

ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public access" ON bookings;
CREATE POLICY "Allow public access" ON bookings FOR ALL USING (true) WITH CHECK (true);

-- 5. Create Indexes for Performance
CREATE INDEX idx_flights_search ON flights(origin, destination, departure_time);
CREATE INDEX idx_bookings_flight ON bookings(flight_id);
CREATE INDEX idx_bookings_customer ON bookings(customer_name);

-- 6. Insert Seed Data (Flights scheduled in the future)
-- Note: Assuming local testing in 2026/2027. We populate diverse routes.
INSERT INTO flights (airline, flight_number, origin, destination, departure_time, price, total_seats) VALUES
('Indigo', '6E-201', 'Delhi', 'Mumbai', '2026-08-15 08:30:00+05:30', 4500.00, 60),
('Indigo', '6E-504', 'Bangalore', 'Chennai', '2026-08-15 14:15:00+05:30', 2800.00, 60),
('Indigo', '6E-802', 'Mumbai', 'Kolkata', '2026-08-16 19:45:00+05:30', 5200.00, 60),

('Air India', 'AI-101', 'Mumbai', 'Delhi', '2026-08-15 09:00:00+05:30', 4800.00, 60),
('Air India', 'AI-302', 'Delhi', 'Bangalore', '2026-08-16 11:30:00+05:30', 5500.00, 60),
('Air India', 'AI-407', 'Kolkata', 'Chennai', '2026-08-17 16:00:00+05:30', 3900.00, 60),

('Vistara', 'UK-810', 'Bangalore', 'Delhi', '2026-08-15 07:15:00+05:30', 6200.00, 60),
('Vistara', 'UK-940', 'Delhi', 'Mumbai', '2026-08-15 18:00:00+05:30', 5800.00, 60),
('Vistara', 'UK-720', 'Mumbai', 'Bangalore', '2026-08-16 21:00:00+05:30', 4900.00, 60);

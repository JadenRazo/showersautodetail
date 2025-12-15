-- Auto Detailing Website Database Schema

-- Services offered
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    base_price DECIMAL(10, 2) NOT NULL,
    sedan_price DECIMAL(10, 2),
    suv_price DECIMAL(10, 2),
    truck_price DECIMAL(10, 2),
    duration_minutes INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Service packages (Basic, Premium, Platinum)
CREATE TABLE IF NOT EXISTS packages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    features JSONB,
    base_price DECIMAL(10, 2) NOT NULL,
    vehicle_multipliers JSONB,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer bookings
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(200) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL,
    service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
    package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
    booking_date DATE NOT NULL,
    booking_time TIME NOT NULL,
    address TEXT,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    total_amount DECIMAL(10, 2),
    deposit_amount DECIMAL(10, 2),
    deposit_paid BOOLEAN DEFAULT false,
    deposit_payment_id VARCHAR(255),
    final_payment_id VARCHAR(255),
    payment_token VARCHAR(32),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Quote requests
CREATE TABLE IF NOT EXISTS quote_requests (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(200) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL,
    service_level VARCHAR(50),
    estimated_price DECIMAL(10, 2),
    message TEXT,
    status VARCHAR(50) DEFAULT 'new',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer reviews
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(200) NOT NULL,
    customer_email VARCHAR(255),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    booking_id INTEGER REFERENCES bookings(id),
    is_approved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Before/After photos
CREATE TABLE IF NOT EXISTS gallery_photos (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200),
    before_image_url TEXT NOT NULL,
    after_image_url TEXT NOT NULL,
    vehicle_type VARCHAR(50),
    service_id INTEGER REFERENCES services(id),
    is_featured BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin settings
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Addons table for individual add-on services
CREATE TABLE IF NOT EXISTS addons (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'interior', 'exterior', 'protection'
    sedan_price DECIMAL(10, 2) NOT NULL,
    suv_price DECIMAL(10, 2) NOT NULL,
    commercial_price DECIMAL(10, 2) NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    is_standalone BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Junction table: which addons are included in which services
CREATE TABLE IF NOT EXISTS service_included_addons (
    id SERIAL PRIMARY KEY,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    addon_id INTEGER REFERENCES addons(id) ON DELETE CASCADE,
    UNIQUE(service_id, addon_id)
);

-- Junction table: which addons are recommended/available for which services
CREATE TABLE IF NOT EXISTS service_available_addons (
    id SERIAL PRIMARY KEY,
    service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
    addon_id INTEGER REFERENCES addons(id) ON DELETE CASCADE,
    UNIQUE(service_id, addon_id)
);

-- Track selected addons per booking
CREATE TABLE IF NOT EXISTS booking_addons (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
    addon_id INTEGER REFERENCES addons(id),
    price_charged DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for addon queries
CREATE INDEX IF NOT EXISTS idx_addons_category ON addons(category);
CREATE INDEX IF NOT EXISTS idx_addons_active ON addons(is_active);
CREATE INDEX IF NOT EXISTS idx_booking_addons_booking ON booking_addons(booking_id);

-- Insert services with fixed pricing (Sedan/Coupe | SUV/Truck | Commercial)
INSERT INTO services (name, description, base_price, sedan_price, suv_price, truck_price, duration_minutes) VALUES
('Exterior Wash/Wax/Sealant', 'Complete exterior hand wash with premium wax and sealant protection. Includes hand wash, tire cleaning, window cleaning, and protective sealant.', 50.00, 50.00, 60.00, 80.00, 60),
('Interior Detail', 'Full interior cleaning including vacuum, dashboard and console wipe-down, door panels, glass cleaning, and air freshening.', 120.00, 120.00, 160.00, 200.00, 90),
('Interior DEEP Cleaning', 'Intensive interior restoration with steam cleaning, stain extraction, headliner cleaning, vent cleaning, and full sanitation.', 200.00, 200.00, 240.00, 280.00, 150),
('Package Deal', 'Interior Detail combined with Full Exterior wash/wax/sealant. Best value for complete vehicle care.', 150.00, 150.00, 200.00, 250.00, 150),
('Disaster Vehicle', 'Complete restoration package. Deep Interior cleaning plus Full Exterior with headlight restoration and ozone odor treatment included.', 230.00, 230.00, 270.00, 310.00, 240)
ON CONFLICT DO NOTHING;

-- Insert addons with per-vehicle-type pricing
INSERT INTO addons (name, slug, description, category, sedan_price, suv_price, commercial_price, duration_minutes, is_standalone, sort_order) VALUES
-- Interior Addons
('Ozone Odor Treatment', 'ozone-treatment', 'Eliminate smoke, pet, mold, and stubborn odors with professional ozone treatment', 'interior', 50.00, 60.00, 75.00, 60, true, 1),
('Pet Hair Removal', 'pet-hair', 'Heavy-duty pet hair extraction beyond standard vacuuming', 'interior', 35.00, 45.00, 60.00, 45, true, 2),
('Leather Conditioning', 'leather-conditioning', 'Premium leather cleaning, conditioning, and UV protection', 'interior', 30.00, 40.00, 50.00, 30, true, 3),
('Fabric Protection', 'fabric-protection', 'Stain guard treatment for cloth seats and carpets', 'interior', 35.00, 45.00, 55.00, 20, true, 4),
('Deep Carpet Shampoo', 'carpet-shampoo', 'Hot water extraction carpet and floor mat cleaning', 'interior', 40.00, 50.00, 65.00, 45, true, 5),
-- Exterior Addons
('Ceramic Spray Coating', 'ceramic-coating', '3-6 month paint protection against UV, dust, and contaminants', 'protection', 75.00, 95.00, 120.00, 45, true, 6),
('Paint Correction', 'paint-correction', 'Single stage polish to remove swirl marks and light scratches', 'exterior', 150.00, 200.00, 250.00, 120, true, 7),
('Headlight Restoration', 'headlight-restoration', 'Restore clarity to oxidized and foggy headlight lenses (pair)', 'exterior', 40.00, 40.00, 50.00, 30, true, 8),
('Engine Bay Cleaning', 'engine-bay', 'Degrease, clean, and dress engine compartment', 'exterior', 45.00, 55.00, 70.00, 45, true, 9),
('Tire & Wheel Deep Clean', 'tire-wheel', 'Brake dust removal, wheel cleaning, and premium tire dressing', 'exterior', 25.00, 30.00, 40.00, 30, false, 10),
('Trim Restoration', 'trim-restoration', 'Revive faded black plastic trim and moldings', 'exterior', 30.00, 40.00, 50.00, 30, true, 11),
('Rain-X Treatment', 'rain-x', 'Hydrophobic coating for all windows and mirrors', 'exterior', 20.00, 25.00, 30.00, 15, false, 12),
('Clay Bar Treatment', 'clay-bar', 'Remove bonded surface contaminants before waxing for a glass-smooth finish', 'exterior', 50.00, 65.00, 80.00, 45, false, 13),
('Bug & Tar Removal', 'bug-tar', 'Targeted removal of bugs, road tar, and tree sap', 'exterior', 20.00, 25.00, 35.00, 20, false, 14)
ON CONFLICT DO NOTHING;

-- Map included addons for Disaster Vehicle package (service id 5)
-- Disaster Vehicle includes: Pet Hair Removal, Ozone Treatment, Headlight Restoration
INSERT INTO service_included_addons (service_id, addon_id)
SELECT 5, id FROM addons WHERE slug IN ('pet-hair', 'ozone-treatment', 'headlight-restoration')
ON CONFLICT DO NOTHING;

-- Map included addons for Interior DEEP Cleaning (service id 3)
-- Deep Cleaning includes: Pet Hair Removal, Deep Carpet Shampoo
INSERT INTO service_included_addons (service_id, addon_id)
SELECT 3, id FROM addons WHERE slug IN ('pet-hair', 'carpet-shampoo')
ON CONFLICT DO NOTHING;

-- Keep packages table for backward compatibility but with updated values
INSERT INTO packages (name, description, features, base_price, vehicle_multipliers, sort_order) VALUES
('Exterior', 'Exterior Wash/Wax/Sealant',
 '["Hand wash", "Tire cleaning", "Window cleaning", "Wax application", "Sealant protection"]',
 50.00,
 '{"sedan": 1.0, "suv": 1.2, "commercial": 1.6}',
 1),
('Interior', 'Interior Detail',
 '["Full vacuum", "Dashboard wipe", "Door panel cleaning", "Glass cleaning", "Air freshening"]',
 120.00,
 '{"sedan": 1.0, "suv": 1.33, "commercial": 1.67}',
 2),
('Deep Interior', 'Interior DEEP Cleaning',
 '["Steam cleaning", "Stain extraction", "Headliner cleaning", "Vent cleaning", "Full sanitation", "Pet hair removal", "Deep carpet shampoo"]',
 200.00,
 '{"sedan": 1.0, "suv": 1.2, "commercial": 1.4}',
 3),
('Package Deal', 'Interior + Exterior Combo',
 '["Full interior detail", "Complete exterior wash", "Wax and sealant", "Best value"]',
 150.00,
 '{"sedan": 1.0, "suv": 1.33, "commercial": 1.67}',
 4),
('Disaster Vehicle', 'Deep Interior + Full Exterior',
 '["Deep interior cleaning", "Full exterior detail", "Headlight restoration", "Ozone treatment", "Complete restoration"]',
 230.00,
 '{"sedan": 1.0, "suv": 1.17, "commercial": 1.35}',
 5)
ON CONFLICT DO NOTHING;

-- Insert default settings
INSERT INTO settings (key, value) VALUES
('business_hours', '{"monday": "9:00-18:00", "tuesday": "9:00-18:00", "wednesday": "9:00-18:00", "thursday": "9:00-18:00", "friday": "9:00-18:00", "saturday": "10:00-16:00", "sunday": "closed"}'),
('deposit_percentage', '0.25'),
('notification_email', 'owner@yourdetailing.com'),
('notification_phone', '+14422295998'),
('service_area_center', '{"lat": 40.7128, "lng": -74.0060}'),
('service_area_radius', '25');

-- Admin users for authentication
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(200),
    role VARCHAR(50) DEFAULT 'admin',
    totp_secret VARCHAR(64),
    totp_enabled BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refresh tokens for long-lived sessions ("remember me")
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    device_info VARCHAR(500),
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Google Reviews Cache
-- Stores fetched Google Places reviews to reduce API calls
CREATE TABLE IF NOT EXISTS google_reviews_cache (
    id SERIAL PRIMARY KEY,
    place_id VARCHAR(255) NOT NULL UNIQUE,
    overall_rating DECIMAL(2, 1),
    total_reviews INTEGER,
    reviews_data JSONB NOT NULL,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(is_approved);
CREATE INDEX IF NOT EXISTS idx_gallery_featured ON gallery_photos(is_featured);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_google_reviews_place ON google_reviews_cache(place_id);

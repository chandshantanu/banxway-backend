-- Migration 018: Create Banxway team user accounts
-- These users already exist in GoTrue auth; this creates matching records in the users table

INSERT INTO users (id, email, full_name, role, is_active, created_at, updated_at) VALUES
('0e9901ab-a54d-4caf-bf01-26cf7303d433', 'ceo@banxwayglobal.com', 'Ashish R. Sahay', 'admin', true, NOW(), NOW()),
('8835714d-4890-499f-b639-eddd5f2e027c', 'prakash.singh@banxwayglobal.com', 'Prakash Singh', 'manager', true, NOW(), NOW()),
('ebeb1363-a28e-421f-a19c-9bc24565ab93', 'sales@banxwayglobal.com', 'Neeta Joshi', 'manager', true, NOW(), NOW()),
('342004ae-b2f2-4573-bea9-61817f37a904', 'sr.sales@banxwayglobal.com', 'Nishant Kapoor', 'manager', true, NOW(), NOW()),
('8541344b-cdde-49e1-b0f4-b9db937159f0', 'neeraj@banxwayglobal.com', 'Neeraj Kumar', 'admin', true, NOW(), NOW()),
('a04fab9d-ef19-4d5c-901e-f89a2e1048fd', 'connect@banxwayglobal.com', 'Banxway Pricing', 'support', true, NOW(), NOW()),
('6445b237-dfef-4577-ae29-1b7f5b1c2951', 'import@banxwayglobal.com', 'Vijay Tiwari', 'support', true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, is_active = true, updated_at = NOW();

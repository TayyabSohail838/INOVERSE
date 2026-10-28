-- Starting data for Inovix & Co. Run after schema.sql (SQL Editor → New query → paste → Run).
-- Safe to run once. Edit anything later from the app's Company tab.

insert into company_profile (company, name, about) values (
  'inovix',
  'Inovix & Co',
  'Faisalabad-based AI startup. Founder & CEO: M Tayyab Sohail.
Approach: turn published AI research papers into practical tools that fill gaps in small businesses.
Target customers: small and medium businesses in Pakistan (energy users, textile mills, schools, clinics).
Business model: own products (hardware only if needed) + app plan monthly or yearly; plus paid custom builds for clients.
Stage: pre-revenue. No product has a paying customer yet.
Seeking: mentorship, funding, incubation (applying to NIC Faisalabad).
Stack: Next.js, Supabase, Vercel. Gemma via Google AI Studio.'
) on conflict (company) do nothing;

-- Team of 2. Add your teammate from the Company tab (name + role).
insert into team_members (company, name, role) values
  ('inovix', 'Tayyab', 'Founder & CEO, AI engineering, full-stack');

insert into products (company, name, description, stage) values
  ('inovix', 'Wattly', 'Smart home energy monitor: ESP32 + current sensor + dashboard + AI', 'prototype'),
  ('inovix', 'Fabriq AI', 'Fabric defect detection for textile mills', 'prototype'),
  ('inovix', 'Kidz Lab', 'Kids Python + AI tutor', 'prototype'),
  ('inovix', 'AI Clinic Management Assistant', 'Clinic assistant, delivered to one clinic (unpaid)', 'pilot'),
  ('inovix', 'Mental Health Companion', 'Chatbot built for a clinic, shipping soon', 'pilot');

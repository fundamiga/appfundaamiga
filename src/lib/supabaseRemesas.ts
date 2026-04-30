import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nohziejeaqigcaxpjxlt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vaHppZWplYXFpZ2NheHBqeGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTk0ODgsImV4cCI6MjA5MzEzNTQ4OH0.7YsyTtvRXnEX141GrgTE0wHQ50PWpFtPPBnKcVBHE7s';

export const supabaseRemesas = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

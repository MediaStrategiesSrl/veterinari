import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../js/config.js";

// Creiamo e esportiamo l'unica istanza
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
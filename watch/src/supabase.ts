import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import config from "../config.json";

export const SUPABASE_URL: string = config.supabaseUrl;
export const SUPABASE_KEY: string = config.supabasePublishableKey;

// Same database and login as the phone app. The session lives in the watch's
// storage and refreshes itself, so you link the watch once.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

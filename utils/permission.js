import { supabase } from "./supabaseClient.js";

export async function canUsePlatform() {

    const {
        data: { user }
    } = await supabase.auth.getUser();

    if (!user)
        return false;

    const { data } = await supabase
        .from("profiles")
        .select("email_notifications_enabled")
        .eq("id", user.id)
        .single();

    return data?.email_notifications_enabled === true;

}
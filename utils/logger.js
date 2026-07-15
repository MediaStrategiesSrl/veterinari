import { supabase } from './supabaseClient.js'; // Aggiusta il percorso se serve

/**
 * Registra un errore nel database Supabase.
 * @param {Object} params - Dettagli dell'errore
 */
export const logError = async ({ source, action, errorMessage, errorCode = null, stackTrace = null, context = {} }) => {
    try {
        // Recuperiamo l'utente loggato (se presente)
        const { data: { user } } = await supabase.auth.getUser();

        // Inseriamo il log nella tabella che abbiamo appena creato
        const { error } = await supabase
            .from('error_logs')
            .insert([{
                user_id: user ? user.id : null,
                source: source,
                action: action,
                error_message: errorMessage,
                error_code: errorCode,
                stack_trace: stackTrace,
                context: context // Supabase gestirà in automatico il JSONB
            }]);

        if (error) {
            console.error("❌ Errore critico: impossibile scrivere in error_logs:", error);
        }
    } catch (err) {
        // Fallback di sicurezza se salta la connessione al DB
        console.error("❌ Fallimento totale del sistema di logging:", err);
    }
};
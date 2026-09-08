import { supabase } from './supabaseClient.js';
import { logError } from './logger.js';

// ruolo: 'veterinario' | 'sponsor'
export async function checkApprovalStatus(userId, ruolo) {
    const tabella = ruolo === 'veterinario' ? 'veterinarians' : 'sponsors';

    try {
        const { data, error } = await supabase
            .from(tabella)
            .select('is_approved')
            .eq('user_id', userId)
            .single();

        if (error && error.code === 'PGRST116') {
            return { isApproved: false, hasProfile: false };
        }
        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_APPROVAL_CHECK_ERROR' });

        return { isApproved: !!data.is_approved, hasProfile: true };

    } catch (error) {
        await logError({
            source: 'approval_guard',
            action: 'check_approval_status',
            errorMessage: error.message,
            errorCode: error.code || 'UNKNOWN_APPROVAL_CHECK_ERROR',
            context: { userId, ruolo }
        });
        return { isApproved: false, hasProfile: true }; // fail-safe: blocchiamo in caso di errore di sistema
    }
}

export function showApprovalPendingOverlay(mainContainer, ruolo, hasProfile = true) {
    const messaggio = hasProfile
        ? `Il tuo profilo ${ruolo} è in fase di verifica da parte del nostro team. Riceverai una notifica non appena sarà approvato.`
        : `La registrazione come ${ruolo} non risulta ancora completata.`;

    const overlay = document.createElement('div');
    overlay.className = 'approval-pending-overlay';
    overlay.innerHTML = `
        <div class="approval-pending-card">
            <div class="approval-pending-icon"><i class="fa-regular fa-clock"></i></div>
            <h2>Account in attesa di approvazione</h2>
            <p>${messaggio}</p>
            <a href="profilo-${ruolo}.html#cambia-ruolo" class="btn-primary">Cambia ruolo</a>
        </div>
    `;

    mainContainer.appendChild(overlay);
    mainContainer.classList.add('approval-locked');
}

export function applyPartialApprovalLock({ lockSelectors, keepActiveHrefIncludes, badgeSelector, bannerTarget }) {
    const banner = document.createElement('div');
    banner.className = 'approval-banner';
    banner.innerHTML = `
        <i class="fa-regular fa-clock"></i>
        <div>
            <strong>Account in attesa di approvazione</strong>
            <p>Finché non viene verificato puoi solo gestire i ruoli del tuo account.</p>
        </div>
    `;
    bannerTarget.parentNode.insertBefore(banner, bannerTarget);

    document.querySelectorAll(lockSelectors.join(',')).forEach(card => {
        if (keepActiveHrefIncludes && card.getAttribute('href')?.includes(keepActiveHrefIncludes)) {
            card.classList.add('highlight');
            // Alcune card hanno background/padding già in style inline nell'HTML,
            // che vincerebbe sempre sulla regola CSS: lo sovrascriviamo qui.
            card.style.background = '#F0F9FF';
            card.style.border = '1.5px solid #38BDF8';
        } else {
            card.classList.add('locked');
        }
    });

    if (badgeSelector) {
        const badge = document.querySelector(badgeSelector);
        if (badge) {
            badge.innerHTML = '<i class="fa-regular fa-clock"></i> IN ATTESA DI APPROVAZIONE';
            badge.classList.add('pending');
        }
    }
}
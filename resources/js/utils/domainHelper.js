/**
 * Check if current domain is the web manager user domain
 */
export const isWebManagerUserDomain = () => {
    const currentDomain = window.location.hostname;
    // This will be set from env or config
    // For now, we'll check via API
    return false; // Will be determined server-side
};

/**
 * Get WEB_MANAGER_USER domain from API
 */
export const getWebManagerDomain = async () => {
    try {
        const response = await fetch('/api/web-manager/domain-check');
        const data = await response.json();
        return data.is_web_manager_domain || false;
    } catch (error) {
        return false;
    }
};


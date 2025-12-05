import { useEffect } from 'react';

/**
 * Custom hook to set page title dynamically
 * @param {string} title - The page title to set
 * @param {string} suffix - Optional suffix (defaults to 'Chatplus')
 */
export function usePageTitle(title, suffix = 'Chatplus') {
    useEffect(() => {
        const fullTitle = title ? `${title} - ${suffix}` : suffix;
        document.title = fullTitle;
        
        // Cleanup: reset to default when component unmounts
        return () => {
            document.title = suffix;
        };
    }, [title, suffix]);
}

export default usePageTitle;


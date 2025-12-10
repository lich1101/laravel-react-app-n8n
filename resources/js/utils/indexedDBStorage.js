/**
 * IndexedDB storage utility for large data (supports data > 10MB)
 * Falls back to localStorage for small data or if IndexedDB is not available
 */

const DB_NAME = 'WorkflowExecutionData';
const STORE_NAME = 'executionData';
const DB_VERSION = 1;

let dbInstance = null;

/**
 * Initialize IndexedDB
 */
const initDB = () => {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        if (!window.indexedDB) {
            reject(new Error('IndexedDB is not supported'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            reject(new Error('Failed to open IndexedDB'));
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };
    });
};

/**
 * Save data to IndexedDB (or localStorage as fallback)
 * @param {string} key - Storage key
 * @param {any} data - Data to save
 * @returns {Promise<void>}
 */
export const saveExecutionData = async (key, data) => {
    try {
        // Try IndexedDB first (for large data)
        try {
            const db = await initDB();
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            await new Promise((resolve, reject) => {
                const request = store.put({ key, data, timestamp: Date.now() });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            
            console.log(`✅ Saved to IndexedDB: ${key}`);
            return;
        } catch (indexedDBError) {
            console.warn('IndexedDB save failed, trying localStorage:', indexedDBError);
            // Fall through to localStorage
        }

        // Fallback to localStorage for small data
        const jsonString = JSON.stringify(data);
        const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
        
        if (sizeInMB > 5) {
            throw new Error(`Data too large for localStorage (${sizeInMB.toFixed(2)}MB). IndexedDB is required.`);
        }
        
        localStorage.setItem(key, jsonString);
        console.log(`✅ Saved to localStorage: ${key}`);
    } catch (error) {
        console.error('Error saving execution data:', error);
        throw error;
    }
};

/**
 * Load data from IndexedDB (or localStorage as fallback)
 * @param {string} key - Storage key
 * @returns {Promise<any|null>}
 */
export const loadExecutionData = async (key) => {
    try {
        // Try IndexedDB first
        try {
            const db = await initDB();
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            
            const data = await new Promise((resolve, reject) => {
                const request = store.get(key);
                request.onsuccess = () => {
                    if (request.result) {
                        resolve(request.result.data);
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => reject(request.error);
            });
            
            if (data) {
                console.log(`✅ Loaded from IndexedDB: ${key}`);
                return data;
            }
        } catch (indexedDBError) {
            console.warn('IndexedDB load failed, trying localStorage:', indexedDBError);
            // Fall through to localStorage
        }

        // Fallback to localStorage
        const stored = localStorage.getItem(key);
        if (stored) {
            const data = JSON.parse(stored);
            console.log(`✅ Loaded from localStorage: ${key}`);
            return data;
        }
        
        return null;
    } catch (error) {
        console.error('Error loading execution data:', error);
        return null;
    }
};

/**
 * Remove data from both IndexedDB and localStorage
 * @param {string} key - Storage key
 * @returns {Promise<void>}
 */
export const removeExecutionData = async (key) => {
    try {
        // Remove from IndexedDB
        try {
            const db = await initDB();
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            await new Promise((resolve, reject) => {
                const request = store.delete(key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            
            console.log(`✅ Removed from IndexedDB: ${key}`);
        } catch (indexedDBError) {
            console.warn('IndexedDB remove failed:', indexedDBError);
        }

        // Also remove from localStorage (cleanup)
        try {
            localStorage.removeItem(key);
        } catch (localStorageError) {
            console.warn('localStorage remove failed:', localStorageError);
        }
    } catch (error) {
        console.error('Error removing execution data:', error);
    }
};

/**
 * Get size of stored data
 * @param {any} data - Data to measure
 * @returns {number} Size in MB
 */
export const getDataSizeMB = (data) => {
    try {
        const jsonString = JSON.stringify(data);
        return new Blob([jsonString]).size / (1024 * 1024);
    } catch (error) {
        console.error('Error calculating data size:', error);
        return 0;
    }
};


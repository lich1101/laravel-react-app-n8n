export const quoteRootSegment = (segment = '') => {
    const value = String(segment);

    if (value.startsWith('"') && value.endsWith('"')) {
        return value;
    }

    const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    return `"${escaped}"`;
};

export const normalizeVariablePrefix = (prefix = '', isRoot = false) => {
    if (!prefix) {
        return '';
    }

    return isRoot ? quoteRootSegment(prefix) : prefix;
};

export const buildVariablePath = (prefix = '', key = '') => {
    if (!prefix) {
        return quoteRootSegment(key);
    }

    return `${prefix}.${key}`;
};

export const buildArrayPath = (prefix = '', index) => {
    const normalizedIndex = typeof index === 'number' ? index : index;

    if (!prefix) {
        return `[${normalizedIndex}]`;
    }

    return `${prefix}[${normalizedIndex}]`;
};

const hasOwnProperty = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export const splitVariablePath = (path = '') => {
    if (!path) {
        return [];
    }

    const trimmed = String(path).trim();
    const segments = [];
    let buffer = '';
    let i = 0;
    let inQuotes = false;
    let escaped = false;

    const pushBuffer = () => {
        const token = buffer;
        if (token !== '') {
            segments.push(token);
        }
        buffer = '';
    };

    while (i < trimmed.length) {
        const char = trimmed[i];

        if (inQuotes) {
            if (escaped) {
                buffer += char;
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                pushBuffer();
                inQuotes = false;
            } else {
                buffer += char;
            }
            i += 1;
            continue;
        }

        if (char === '"') {
            pushBuffer();
            inQuotes = true;
            i += 1;
            continue;
        }

        if (char === '.') {
            pushBuffer();
            i += 1;
            continue;
        }

        if (char === '[') {
            pushBuffer();
            const endBracket = trimmed.indexOf(']', i);
            if (endBracket === -1) {
                segments.push(trimmed.substring(i).trim());
                break;
            }
            const arrayToken = trimmed.substring(i, endBracket + 1).trim();
            if (arrayToken) {
                segments.push(arrayToken);
            }
            i = endBracket + 1;
            continue;
        }

        buffer += char;
        i += 1;
    }

    pushBuffer();

    return segments.map(segment => segment.trim()).filter(segment => segment !== '');
};

export const traverseVariableSegments = (segments, startValue) => {
    if (!Array.isArray(segments) || segments.length === 0) {
        return { exists: true, value: startValue };
    }

    let current = startValue;

    for (const segment of segments) {
        if (segment === '') {
            continue;
        }

        if (current === undefined || current === null) {
            return { exists: false, value: undefined };
        }

        const arrayMatch = segment.match(/^\[(\d+)\]$/);

        if (arrayMatch) {
            const index = parseInt(arrayMatch[1], 10);
            if (Array.isArray(current) && index >= 0 && index < current.length) {
                current = current[index];
            } else if (
                typeof current === 'object' &&
                current !== null &&
                hasOwnProperty(current, index)
            ) {
                current = current[index];
            } else {
                return { exists: false, value: undefined };
            }
        } else {
            if (
                typeof current === 'object' &&
                current !== null &&
                (hasOwnProperty(current, segment) || segment in current)
            ) {
                current = current[segment];
            } else {
                return { exists: false, value: undefined };
            }
        }
    }

    return { exists: true, value: current };
};

export const resolveVariableValue = (path = '', data) => {
    if (!path) {
        return { exists: false, value: undefined };
    }

    if (data === undefined || data === null) {
        return { exists: false, value: undefined };
    }

    const segments = splitVariablePath(path);
    if (segments.length === 0) {
        return { exists: false, value: undefined };
    }

    const firstSegment = segments[0];

    if (!Array.isArray(data) && typeof data === 'object' && firstSegment in data) {
        return traverseVariableSegments(segments, data);
    }

    if (/^input-\d+$/.test(firstSegment)) {
        const inputIndex = parseInt(firstSegment.replace('input-', ''), 10);
        let current;
        let found = false;

        if (!Array.isArray(data) && typeof data === 'object' && firstSegment in data) {
            current = data[firstSegment];
            found = true;
        } else if (Array.isArray(data) && inputIndex >= 0 && inputIndex < data.length) {
            current = data[inputIndex];
            found = true;
        }

        if (found) {
            if (segments.length === 1) {
                return { exists: true, value: current };
            }

            return traverseVariableSegments(segments.slice(1), current);
        }
    }

    if (Array.isArray(data)) {
        for (const item of data) {
            if (!item || typeof item !== 'object') {
                continue;
            }

            const result = traverseVariableSegments(segments, item);
            if (result.exists) {
                return result;
            }
        }
    }

    return { exists: false, value: undefined };
};


/**
 * Attempts to parse a JSON string that may be incomplete (e.g. from a stream).
 * It tries to repair the string by closing open structures before parsing.
 */
export function parsePartialJson(json: string): any {
    if (!json) return null;

    // First try normal parse
    try {
        return JSON.parse(json);
    } catch (e) {
        // If normal parse fails, try to repair
    }

    const trimmed = json.trimStart();

    // If it doesn't look like an object or array, we can't really do much
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return null;
    }

    // Simple stack-based repair
    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (char === '{') {
                stack.push('}');
            } else if (char === '[') {
                stack.push(']');
            } else if (char === '}') {
                if (stack.length > 0 && stack[stack.length - 1] === '}') {
                    stack.pop();
                }
            } else if (char === ']') {
                if (stack.length > 0 && stack[stack.length - 1] === ']') {
                    stack.pop();
                }
            }
        }
    }

    // Reconstruct the string with closing characters
    let repaired = trimmed;

    // If we ended inside a string, close it
    if (inString) {
        // If we ended in an escaped state (i.e. the last char was a backslash that didn't escape anything yet),
        // we must remove it to avoid escaping the closing quote we are about to add.
        if (escaped) {
            repaired = repaired.slice(0, -1);
        }
        repaired += '"';
    }

    // Handle trailing commas or incomplete keys
    // We need to look at the *repaired* string so far (with the quote closed)
    // But actually, let's look at the end of the string before adding closers.

    // Regex to find trailing comma: /,\s*$/
    // Regex to find trailing incomplete key: /"[^"]*"\s*:\s*$/

    // We need to be careful not to match inside strings, but we just closed the string if it was open.
    // So we can safely check the end.

    // Handle trailing commas
    if (repaired.match(/,\s*$/)) {
        repaired = repaired.replace(/,\s*$/, '');
    }

    // Handle incomplete keys: {"key": value, "key2":
    // We want to remove , "key2":
    if (repaired.match(/,\s*"[^"]*"\s*:\s*$/)) {
        repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*$/, '');
    }

    // Handle incomplete keys at start: {"key":
    // We want to remove "key": -> {
    if (repaired.match(/^{\s*"[^"]*"\s*:\s*$/)) {
        repaired = repaired.replace(/"[^"]*"\s*:\s*$/, '');
    }

    // Close all open structures in reverse order
    while (stack.length > 0) {
        repaired += stack.pop();
    }

    try {
        return JSON.parse(repaired);
    } catch (e) {
        return null;
    }
}

export async function hashString(str: string, algo: string): Promise<string> {
    const encoder = new TextEncoder();

    return crypto.subtle
        .digest(algo, encoder.encode(str))
        .then(hashBuffer => {
            return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        });
}
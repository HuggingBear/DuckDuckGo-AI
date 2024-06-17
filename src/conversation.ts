/**
 * Generates a SHA-256 hash of an array of messages.
 *
 * @param {string[]} messages - The array of messages to generate the hash for.
 * @return {Promise<string>} A Promise that resolves to the generated hash as a hexadecimal string.
 */
export async function generateConversationHash(messages: string[]): Promise<string> {
    
    const binaryData = new TextEncoder().encode(messages.join(','));
    const hashHex = await crypto.subtle.digest('SHA-256', binaryData).then(hashBuffer => {
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');  
    }); 
    
    return new Promise((resolve) => resolve(hashHex));
}


/**
 * Saves conversation information to a KVNamespace with a specified expiration time.
 *
 * @param {KVNamespace} kvNamespace - The KVNamespace object where the conversation information will be saved.
 * @param {string} messagesHash - The hash of the messages representing the conversation.
 * @param {string} conversationId - The ID of the conversation to be saved.
 * @return {Promise<void>} A Promise that resolves when the conversation information is successfully saved.
 */
export async function saveConversationId(kvNamespace: KVNamespace, messagesHash: string, conversationId: string): Promise<void> {
    return await kvNamespace.put(messagesHash, conversationId, { expirationTtl: 24 * 60 * 60 });
}

/**
 * Retrieves session information from the KVNamespace using the provided messagesHash.
 *
 * @param {KVNamespace} kvNamespace - The KVNamespace object to retrieve session information from.
 * @param {string} messagesHash - The hash used to fetch the session information.
 * @return {Promise<string | null>} A Promise that resolves to the session information or null if not found.
 */
export async function getConversationId(kvNamespace: KVNamespace, messagesHash: string): Promise<string | null> {
    return await kvNamespace.get(messagesHash);
}
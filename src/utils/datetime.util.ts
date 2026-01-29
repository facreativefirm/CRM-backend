/**
 * DateTime utility for Nagad integration
 * Nagad requires datetime in Bangladesh timezone (Asia/Dhaka)
 * Format: YmdHis (e.g., 20260128163000)
 */

/**
 * Get current Bangladesh time in Nagad format (YmdHis)
 * @returns string - Formatted datetime like "20260128163000"
 */
export function getBangladeshDateTime(): string {
    // Create date in Bangladesh timezone (UTC+6)
    const now = new Date();

    // Convert to Bangladesh time (UTC+6)
    const bdTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));

    const year = bdTime.getFullYear();
    const month = String(bdTime.getMonth() + 1).padStart(2, '0');
    const day = String(bdTime.getDate()).padStart(2, '0');
    const hours = String(bdTime.getHours()).padStart(2, '0');
    const minutes = String(bdTime.getMinutes()).padStart(2, '0');
    const seconds = String(bdTime.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Alternative implementation using manual UTC offset
 */
export function getBangladeshDateTimeAlt(): string {
    const now = new Date();

    // Bangladesh is UTC+6
    const bdOffset = 6 * 60; // 6 hours in minutes
    const localOffset = now.getTimezoneOffset(); // Local offset in minutes (negative for ahead of UTC)
    const totalOffset = bdOffset + localOffset;

    const bdTime = new Date(now.getTime() + totalOffset * 60 * 1000);

    const year = bdTime.getUTCFullYear();
    const month = String(bdTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(bdTime.getUTCDate()).padStart(2, '0');
    const hours = String(bdTime.getUTCHours()).padStart(2, '0');
    const minutes = String(bdTime.getUTCMinutes()).padStart(2, '0');
    const seconds = String(bdTime.getUTCSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

export default {
    getBangladeshDateTime,
    getBangladeshDateTimeAlt
};

export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
};

export const generateSlug = (text: string): string => {
    return text.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
};

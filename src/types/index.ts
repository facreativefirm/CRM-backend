export interface User {
    id: number;
    email: string;
    name?: string;
}

export interface Client {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
}

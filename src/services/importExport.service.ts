import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import bcrypt from 'bcryptjs';

export class ImportExportService {

    // --- HELPERS ---
    private static escapeCsvField(field: any): string {
        if (field === null || field === undefined) return '';
        const stringField = String(field);
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
    }

    private static parseCsvLine(line: string): string[] {
        // Simple regex to parse CSV handling quotes
        const pattern = /(".*?"|[^",\s]+)(?=\s*,|\s*$)/g;
        // Fallback for simple split if no complex parsing needed (for now, simple split by comma)
        // A robust regex is complex, we will use a simple split for this MVP plan
        // and assume standard formatting.
        // For production, a library like 'csv-parse' is recommended.
        return line.split(',').map(s => s.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    }

    // --- EXPORT ---

    static async exportClients() {
        const clients = await prisma.client.findMany({
            include: { user: true, contacts: { where: { isPrimary: true } } }
        });

        const header = ['ID', 'FirstName', 'LastName', 'Email', 'Company', 'Phone', 'Address', 'City', 'Country', 'Status', 'Balance'];
        const rows = clients.map(c => [
            c.id,
            c.user.firstName,
            c.user.lastName,
            c.user.email,
            c.companyName,
            c.contacts[0]?.phone,
            c.contacts[0]?.address1,
            c.contacts[0]?.city,
            c.contacts[0]?.country,
            c.status,
            c.creditBalance
        ]);

        return [header, ...rows].map(row => row.map(this.escapeCsvField).join(',')).join('\n');
    }

    static async exportProducts() {
        const products = await prisma.product.findMany({
            include: { productService: true }
        });

        const header = ['ID', 'Name', 'GroupName', 'Type', 'MonthlyPrice', 'AnnualPrice', 'Stock'];
        const rows = products.map(p => [
            p.id,
            p.name,
            p.productService?.name,
            p.productType,
            p.monthlyPrice,
            p.annualPrice,
            p.stockQuantity
        ]);

        return [header, ...rows].map(row => row.map(this.escapeCsvField).join(',')).join('\n');
    }

    static async exportInvoices() {
        const invoices = await prisma.invoice.findMany({
            include: { client: { include: { user: true } } }
        });

        const header = ['ID', 'InvoiceNumber', 'ClientEmail', 'Total', 'Status', 'DueDate', 'DateCreated'];
        const rows = invoices.map(inv => [
            inv.id,
            inv.invoiceNumber,
            inv.client.user.email,
            inv.totalAmount,
            inv.status,
            inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : '',
            new Date(inv.createdAt).toISOString().split('T')[0]
        ]);

        return [header, ...rows].map(row => row.map(this.escapeCsvField).join(',')).join('\n');
    }

    static async exportProductServices() {
        const services = await prisma.productService.findMany({
            include: { parentService: true }
        });

        const header = ['ID', 'Name', 'Slug', 'Description', 'ParentService', 'DisplayOrder', 'IconClass'];
        const rows = services.map(s => [
            s.id,
            s.name,
            s.slug,
            s.description,
            s.parentService?.name,
            s.displayOrder,
            s.iconClass
        ]);

        return [header, ...rows].map(row => row.map(this.escapeCsvField).join(',')).join('\n');
    }

    // --- IMPORT ---

    static async importClients(csvContent: string) {
        const lines = csvContent.split('\n').filter(l => l.trim().length > 0);
        const [headerLine, ...dataLines] = lines;
        // Expected Header: FirstName, LastName, Email, Company, Phone, Address, City, Country, Password(Optional)

        const results = { success: 0, failed: 0, errors: [] as string[] };

        for (const line of dataLines) {
            try {
                const cols = line.split(','); // Simple split for now
                if (cols.length < 3) continue;

                // Support both "ID,FirstName,LastName,Email..." and "FirstName,LastName,Email..." formats
                // The provided example CSV has ID at index 0. We need to detect which column holds what.
                // For this quick fix, we'll try to sniff the email.

                // Let's assume standard order:
                // 0: FirstName, 1: LastName, 2: Email...
                // OR
                // 0: ID, 1: FirstName, 2: LastName, 3: Email...

                let firstName, lastName, email, companyName, phone, address1, city, country, passwordRaw;

                // Simple heuristic: check if col 2 or col 3 looks like an email
                if (cols[3] && cols[3].includes('@')) {
                    // Likely ID is at 0
                    [, firstName, lastName, email, companyName, phone, address1, city, country, , , passwordRaw] = cols.map(s => s.trim());
                } else {
                    // Likely standard format
                    [firstName, lastName, email, companyName, phone, address1, city, country, passwordRaw] = cols.map(s => s.trim());
                }

                if (!email || !email.includes('@')) {
                    throw new Error(`Invalid email: ${email}`);
                }

                const existingUser = await prisma.user.findFirst({ where: { email } });
                if (existingUser) {
                    throw new Error(`User already exists: ${email}`);
                }

                const passwordHash = await bcrypt.hash(passwordRaw || 'ChangeMe123!', 10);

                await prisma.$transaction(async (tx) => {
                    const user = await tx.user.create({
                        data: {
                            email,
                            // Use email prefix + random suffix to ensure unique username
                            username: `${email.split('@')[0]}_${Math.floor(1000 + Math.random() * 9000)}`,
                            passwordHash,
                            firstName,
                            lastName,
                            userType: 'CLIENT',
                            status: 'ACTIVE'
                        }
                    });

                    const client = await tx.client.create({
                        data: {
                            userId: user.id,
                            companyName,
                            currency: 'USD'
                        }
                    });

                    await tx.clientContact.create({
                        data: {
                            clientId: client.id,
                            contactType: 'PRIMARY',
                            isPrimary: true,
                            firstName: firstName || 'Main',
                            lastName: lastName || 'Contact',
                            email,
                            phone,
                            address1,
                            city,
                            country
                        }
                    });
                });

                results.success++;
            } catch (err: any) {
                results.failed++;
                results.errors.push(err.message);
            }
        }

        return results;
    }
    static async importProducts(csvContent: string) {
        const lines = csvContent.split('\n').filter(l => l.trim().length > 0);
        const [headerLine, ...dataLines] = lines;

        // Dynamic mapping based on user requirements
        const serviceMapping: Record<string, string> = {
            "BDIX VPS (NVME)": "vps",
            "Cloud VPS": "vps",
            "Premium VPS": "vps",
            "VPS Starter": "vps",
            "VPS Business": "vps",
            "SSD Starter": "ssd-web-hosting",
            "SSD Business": "ssd-web-hosting",
            "SSD Premium": "ssd-web-hosting",
            "Corporate Basic": "corporate-hosting",
            "Corporate Enterprise": "corporate-hosting",
            "WordPress Starter": "wordpress-hosting",
            "WordPress Business": "wordpress-hosting",
            "WordPress E-commerce": "wordpress-hosting",
            "BDIX Basic": "bdix-hosting",
            "BDIX Premium": "bdix-hosting",
            "Singapore Starter": "singapore-hosting",
            "Singapore Business": "singapore-hosting",
            "Reseller Bronze": "reseller",
            "Reseller Silver": "reseller",
            "Reseller Gold": "reseller",
            "Dedicated Basic": "dedicated",
            "Dedicated Pro": "dedicated",
            "Dedicated Enterprise": "dedicated",
            ".com Domain": "domains",
            ".bd Domain": "domains",
            ".com.bd Domain": "domains",
            "DV SSL Basic": "ssl-certificates",
            "OV SSL Business": "ssl-certificates",
            "Wildcard SSL": "ssl-certificates",
        };

        const results = { success: 0, failed: 0, errors: [] as string[] };
        const serviceCache = new Map<string, number>();

        for (const line of dataLines) {
            try {
                const cols = line.split(',');
                if (cols.length < 2) continue;

                const [name, type, monthlyPrice, annualPrice] = cols.map(s => s.trim());

                if (!name) throw new Error("Product Name is required");

                // Determine Service Slug from mapping or fallback
                let serviceSlug = serviceMapping[name] || 'other';

                // Ensure service exists and get its ID
                let serviceId = serviceCache.get(serviceSlug);

                if (!serviceId) {
                    let service = await prisma.productService.findUnique({ where: { slug: serviceSlug } });
                    if (!service) {
                        // Create default service group if it doesn't exist
                        service = await prisma.productService.create({
                            data: {
                                name: serviceSlug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
                                slug: serviceSlug
                            }
                        });
                    }
                    serviceId = service.id;
                    serviceCache.set(serviceSlug, serviceId);
                }

                // Check duplicates (by slug or name)
                const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

                const existing = await prisma.product.findFirst({ where: { slug } });
                if (existing) throw new Error(`Product ${name} already exists`);

                await prisma.product.create({
                    data: {
                        name,
                        slug,
                        productType: (type ? type.toUpperCase() : 'HOSTING') as any,
                        pricingModel: 'RECURRING',
                        monthlyPrice: parseFloat(monthlyPrice) || 0,
                        annualPrice: parseFloat(annualPrice) || 0,
                        serviceId: serviceId,
                        status: 'ACTIVE'
                    }
                });

                results.success++;
            } catch (err: any) {
                results.failed++;
                results.errors.push(`${line.substring(0, 30)}... : ${err.message}`);
            }
        }
        return results;
    }

    static async importProductServices(csvContent: string) {
        const lines = csvContent.split('\n').filter(l => l.trim().length > 0);
        const [headerLine, ...dataLines] = lines;
        // Expected Header: Name, Slug, Description, ParentServiceSlug, DisplayOrder, IconClass

        const results = { success: 0, failed: 0, errors: [] as string[] };

        for (const line of dataLines) {
            try {
                const cols = line.split(',');
                if (cols.length < 1) continue;

                // Heuristic for ID column
                let name, slug, description, parentServiceSlug, displayOrder, iconClass;
                if (cols[2] && cols[2].includes('-')) { // likely has a slug in index 2
                    [, name, slug, description, parentServiceSlug, displayOrder, iconClass] = cols.map(s => s.trim());
                } else {
                    [name, slug, description, parentServiceSlug, displayOrder, iconClass] = cols.map(s => s.trim());
                }

                if (!name) throw new Error("Service Name is required");

                const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

                const existing = await prisma.productService.findFirst({ where: { slug: finalSlug } });
                if (existing) throw new Error(`Service with slug ${finalSlug} already exists`);

                let parentId = null;
                if (parentServiceSlug) {
                    const parent = await prisma.productService.findFirst({ where: { slug: parentServiceSlug } });
                    if (parent) parentId = parent.id;
                }

                await prisma.productService.create({
                    data: {
                        name,
                        slug: finalSlug,
                        description,
                        parentServiceId: parentId,
                        displayOrder: parseInt(displayOrder) || 0,
                        iconClass
                    }
                });

                results.success++;
            } catch (err: any) {
                results.failed++;
                results.errors.push(`${line.substring(0, 20)}... : ${err.message}`);
            }
        }
        return results;
    }
}

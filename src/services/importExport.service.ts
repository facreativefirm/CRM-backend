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
        if (!line) return [];
        // Detect delimiter (comma or semicolon)
        const delimiter = line.includes(';') && (line.match(/;/g) || []).length > (line.match(/,/g) || []).length ? ';' : ',';

        const result: string[] = [];
        let cur = '';
        let inQuote = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === delimiter && !inQuote) {
                result.push(cur.trim());
                cur = '';
            } else {
                cur += char;
            }
        }
        result.push(cur.trim());

        return result.map(s => s.replace(/^"|"$/g, '').replace(/""/g, '"'));
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
        // Remove BOM and clean line endings
        const cleanContent = csvContent.replace(/^\uFEFF/, '').replace(/\r/g, '');
        const lines = cleanContent.split('\n').filter(l => l.trim().length > 0);

        if (lines.length < 2) throw new AppError('Empty or invalid CSV file', 400);

        const [headerLine, ...dataLines] = lines;

        // Clean headers: lowercase, alphanumeric matching only
        const headers = this.parseCsvLine(headerLine).map(h =>
            h.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
        );

        const results = { success: 0, failed: 0, errors: [] as string[] };

        // Identify column indices with fuzzy matching
        const emailIdx = headers.findIndex(h => h.includes('email'));
        const firstIdx = headers.findIndex(h => h.includes('first') || h === 'name' || h === 'firstname');
        const lastIdx = headers.findIndex(h => h.includes('last') || h === 'lastname');
        const companyIdx = headers.findIndex(h => h.includes('comp'));
        const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('tel'));
        const addressIdx = headers.findIndex(h => h.includes('addr'));
        const cityIdx = headers.findIndex(h => h.includes('city'));
        const countryIdx = headers.findIndex(h => h.includes('country'));
        const passIdx = headers.findIndex(h => h.includes('pass'));

        if (emailIdx === -1) {
            console.error('Parsed Headers:', headers);
            throw new AppError(`Could not find Email column. Found headers: ${headers.join(', ')}`, 400);
        }

        for (const line of dataLines) {
            try {
                const cols = this.parseCsvLine(line);
                if (cols.length < 1) continue;

                const email = cols[emailIdx];
                const firstName = firstIdx !== -1 ? cols[firstIdx] : '';
                const lastName = lastIdx !== -1 ? cols[lastIdx] : '';
                const companyName = companyIdx !== -1 ? cols[companyIdx] : '';
                const phone = phoneIdx !== -1 ? cols[phoneIdx] : '';
                const address1 = addressIdx !== -1 ? cols[addressIdx] : '';
                const city = cityIdx !== -1 ? cols[cityIdx] : '';
                const country = countryIdx !== -1 ? cols[countryIdx] : '';
                const passwordRaw = passIdx !== -1 ? cols[passIdx] : '';

                if (!email || !email.includes('@')) {
                    if (email?.toLowerCase().includes('email')) continue; // Skip header repetition
                    continue;
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
        if (lines.length < 2) throw new AppError('Empty or invalid CSV file', 400);

        const [headerLine, ...dataLines] = lines;
        const headers = this.parseCsvLine(headerLine).map(h => h.toLowerCase().replace(/\s/g, ''));

        // Identify column indices
        const nameIdx = headers.findIndex(h => h === 'name' || h.includes('productname') || h.includes('title'));
        const typeIdx = headers.findIndex(h => h.includes('type') || h.includes('category'));
        const monthlyIdx = headers.findIndex(h => h.includes('monthly') || h.includes('price'));
        const annualIdx = headers.findIndex(h => h.includes('annual') || h.includes('yearly'));

        if (nameIdx === -1) {
            throw new AppError('Could not find Name column in CSV. Please ensure your header contains "Name".', 400);
        }

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
                const cols = this.parseCsvLine(line);
                if (cols.length < 1) continue;

                const name = cols[nameIdx];
                const type = typeIdx !== -1 ? cols[typeIdx] : 'HOSTING';
                const monthlyPrice = monthlyIdx !== -1 ? cols[monthlyIdx] : '0';
                const annualPrice = annualIdx !== -1 ? cols[annualIdx] : '0';

                if (!name || name === 'Name') continue;

                let serviceSlug = serviceMapping[name] || 'other';
                let serviceId = serviceCache.get(serviceSlug);

                if (!serviceId) {
                    let service = await prisma.productService.findUnique({ where: { slug: serviceSlug } });
                    if (!service) {
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

                const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                const existing = await prisma.product.findFirst({ where: { slug } });
                if (existing) {
                    results.success++; // Skip but count as success or just ignore
                    continue;
                }

                await prisma.product.create({
                    data: {
                        name,
                        slug,
                        productType: (type ? type.toUpperCase() : 'HOSTING') as any,
                        pricingModel: 'RECURRING',
                        monthlyPrice: parseFloat(monthlyPrice.replace(/[^0-9.]/g, '')) || 0,
                        annualPrice: parseFloat(annualPrice.replace(/[^0-9.]/g, '')) || 0,
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
        if (lines.length < 2) throw new AppError('Empty or invalid CSV file', 400);

        const [headerLine, ...dataLines] = lines;
        const headers = this.parseCsvLine(headerLine).map(h => h.toLowerCase().replace(/\s/g, ''));

        const nameIdx = headers.findIndex(h => h === 'name' || h.includes('servicename'));
        const slugIdx = headers.findIndex(h => h === 'slug');
        const descIdx = headers.findIndex(h => h.includes('desc'));
        const parentIdx = headers.findIndex(h => h.includes('parent'));
        const orderIdx = headers.findIndex(h => h.includes('order'));
        const iconIdx = headers.findIndex(h => h.includes('icon'));

        const results = { success: 0, failed: 0, errors: [] as string[] };

        for (const line of dataLines) {
            try {
                const cols = this.parseCsvLine(line);
                if (cols.length < 1) continue;

                const name = nameIdx !== -1 ? cols[nameIdx] : '';
                if (!name || name === 'Name') continue;

                const slug = slugIdx !== -1 ? cols[slugIdx] : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                const description = descIdx !== -1 ? cols[descIdx] : '';
                const parentServiceSlug = parentIdx !== -1 ? cols[parentIdx] : '';
                const displayOrder = orderIdx !== -1 ? cols[orderIdx] : '0';
                const iconClass = iconIdx !== -1 ? cols[iconIdx] : '';

                const existing = await prisma.productService.findFirst({ where: { slug } });
                if (existing) continue;

                let parentId = null;
                if (parentServiceSlug) {
                    const parent = await prisma.productService.findFirst({ where: { slug: parentServiceSlug } });
                    if (parent) parentId = parent.id;
                }

                await prisma.productService.create({
                    data: {
                        name,
                        slug,
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

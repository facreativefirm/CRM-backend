import nodemailer from 'nodemailer';
import prisma from '../config/database';

/**
 * Modern System Email Wrapper
 * Provides a sleek, professional look that matches the application's aesthetic.
 */
const wrapInSystemLayout = (content: string, appName: string = 'Cloud Portal') => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${appName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
    <div style="background-color: #f4f7fa; padding: 40px 20px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border-collapse: separate;">
            <!-- Header -->
            <tr>
                <td style="background: linear-gradient(135deg, #0a66c2 0%, #127be3 100%); padding: 32px; text-align: center;">
                    <div style="display: inline-block;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; text-transform: uppercase;">${appName}</span>
                    </div>
                </td>
            </tr>
            <!-- Content Area -->
            <tr>
                <td style="padding: 48px 40px; background-color: #ffffff; color: #1f2937;">
                    <div style="font-size: 16px; line-height: 1.6;">
                        ${content}
                    </div>
                </td>
            </tr>
            <!-- Footer -->
            <tr>
                <td style="background-color: #f9fafb; padding: 32px 40px; text-align: center; border-top: 1px solid #f3f4f6;">
                    <p style="margin: 0 0 12px 0; font-size: 13px; color: #6b7280; font-weight: 500;">
                        Stay connected with us for any assistance.
                    </p>
                    <div style="margin-bottom: 24px;">
                        <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">
                            This is an automated notification from ${appName}.<br>
                            If you have questions, please contact our support team.
                        </p>
                    </div>
                    <p style="margin: 0; font-size: 14px; font-weight: 600; color: #111827;">
                        The ${appName} Team
                    </p>
                </td>
            </tr>
        </table>
        <!-- Copyright/Unsubscribe -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 24px auto 0; text-align: center;">
            <tr>
                <td style="font-size: 12px; color: #9ca3af; letter-spacing: 0.01em;">
                    &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
                </td>
            </tr>
        </table>
    </div>
</body>
</html>
`;

const getEmailSettings = async () => {
    const settings = await prisma.systemSetting.findMany({
        where: {
            settingKey: {
                in: [
                    'smtpHost', 'smtpPort', 'smtpUser', 'smtpPass',
                    'smtpFromEmail', 'smtpFromName', 'smtpSecure'
                ]
            }
        }
    });

    const config: Record<string, string> = {};
    settings.forEach(s => {
        config[s.settingKey] = s.settingValue;
    });

    console.log(`[EmailService] Loaded ${settings.length} SMTP settings from database:`,
        Object.keys(config).map(k => `${k}: ${k === 'smtpPass' ? '***' : config[k]}`).join(', ')
    );

    return config;
};

export const sendEmail = async (to: string, subject: string, html: string, attachments?: { filename: string, content: Buffer | string }[]) => {
    const config = await getEmailSettings();
    let appName = config.smtpFromName || 'Client Portal';

    // White-label detection logic: Check if recipient belongs to a Reseller
    try {
        const client = await prisma.client.findFirst({
            where: { user: { email: to } },
            include: { reseller: true }
        });

        if (client?.reseller && client.reseller.whiteLabelEnabled) {
            const brandSettings = client.reseller.brandSettings ?
                (typeof client.reseller.brandSettings === 'string' ? JSON.parse(client.reseller.brandSettings) : client.reseller.brandSettings)
                : null;

            if (brandSettings?.brandName) {
                appName = brandSettings.brandName;
            }
        }
    } catch (err) {
        console.error('White-label email detection failed:', err);
    }

    if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
        console.error(`[EmailService] CRITICAL: Email settings are INCOMPLETE in the database. 
            Required: smtpHost, smtpUser, smtpPass.
            Current Config: ${JSON.stringify(config)}
            Target: ${to} | Subject: ${subject}`);
        return;
    }

    console.log(`[EmailService] Attempting to send email:
        To: ${to}
        Subject: ${subject}
        Host: ${config.smtpHost}
        User: ${config.smtpUser}
        Port: ${config.smtpPort || '587'}`);

    try {
        const transporter = nodemailer.createTransport({
            host: config.smtpHost,
            port: parseInt(config.smtpPort || '587'),
            secure: config.smtpSecure === 'true',
            auth: {
                user: config.smtpUser,
                pass: config.smtpPass,
            },
        });

        // Verify connection configuration
        await transporter.verify();
        console.log(`[EmailService] SMTP connection verified successfully.`);

        const info = await transporter.sendMail({
            from: `"${appName}" <${config.smtpFromEmail || config.smtpUser}>`,
            to,
            subject,
            html: wrapInSystemLayout(html, appName),
            attachments: attachments || [],
        });

        console.log(`[EmailService] Email successfully sent to ${to}. MessageID: ${info.messageId}`);
        return info;
    } catch (error: any) {
        console.error('[EmailService] FAILED to send email:', {
            target: to,
            subject: subject,
            errorMessage: error.message,
            errorCode: error.code,
            command: error.command
        });
        throw error;
    }
};

/**
 * Professional Email Templates
 */
export const EmailTemplates = {
    welcome: (firstName: string) => ({
        subject: `Welcome to Cloud Portal, ${firstName}!`,
        body: `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Welcome aboard!</h2>
            <p style="margin: 0 0 24px 0;">Hi ${firstName}, your account has been successfully created. We're excited to have you with us!</p>
            <p style="margin: 0 0 32px 0;">You can now log in to your dashboard to manage your services, billing, and support requests.</p>
            <div style="text-align: center;">
                <a href="#" style="background-color: #0a66c2; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">Go to Dashboard</a>
            </div>
        `
    }),

    orderConfirmation: (orderNumber: string, total: string) => ({
        subject: `Your request (#${orderNumber}) has been received`,
        body: `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700; letter-spacing: -0.01em;">Thank you for your order</h2>
            <p style="margin: 0 0 24px 0;">We've received your order and our team is currently processing it. Below you'll find a summary of your request.</p>
            
            <div style="background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding-bottom: 12px; color: #6b7280; font-size: 14px; font-weight: 500;">Order Number</td>
                        <td style="padding-bottom: 12px; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">#${orderNumber}</td>
                    </tr>
                    <tr>
                        <td style="padding-top: 12px; border-top: 1px solid #e5e7eb; color: #111827; font-size: 16px; font-weight: 700;">Total Amount</td>
                        <td style="padding-top: 12px; border-top: 1px solid #e5e7eb; color: #0a66c2; font-size: 18px; font-weight: 700; text-align: right;">${total}</td>
                    </tr>
                </table>
            </div>

            <p style="margin: 0 0 32px 0;">We will notify you via email as soon as your services are ready for use. In the meantime, you can track your order status in the client portal.</p>
            
            <div style="text-align: center;">
                <a href="#" style="background-color: #0a66c2; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block; transition: background-color 0.2s;">View Order Status</a>
            </div>
        `
    }),

    invoiceCreated: (invoiceOrNumber: any, dueDate?: string, total?: string) => {
        let invoiceNumber: string = "";
        let date: string = "";
        let amount: string = "";

        if (typeof invoiceOrNumber === 'object') {
            invoiceNumber = invoiceOrNumber.invoiceNumber;
            date = new Date(invoiceOrNumber.dueDate).toLocaleDateString();
            amount = invoiceOrNumber.totalAmount?.toString() || calculateTotal(invoiceOrNumber);
        } else {
            invoiceNumber = invoiceOrNumber;
            date = dueDate || "";
            amount = total || "";
        }

        // Helper if needed, but assuming totalAmount is available or passed
        function calculateTotal(inv: any) {
            return inv.totalAmount || "0.00";
        }

        return {
            subject: `New Invoice Generated (#${invoiceNumber})`,
            body: `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">New Invoice Available</h2>
            <p style="margin: 0 0 24px 0;">A new invoice has been generated for your account. Please ensure payment is made by the due date to avoid any service interruption.</p>
            
            <div style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 32px;">
                <table width="100%" cellpadding="16" cellspacing="0" style="background-color: #f9fafb;">
                    <tr>
                        <td style="color: #6b7280; font-size: 13px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Invoice Details</td>
                    </tr>
                </table>
                <table width="100%" cellpadding="16" cellspacing="0">
                    <tr>
                        <td style="color: #6b7280; font-size: 14px;">Invoice #</td>
                        <td style="color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${invoiceNumber}</td>
                    </tr>
                    <tr>
                        <td style="color: #6b7280; font-size: 14px;">Amount Due</td>
                        <td style="color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${amount}</td>
                    </tr>
                    <tr>
                        <td style="color: #6b7280; font-size: 14px;">Due Date</td>
                        <td style="color: #ef4444; font-size: 14px; font-weight: 600; text-align: right;">${date}</td>
                    </tr>
                </table>
            </div>

            <p style="margin: 0 0 32px 0;">You can view and pay your invoice securely using our online client portal. Multiple payment methods are available for your convenience.</p>
            
            <div style="text-align: center;">
                <a href="#" style="background-color: #f37021; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">Secure Payment</a>
            </div>
        `
        };
    },

    invoicePaid: (invoiceNumber: string) => ({
        subject: `Payment Confirmation: Invoice #${invoiceNumber}`,
        body: `
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="background-color: #d1fae5; width: 64px; height: 64px; border-radius: 32px; display: inline-block; line-height: 64px; text-align: center;">
                    <span style="color: #059669; font-size: 32px;">&check;</span>
                </div>
            </div>
            <h2 style="text-align: center; color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Payment Successful</h2>
            <p style="text-align: center; margin: 0 0 24px 0; color: #4b5563;">Thank you for your payment. We’ve successfully processed the transaction for your invoice.</p>
            
            <div style="background-color: #f0fdf4; border: 1px solid #dcfce7; border-radius: 12px; padding: 24px; margin-bottom: 32px; text-align: center;">
                <p style="margin: 0 0 4px 0; color: #166534; font-size: 14px; font-weight: 500;">Invoice Settled</p>
                <p style="margin: 0; color: #111827; font-size: 20px; font-weight: 700;">#${invoiceNumber}</p>
            </div>

            <p style="margin: 0 0 32px 0; text-align: center;">A copy of your paid invoice has been attached to this email for your records. Your services will continue to remain active.</p>
            
            <div style="text-align: center;">
                <a href="#" style="background-color: #0a66c2; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">Go to Client Portal</a>
            </div>
        `
    }),

    domainExpirationReminder: (domainName: string, expiryDate: string) => ({
        subject: `ACTION REQUIRED: Your domain ${domainName} expires soon`,
        body: `
            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; color: #991b1b; font-weight: 600; font-size: 14px;">Priority Notice: Domain Expiration</p>
            </div>
            
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Don't let your domain expire</h2>
            <p style="margin: 0 0 24px 0;">Your domain name <strong>${domainName}</strong> is scheduled to expire on <strong>${expiryDate}</strong>.</p>
            
            <p style="margin: 0 0 24px 0; color: #4b5563;">To prevent any downtime for your website and linked email services, we recommend renewing your domain immediately. Expired domains can be difficult and expensive to recover.</p>

            <div style="text-align: center; margin-top: 32px;">
                <a href="#" style="background-color: #f37021; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">Renew Domain Now</a>
            </div>
        `
    }),

    domainRegistered: (domainName: string, expiryDate: string) => ({
        subject: `Success! Your domain ${domainName} is now registered`,
        body: `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Registration Confirmed</h2>
            <p style="margin: 0 0 24px 0;">Great news! Your domain name <strong>${domainName}</strong> has been successfully registered and is now active under your account.</p>
            
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding-bottom: 8px; color: #64748b; font-size: 14px;">Domain Asset</td>
                        <td style="padding-bottom: 8px; color: #0f172a; font-size: 14px; font-weight: 600; text-align: right;">${domainName}</td>
                    </tr>
                    <tr>
                        <td style="color: #64748b; font-size: 14px;">Expiry Date</td>
                        <td style="color: #0f172a; font-size: 14px; font-weight: 600; text-align: right;">${expiryDate}</td>
                    </tr>
                </table>
            </div>

            <p style="margin: 0 0 32px 0;">You can now manage DNS settings, set up email forwarding, or configure nameservers directly from your dashboard.</p>
            
            <div style="text-align: center;">
                <a href="#" style="background-color: #0a66c2; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">Manage My Domain</a>
            </div>
        `
    }),

    orderCompleted: (orderNumber: string) => ({
        subject: `Your service is now ready (#${orderNumber})`,
        body: `
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="background-color: #dbeafe; width: 64px; height: 64px; border-radius: 32px; display: inline-block; line-height: 64px; text-align: center;">
                    <span style="color: #2563eb; font-size: 32px;">🚀</span>
                </div>
            </div>
            <h2 style="text-align: center; color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Service Activated</h2>
            <p style="text-align: center; margin: 0 0 24px 0; color: #4b5563;">Good news! Your order <strong>#${orderNumber}</strong> has been fully processed and your services are now active and ready for use.</p>
            
            <div style="background-color: #f0f9ff; border: 1px solid #e0f2fe; border-radius: 12px; padding: 24px; margin-bottom: 32px; text-align: center;">
                <p style="margin: 0; color: #0369a1; font-size: 14px; font-weight: 600;">All systems are go. You can now access your new services directly from the dashboard.</p>
            </div>

            <p style="margin: 0 0 32px 0;">If you've purchased hosting or a server, please check the client portal for your access credentials and configuration details.</p>
            
            <div style="text-align: center;">
                <a href="#" style="background-color: #0a66c2; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">Access Dashboard</a>
            </div>
        `
    }),

    paymentRejected: (invoiceNumber: string, reason: string) => ({
        subject: `Payment Rejected: Invoice #${invoiceNumber}`,
        body: `
            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; color: #991b1b; font-weight: 600; font-size: 14px;">Transaction Declined</p>
            </div>
            
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Payment Verification Failed</h2>
            <p style="margin: 0 0 24px 0;">We were unable to verify your recent payment for Invoice <strong>#${invoiceNumber}</strong>.</p>
            
            <p style="margin: 0 0 24px 0; color: #4b5563;">Reason: ${reason || 'Invalid Transaction Details'}</p>

            <p style="margin: 0 0 32px 0;">Please check your transaction details and submit a new proof of payment, or use a different payment method.</p>
            
            <div style="text-align: center;">
                <a href="#" style="background-color: #f37021; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">View Invoice</a>
            </div>
        `
    }),

    refundProcessed: (invoiceNumber: string, amount: string, reason: string) => ({
        subject: `Refund Processed: Invoice #${invoiceNumber}`,
        body: `
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="background-color: #d1fae5; width: 64px; height: 64px; border-radius: 32px; display: inline-block; line-height: 64px; text-align: center;">
                    <span style="color: #059669; font-size: 32px;">⟲</span>
                </div>
            </div>
            <h2 style="text-align: center; color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Refund Processed</h2>
            <p style="text-align: center; margin: 0 0 24px 0; color: #4b5563;">We have processed a refund for your transaction associated with Invoice <strong>#${invoiceNumber}</strong>.</p>
            
            <div style="background-color: #f0fdf4; border: 1px solid #dcfce7; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding-bottom: 12px; color: #6b7280; font-size: 14px; font-weight: 500;">Refunded Amount</td>
                        <td style="padding-bottom: 12px; color: #111827; font-size: 16px; font-weight: 700; text-align: right;">${amount}</td>
                    </tr>
                    <tr>
                        <td style="padding-top: 12px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; font-weight: 500;">Reason</td>
                        <td style="padding-top: 12px; border-top: 1px solid #e5e7eb; color: #111827; font-size: 14px; text-align: right;">${reason}</td>
                    </tr>
                </table>
            </div>

            <p style="margin: 0 0 32px 0; text-align: center;">The refunded amount should appear in your original payment method statement within 5-10 business days.</p>
            
            <div style="text-align: center;">
                <a href="#" style="background-color: #0a66c2; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">View Billing History</a>
            </div>
        `
    }),

    serviceExpirationReminder: (serviceName: string, expiryDate: string, daysLeft: number) => ({
        subject: `Renewal Notice: Your ${serviceName} expires in ${daysLeft} days`,
        body: `
            <div style="background-color: #fefce8; border-left: 4px solid #eab308; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; color: #854d0e; font-weight: 600; font-size: 14px;">Service Renewal Notification</p>
            </div>
            
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Your service is expiring soon</h2>
            <p style="margin: 0 0 24px 0;">Your service <strong>${serviceName}</strong> is scheduled to renew/expire on <strong>${expiryDate}</strong> (in ${daysLeft} days).</p>
            
            <p style="margin: 0 0 24px 0; color: #4b5563;">An automated renewal invoice has been generated for your convenience. Please ensure payment is made promptly to avoid any interruption to your service.</p>

            <div style="text-align: center; margin-top: 32px;">
                <a href="#" style="background-color: #0a66c2; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">View and Pay Invoice</a>
            </div>
        `
    }),

    expiryAdminNotification: (itemName: string, clientName: string, daysLeft: number, type: string) => ({
        subject: `ADMIN ALERT: ${type} "${itemName}" expiring in ${daysLeft} days`,
        body: `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Expiring ${type} Alert</h2>
            <p style="margin: 0 0 24px 0;">This is an administrative notification that a ${type.toLowerCase()} belongs to <strong>${clientName}</strong> is expiring soon.</p>
            
            <div style="background-color: #f3f4f6; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding-bottom: 8px; color: #6b7280; font-size: 14px;">Item Name</td>
                        <td style="padding-bottom: 8px; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${itemName}</td>
                    </tr>
                    <tr>
                        <td style="padding-bottom: 8px; color: #6b7280; font-size: 14px;">Client</td>
                        <td style="padding-bottom: 8px; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${clientName}</td>
                    </tr>
                    <tr>
                        <td style="color: #6b7280; font-size: 14px;">Days Remaining</td>
                        <td style="color: #ef4444; font-size: 14px; font-weight: 600; text-align: right;">${daysLeft} Days</td>
                    </tr>
                </table>
            </div>

            <p style="margin: 0 0 32px 0;">An invoice and client notification have been automatically triggered.</p>
            
            <div style="text-align: center;">
                <a href="#" style="background-color: #111827; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">View Item in Admin</a>
            </div>
        `
    }),

    quoteProposal: (quoteNumber: string, amount: string, validUntil: string, url: string = "#") => ({
        subject: `New Proposal Received: #${quoteNumber}`,
        body: `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Proposal for Services</h2>
            <p style="margin: 0 0 24px 0;">We have prepared a new quotation for you. Please review the details below.</p>
            
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding-bottom: 12px; color: #64748b; font-size: 14px;">Quote Number</td>
                        <td style="padding-bottom: 12px; color: #0f172a; font-size: 14px; font-weight: 600; text-align: right;">#${quoteNumber}</td>
                    </tr>
                    <tr>
                        <td style="padding-bottom: 12px; color: #64748b; font-size: 14px;">Total Amount</td>
                        <td style="padding-bottom: 12px; color: #0f172a; font-size: 16px; font-weight: 700; text-align: right;">${amount}</td>
                    </tr>
                    <tr>
                        <td style="color: #64748b; font-size: 14px;">Valid Until</td>
                        <td style="color: #0f172a; font-size: 14px; font-weight: 600; text-align: right;">${validUntil}</td>
                    </tr>
                </table>
            </div>

            <p style="margin: 0 0 32px 0;">You can view the full details and accept or reject this proposal directly from your client portal.</p>
            
            <div style="text-align: center;">
                <a href="${url}" style="background-color: #0a66c2; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">View Proposal</a>
            </div>
        `
    }),

    quoteAccepted: (quoteNumber: string, invoiceNumber: string) => ({
        subject: `Quote Accepted: #${quoteNumber}`,
        body: `
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="background-color: #d1fae5; width: 64px; height: 64px; border-radius: 32px; display: inline-block; line-height: 64px; text-align: center;">
                    <span style="color: #059669; font-size: 32px;">👍</span>
                </div>
            </div>
            <h2 style="text-align: center; color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Proposal Accepted</h2>
            <p style="text-align: center; margin: 0 0 24px 0; color: #4b5563;">Thank you for accepting our proposal <strong>#${quoteNumber}</strong>.</p>
            
            <p style="text-align: center; margin: 0 0 32px 0;">An invoice (<strong>#${invoiceNumber}</strong>) has been generated and is now available for payment.</p>
            
            <div style="text-align: center;">
                <a href="#" style="background-color: #0a66c2; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">View Invoice</a>
            </div>
        `
    }),

    payoutRequested: (amount: string, method: string) => ({
        subject: `Withdrawal Request Received: ${amount}`,
        body: `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Withdrawal Request Received</h2>
            <p style="margin: 0 0 24px 0;">We've received your request to withdraw funds from your account.</p>
            
            <div style="background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding-bottom: 12px; color: #6b7280; font-size: 14px;">Amount requested</td>
                        <td style="padding-bottom: 12px; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${amount}</td>
                    </tr>
                    <tr>
                        <td style="color: #6b7280; font-size: 14px;">Method</td>
                        <td style="color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${method}</td>
                    </tr>
                </table>
            </div>

            <p style="margin: 0 0 32px 0;">Our finance team is reviewing your request. This process typically takes 1-3 business days. You'll receive another email once it's processed.</p>
        `
    }),

    payoutProcessed: (amount: string, status: string, notes?: string) => ({
        subject: `Withdrawal Request ${status}: ${amount}`,
        body: `
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="background-color: ${status === 'PAID' ? '#d1fae5' : '#fee2e2'}; width: 64px; height: 64px; border-radius: 32px; display: inline-block; line-height: 64px; text-align: center;">
                    <span style="color: ${status === 'PAID' ? '#059669' : '#ef4444'}; font-size: 32px;">${status === 'PAID' ? '✓' : '✕'}</span>
                </div>
            </div>
            <h2 style="text-align: center; color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Withdrawal ${status}</h2>
            <p style="text-align: center; margin: 0 0 24px 0; color: #4b5563;">Your withdrawal request for <strong>${amount}</strong> has been <strong>${status}</strong>.</p>
            
            ${notes ? `
            <div style="background-color: #f3f4f6; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
                <p style="margin: 0; color: #4b5563; font-size: 14px;"><strong>Admin Notes:</strong> ${notes}</p>
            </div>
            ` : ''}

            <p style="margin: 0 0 32px 0; text-align: center;">You can check your transaction history in your dashboard for more details.</p>
        `
    }),

    adminPayoutNotification: (userName: string, amount: string, method: string, type: string) => ({
        subject: `ACTION REQUIRED: New Payout Request from ${userName}`,
        body: `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">New Payout Request</h2>
            <p style="margin: 0 0 24px 0;">A new payout request has been submitted by a <strong>${type}</strong>.</p>
            
            <div style="background-color: #f3f4f6; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding-bottom: 8px; color: #6b7280; font-size: 14px;">User</td>
                        <td style="padding-bottom: 8px; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${userName}</td>
                    </tr>
                    <tr>
                        <td style="padding-bottom: 8px; color: #6b7280; font-size: 14px;">Amount</td>
                        <td style="padding-bottom: 8px; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${amount}</td>
                    </tr>
                    <tr>
                        <td style="color: #6b7280; font-size: 14px;">Method</td>
                        <td style="color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${method}</td>
                    </tr>
                </table>
            </div>

            <p style="margin: 0 0 32px 0;">Please log in to the admin panel to review and process this request.</p>
        `
    }),

    adminManualPayment: (invoiceNumber: string, clientName: string, amount: string, gateway: string, transactionId: string, senderNumber: string) => ({
        subject: `ACTION REQUIRED: Manual Payment Proof #${invoiceNumber}`,
        body: `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Manual Payment Proof Submitted</h2>
            <p style="margin: 0 0 24px 0;">A client has submitted manual payment proof for their invoice.</p>
            
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding-bottom: 8px; color: #6b7280; font-size: 14px;">Invoice #</td>
                        <td style="padding-bottom: 8px; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${invoiceNumber}</td>
                    </tr>
                    <tr>
                        <td style="padding-bottom: 8px; color: #6b7280; font-size: 14px;">Client</td>
                        <td style="padding-bottom: 8px; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${clientName}</td>
                    </tr>
                    <tr>
                        <td style="padding-bottom: 8px; color: #6b7280; font-size: 14px;">Amount</td>
                        <td style="padding-bottom: 8px; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${amount}</td>
                    </tr>
                    <tr>
                        <td style="padding-bottom: 8px; color: #6b7280; font-size: 14px;">Gateway</td>
                        <td style="padding-bottom: 8px; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${gateway}</td>
                    </tr>
                    <tr>
                        <td style="padding-bottom: 8px; color: #6b7280; font-size: 14px;">Transaction ID</td>
                        <td style="padding-bottom: 8px; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${transactionId}</td>
                    </tr>
                    <tr>
                        <td style="color: #6b7280; font-size: 14px;">Sender Number</td>
                        <td style="color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${senderNumber}</td>
                    </tr>
                </table>
            </div>

            <p style="margin: 0 0 32px 0;">Please review the proof and approve/reject the transaction in the admin billing section.</p>
            <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/billing?tab=transactions" style="background-color: #0a66c2; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">Go to Transactions</a>
            </div>
        `
    }),

    adminTransitionNotification: (type: string, details: string) => ({
        subject: `System Alert: New Client ${type}`,
        body: `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">${type} Recorded</h2>
            <p style="margin: 0 0 24px 0;">A new client activity was recorded on the system.</p>
            
            <div style="background-color: #f3f4f6; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                <p style="margin: 0; color: #111827; font-size: 14px; line-height: 1.6;">${details}</p>
            </div>

            <p style="margin: 0 0 32px 0;">You can view the details in the administrative dashboard.</p>
        `
    }),

    serviceCancellationRequest: (serviceName: string, clientName: string, type: string, reason: string) => ({
        subject: `ACTION REQUIRED: Cancellation Request for ${serviceName}`,
        body: `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">Service Cancellation Request</h2>
            <p style="margin: 0 0 24px 0;">A client has requested to cancel their service. Administrative action is required.</p>
            
            <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding-bottom: 12px; color: #6b7280; font-size: 14px; font-weight: 500;">Service Name</td>
                        <td style="padding-bottom: 12px; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${serviceName}</td>
                    </tr>
                    <tr>
                        <td style="padding-bottom: 12px; color: #6b7280; font-size: 14px; font-weight: 500;">Client</td>
                        <td style="padding-bottom: 12px; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${clientName}</td>
                    </tr>
                    <tr>
                        <td style="padding-bottom: 12px; color: #6b7280; font-size: 14px; font-weight: 500;">Type</td>
                        <td style="padding-bottom: 12px; color: #ef4444; font-size: 14px; font-weight: 600; text-align: right;">${type}</td>
                    </tr>
                    <tr>
                        <td style="padding-top: 12px; border-top: 1px solid #fee2e2; color: #6b7280; font-size: 14px; font-weight: 500;">Reason</td>
                        <td style="padding-top: 12px; border-top: 1px solid #fee2e2; color: #111827; font-size: 14px; text-align: right;">${reason}</td>
                    </tr>
                </table>
            </div>

            <p style="margin: 0 0 32px 0;">Please log in to the admin panel to process this request (Suspend, Terminate, or Reach out to the client).</p>
            
            <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/services" style="background-color: #111827; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">Go to Admin Panel</a>
            </div>
        `
    }),

    notification: (subject: string, message: string) => ({
        subject,
        body: `
            <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 24px; font-weight: 700;">${subject}</h2>
            <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">${message}</p>
        `
    })
};

export default { sendEmail, EmailTemplates };
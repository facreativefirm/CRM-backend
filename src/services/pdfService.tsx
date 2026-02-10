import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

// Define styles for the PDF (Matching the frontend for consistency)
const styles = StyleSheet.create({
    page: {
        padding: 40,
        fontSize: 10,
        fontFamily: 'Helvetica',
        backgroundColor: '#ffffff',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 30,
        paddingBottom: 20,
        borderBottom: '1px solid #e5e7eb',
    },
    companyInfo: {
        flexDirection: 'column',
    },
    companyName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#0a66c2',
        marginBottom: 10,
    },
    companyDetails: {
        fontSize: 9,
        color: '#6b7280',
        lineHeight: 1.5,
    },
    invoiceTitle: {
        fontSize: 28,
        color: '#0a66c2',
        marginBottom: 5,
        textAlign: 'right',
        opacity: 0.8,
    },
    invoiceNumber: {
        fontSize: 12,
        marginBottom: 3,
        textAlign: 'right',
    },
    invoiceDate: {
        fontSize: 9,
        color: '#6b7280',
        textAlign: 'right',
    },
    clientSection: {
        marginBottom: 30,
    },
    sectionTitle: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
    },
    clientName: {
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 3,
    },
    clientDetails: {
        fontSize: 9,
        color: '#1a1a1a',
        lineHeight: 1.5,
    },
    table: {
        marginBottom: 30,
    },
    tableHeader: {
        flexDirection: 'row',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: 8,
        marginBottom: 8,
    },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: 8,
        borderBottom: '0.5px solid #f3f4f6',
    },
    tableColDescription: {
        width: '50%',
        fontSize: 9,
    },
    tableColQty: {
        width: '15%',
        fontSize: 9,
        textAlign: 'center',
    },
    tableColPrice: {
        width: '17.5%',
        fontSize: 9,
        textAlign: 'right',
    },
    tableColTotal: {
        width: '17.5%',
        fontSize: 9,
        textAlign: 'right',
        fontWeight: 'bold',
    },
    headerText: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#6b7280',
    },
    totalsSection: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 20,
    },
    totalsBox: {
        width: '40%',
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 5,
        fontSize: 9,
        color: '#6b7280',
    },
    grandTotalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        paddingTop: 12,
        borderTop: '1px solid #e5e7eb',
        fontSize: 12,
        fontWeight: 'bold',
    },
    grandTotalLabel: {
        color: '#1a1a1a',
    },
    grandTotalAmount: {
        color: '#0a66c2',
    },
    notesSection: {
        marginTop: 30,
        paddingTop: 20,
        borderTop: '1px solid #e5e7eb',
    },
    notesTitle: {
        fontSize: 10,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    notesText: {
        fontSize: 9,
        color: '#6b7280',
        lineHeight: 1.5,
    },
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 40,
        right: 40,
        textAlign: 'center',
        fontSize: 8,
        color: '#9ca3af',
    },
});

interface InvoiceDocumentProps {
    invoice: any;
    appName: string;
    taxName?: string;
    currencySymbol?: string;
}

const InvoiceDocument: React.FC<InvoiceDocumentProps> = ({ invoice, appName, taxName = 'Tax', currencySymbol = '$' }) => (
    <Document>
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <View style={styles.companyInfo}>
                    <Text style={styles.companyName}>{appName}</Text>
                    <View style={styles.companyDetails}>
                        <Text>123 Hosting Street</Text>
                        <Text>Dhaka, Bangladesh</Text>
                        <Text>support@whmcscrm.com</Text>
                    </View>
                </View>
                <View>
                    <Text style={styles.invoiceTitle}>
                        {invoice.status === 'PAID' ? 'MONEY RECEIPT' : (invoice.status === 'PARTIALLY_PAID' ? 'MONEY RECEIPT' : 'INVOICE')}
                    </Text>
                    <Text style={styles.invoiceNumber}>#{invoice.invoiceNumber || invoice.id}</Text>
                    <Text style={styles.invoiceDate}>
                        Date: {new Date(invoice.invoiceDate || invoice.createdAt).toLocaleDateString()}
                    </Text>
                    <Text style={styles.invoiceDate}>
                        Due: {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}
                    </Text>
                </View>
            </View>

            <View style={styles.clientSection}>
                <Text style={styles.sectionTitle}>BILL TO</Text>
                <Text style={styles.clientName}>
                    {invoice.client?.user?.firstName} {invoice.client?.user?.lastName}
                </Text>
                {invoice.client?.companyName && (
                    <Text style={styles.clientDetails}>{invoice.client.companyName}</Text>
                )}
                <View style={styles.clientDetails}>
                    <Text>{invoice.client?.user?.email}</Text>
                </View>
            </View>

            <View style={styles.table}>
                <View style={styles.tableHeader}>
                    <Text style={[styles.tableColDescription, styles.headerText]}>Description</Text>
                    <Text style={[styles.tableColQty, styles.headerText]}>Qty</Text>
                    <Text style={[styles.tableColPrice, styles.headerText]}>Unit Price</Text>
                    <Text style={[styles.tableColTotal, styles.headerText]}>Total</Text>
                </View>
                {invoice.items.map((item: any) => (
                    <View key={item.id} style={styles.tableRow}>
                        <Text style={styles.tableColDescription}>{item.description}</Text>
                        <Text style={styles.tableColQty}>{item.quantity}</Text>
                        <Text style={styles.tableColPrice}>{currencySymbol}{Number(item.unitPrice).toFixed(2)}</Text>
                        <Text style={styles.tableColTotal}>
                            {currencySymbol}{Number(item.total || (item.quantity * item.unitPrice)).toFixed(2)}
                        </Text>
                    </View>
                ))}
            </View>

            <View style={styles.totalsSection}>
                <View style={styles.totalsBox}>
                    <View style={styles.totalRow}>
                        <Text>Subtotal</Text>
                        <Text>{currencySymbol}{Number(invoice.subtotal).toFixed(2)}</Text>
                    </View>
                    <View style={styles.totalRow}>
                        <Text>{taxName}</Text>
                        <Text>{currencySymbol}{Number(invoice.taxAmount || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.grandTotalRow}>
                        <Text style={styles.grandTotalLabel}>Total</Text>
                        <Text style={styles.grandTotalAmount}>{currencySymbol}{Number(invoice.totalAmount).toFixed(2)}</Text>
                    </View>

                    {Number(invoice.amountPaid) > 0 && (
                        <>
                            <View style={[styles.totalRow, { color: '#059669', fontWeight: 'bold' }]}>
                                <Text>Total Paid</Text>
                                <Text>{currencySymbol}{Number(invoice.amountPaid).toFixed(2)}</Text>
                            </View>
                            <View style={[styles.totalRow, { marginTop: 5, borderTop: '0.5px solid #e5e7eb', paddingTop: 5 }]}>
                                <Text>Balance Due</Text>
                                <Text>{currencySymbol}{Math.max(0, Number(invoice.totalAmount) - Number(invoice.amountPaid)).toFixed(2)}</Text>
                            </View>
                        </>
                    )}
                </View>
            </View>

            {invoice.notes && (
                <View style={styles.notesSection}>
                    <Text style={styles.notesTitle}>Notes</Text>
                    <Text style={styles.notesText}>{invoice.notes}</Text>
                </View>
            )}

            <View style={styles.footer}>
                <Text>Thank you for your business.</Text>
                <Text>Generated by {appName}</Text>
            </View>
        </Page>
    </Document>
);

/**
 * Generate Invoice PDF Buffer
 */
export const generateInvoicePDF = async (invoice: any, appName: string = 'FA CRM', taxName: string = 'Tax', currencySymbol: string = '$'): Promise<Buffer> => {
    return await renderToBuffer(<InvoiceDocument invoice={invoice} appName={appName} taxName={taxName} currencySymbol={currencySymbol} />);
};

/**
 * Money Receipt Document Component
 */
const MoneyReceiptDocument = ({ transaction, invoice, appName, taxName, currencySymbol }: {
    transaction: any;
    invoice: any;
    appName: string;
    taxName: string;
    currencySymbol: string;
}) => (
    <Document>
        <Page size="A4" style={styles.page}>
            {/* Header Section */}
            <View style={styles.header}>
                <View style={styles.companyInfo}>
                    <Text style={styles.companyName}>{appName}</Text>
                    <View style={styles.companyDetails}>
                        <Text>Professional Hosting & Domain Services</Text>
                        <Text>support@{appName.toLowerCase().replace(/\s/g, '')}.com</Text>
                    </View>
                </View>
                <View>
                    <Text style={[styles.invoiceTitle, { color: '#059669' }]}>MONEY RECEIPT</Text>
                    <Text style={styles.invoiceNumber}>Receipt #{transaction.id}</Text>
                    <Text style={styles.invoiceDate}>
                        Date: {new Date(transaction.createdAt).toLocaleDateString()}
                    </Text>
                </View>
            </View>

            {/* Client Information */}
            <View style={styles.clientSection}>
                <Text style={styles.sectionTitle}>RECEIVED FROM</Text>
                <Text style={styles.clientName}>
                    {invoice.client?.user?.firstName} {invoice.client?.user?.lastName}
                </Text>
                {invoice.client?.companyName && (
                    <Text style={styles.clientDetails}>{invoice.client.companyName}</Text>
                )}
                <View style={styles.clientDetails}>
                    <Text>{invoice.client?.user?.email}</Text>
                </View>
            </View>

            {/* Payment Information Box */}
            <View style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #dcfce7',
                borderRadius: 8,
                padding: 16,
                marginBottom: 20
            }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 10, color: '#166534', fontWeight: 'bold' }}>Payment Amount:</Text>
                    <Text style={{ fontSize: 14, color: '#059669', fontWeight: 'bold' }}>
                        {currencySymbol}{Number(transaction.amount).toFixed(2)}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 9, color: '#6b7280' }}>Payment Method:</Text>
                    <Text style={{ fontSize: 9, color: '#111827', fontWeight: 'bold' }}>
                        {transaction.gateway || 'N/A'}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 9, color: '#6b7280' }}>Transaction ID:</Text>
                    <Text style={{ fontSize: 9, color: '#111827', fontWeight: 'bold' }}>
                        {transaction.transactionId || `TXN-${transaction.id}`}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 9, color: '#6b7280' }}>Related Invoice:</Text>
                    <Text style={{ fontSize: 9, color: '#0a66c2', fontWeight: 'bold' }}>
                        #{invoice.invoiceNumber}
                    </Text>
                </View>
            </View>

            {/* Invoice Items Breakdown */}
            <View style={{ marginBottom: 10 }}>
                <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>PAYMENT FOR</Text>
            </View>

            <View style={styles.table}>
                <View style={styles.tableHeader}>
                    <Text style={[styles.tableColDescription, styles.headerText]}>Description</Text>
                    <Text style={[styles.tableColQty, styles.headerText]}>Qty</Text>
                    <Text style={[styles.tableColPrice, styles.headerText]}>Unit Price</Text>
                    <Text style={[styles.tableColTotal, styles.headerText]}>Total</Text>
                </View>
                {invoice.items.map((item: any) => (
                    <View key={item.id} style={styles.tableRow}>
                        <Text style={styles.tableColDescription}>{item.description}</Text>
                        <Text style={styles.tableColQty}>{item.quantity}</Text>
                        <Text style={styles.tableColPrice}>{currencySymbol}{Number(item.unitPrice).toFixed(2)}</Text>
                        <Text style={styles.tableColTotal}>
                            {currencySymbol}{Number(item.total || (item.quantity * item.unitPrice)).toFixed(2)}
                        </Text>
                    </View>
                ))}
            </View>



            {/* Admin Notes (if any) */}
            {transaction.adminNotes && (
                <View style={styles.notesSection}>
                    <Text style={styles.notesTitle}>Payment Notes</Text>
                    <Text style={styles.notesText}>{transaction.adminNotes}</Text>
                </View>
            )}

            {/* Footer */}
            <View style={styles.footer}>
                <Text>This is a computer-generated receipt and requires no signature.</Text>
                <Text>Thank you for your payment.</Text>
                <Text>Generated by {appName}</Text>
            </View>
        </Page>
    </Document>
);

/**
 * Generate Money Receipt PDF Buffer
 */
export const generateMoneyReceiptPDF = async (
    transaction: any,
    invoice: any,
    appName: string = 'FA CRM',
    taxName: string = 'Tax',
    currencySymbol: string = '$'
): Promise<Buffer> => {
    return await renderToBuffer(
        <MoneyReceiptDocument
            transaction={transaction}
            invoice={invoice}
            appName={appName}
            taxName={taxName}
            currencySymbol={currencySymbol}
        />
    );
};

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
                    <Text style={styles.invoiceTitle}>INVOICE</Text>
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
export const generateInvoicePDF = async (invoice: any, appName: string = 'WHMCS CRM', taxName: string = 'Tax', currencySymbol: string = '$'): Promise<Buffer> => {
    return await renderToBuffer(<InvoiceDocument invoice={invoice} appName={appName} taxName={taxName} currencySymbol={currencySymbol} />);
};

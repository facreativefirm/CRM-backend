import '../src/config/env';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
    const methods = [
        {
            name: 'bKash Merchant',
            description: 'Automated Merchant Payment',
            type: 'auto_gateway',
            subtype: 'merchant',
            metadata: 'bkash_payment', // Link to internal logic ID
            displayOrder: 0,
            enabled: true
        },
        {
            name: 'Nagad Merchant',
            description: 'Automated Merchant Payment',
            type: 'auto_gateway',
            subtype: 'merchant',
            metadata: 'nagad_auto', // Link to internal logic ID
            displayOrder: 1,
            enabled: true
        },
        {
            name: 'bKash Personal',
            description: 'Send Money (Personal)',
            type: 'mobile_wallet',
            subtype: 'personal',
            accountNumber: '01781 881199',
            instructionsEn: '1. Go to your bKash Mobile Menu or App.\n2. Choose "Send Money".\n3. Enter: 01781 881199 (Personal Number).\n4. Amount: Total Amount + Cashout Charge.\n5. Reference: Your Invoice #\n6. Confirm with your PIN.',
            instructionsBn: '১. আপনার বিকাশ অ্যাপ বা ডায়াল মেনুতে যান।\n২. "Send Money" অপশনটি বেছে নিন।\n৩. নম্বর দিন: ০১৭৮১ ৮৮১১৯৯ (পার্সোনাল)।\n৪. পরিমাণ: মোট টাকা + ক্যাশআউট চার্জ।\n৫. রেফারেন্স: আপনার ইনভয়েস নম্বর ব্যবহার করুন।\n৬. আপনার পিন দিয়ে কনফার্ম করুন।',
            displayOrder: 2,
            enabled: true
        },
        {
            name: 'Nagad Personal',
            description: 'Send Money (Personal)',
            type: 'mobile_wallet',
            subtype: 'personal',
            accountNumber: '01781 881199',
            instructionsEn: '1. Open Nagad App or Dial *167#.\n2. Select "Send Money".\n3. Enter: 01781 881199 (Personal Number).\n4. Amount: Total Amount + Cashout Charge.\n5. Reference: Your Invoice #',
            instructionsBn: '১. নগদ অ্যাপ খুলুন বা *১৬৭# ডায়াল করুন।\n২. "Send Money" অপশনটি বেছে নিন।\n৩. নম্বর দিন: ০১৭৮১ ৮৮১১৯৯ (পার্সোনাল)।\n৪. পরিমাণ: মোট টাকা + ক্যাশআউট চার্জ।\n৫. রেফারেন্স: আপনার ইনভয়েস নম্বর ব্যবহার করুন।',
            displayOrder: 1,
            enabled: true
        },
        {
            name: 'Rocket Personal',
            description: 'Send Money (Personal)',
            type: 'mobile_wallet',
            subtype: 'personal',
            accountNumber: '01781 881199',
            instructionsEn: '1. Open Rocket App or Dial *322#.\n2. Select "Send Money".\n3. Enter: 01781 881199 (Personal Number).\n4. Amount: Total Amount + Cashout Charge.\n5. Reference: Your Invoice #',
            instructionsBn: '১. রকেট অ্যাপ খুলুন বা *৩২২# ডায়াল করুন।\n২. "Send Money" অপশনটি বেছে নিন।\n৩. রকেট নম্বর দিন: ০১৭৮১ ৮৮১১৯৯ (পার্সোনাল)।\n৪. পরিমাণ: মোট টাকা + ক্যাশআউট চার্জ।\n৫. রেফারেন্স: আপনার ইনভয়েস নম্বর ব্যবহার করুন।',
            displayOrder: 2,
            enabled: true
        },
        {
            name: 'BRAC BANK',
            description: 'Direct Deposit',
            type: 'bank',
            accountName: 'F. A. CREATIVE FIRM LIMITED',
            accountNumber: '2050400590002',
            branchName: 'Agrabad Branch, Chattogram',
            instructionsEn: 'Bank Name: BRAC BANK\nAccount Name: F. A. CREATIVE FIRM LIMITED\nAccount Number: 2050400590002\nBranch: Agrabad Branch, Chattogram\nRef: Your Invoice #',
            instructionsBn: 'ব্যাংকের নাম: ব্র্যাক ব্যাংক\nঅ্যাকাউন্টের নাম: F. A. CREATIVE FIRM LIMITED\nঅ্যাকাউন্ট নম্বর: ২০৫০৪০০৫৯০০০২\nশাখা: আগ্রাবাদ শাখা, চট্টগ্রাম\nরেফারেন্স: আপনার ইনভয়েস নম্বর ব্যবহার করুন',
            displayOrder: 3,
            enabled: true
        },
        {
            name: 'CITY BANK PLC',
            description: 'Direct Deposit',
            type: 'bank',
            accountName: 'F. A. CREATIVE FIRM LIMITED',
            accountNumber: '1224295297001',
            branchName: 'Anderkilla Branch, Chattogram',
            instructionsEn: 'Bank Name: CITY BANK PLC\nAccount Name: F. A. CREATIVE FIRM LIMITED\nAccount Number: 1224295297001\nBranch: Anderkilla Branch, Chattogram\nRef: Your Invoice #',
            instructionsBn: 'ব্যাংকের নাম: সিটি ব্যাংক পিএলসি\nঅ্যাকাউন্টের নাম: F. A. CREATIVE FIRM LIMITED\nঅ্যাকাউন্ট নম্বর: ১২২৪২৯৫২৯৭০০১\nশাখা: আন্দরকিল্লা শাখা, চট্টগ্রাম\nরেফারেন্স: আপনার ইনভয়েস নম্বর ব্যবহার করুন',
            displayOrder: 4,
            enabled: true
        },
        {
            name: 'UCB',
            description: 'Direct Deposit',
            type: 'bank',
            accountName: 'F. A. CREATIVE FIRM LIMITED',
            accountNumber: '0522112000002158',
            branchName: 'Anderkilla Branch, Chattogram',
            instructionsEn: 'Bank Name: UCB\nAccount Name: F. A. CREATIVE FIRM LIMITED\nAccount Number: 0522112000002158\nBranch: Anderkilla Branch, Chattogram\nRef: Your Invoice #',
            instructionsBn: 'ব্যাংকের নাম: ইউসিবি\nঅ্যাকাউন্টের নাম: F. A. CREATIVE FIRM LIMITED\nঅ্যাকাউন্ট নম্বর: ০৫২২১১২০০০০০০২১৫৮\nশাখা: আন্দরকিল্লা শাখা, চট্টগ্রাম\nরেফারেন্স: আপনার ইনভয়েস নম্বর ব্যবহার করুন',
            displayOrder: 5,
            enabled: true
        },
        {
            name: 'PUBALI BANK PLC',
            description: 'Direct Deposit',
            type: 'bank',
            accountName: 'F. A. CREATIVE FIRM LIMITED',
            accountNumber: '1502901041810',
            branchName: 'Anderkilla Branch, Chattogram',
            instructionsEn: 'Bank Name: PUBALI BANK PLC\nAccount Name: F. A. CREATIVE FIRM LIMITED\nAccount Number: 1502901041810\nBranch: Anderkilla Branch, Chattogram\nRef: Your Invoice #',
            instructionsBn: 'ব্যাংকের নাম: পূবালী ব্যাংক পিএলসি\nঅ্যাকাউন্টের নাম: F. A. CREATIVE FIRM LIMITED\nঅ্যাকাউন্ট নম্বর: ১৫০২৯০১০৪১৮১০\nশাখা: আন্দরকিল্লা শাখা, চট্টগ্রাম\nরেফারেন্স: আপনার ইনভয়েস নম্বর ব্যবহার করুন',
            displayOrder: 6,
            enabled: true
        }
    ];

    console.log('Seeding manual payment methods...');

    for (const method of methods) {
        await prisma.manualPaymentMethod.upsert({
            where: { id: methods.indexOf(method) + 1 }, // Just for initial seed
            update: method,
            create: method,
        });
    }

    console.log('Seeding completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

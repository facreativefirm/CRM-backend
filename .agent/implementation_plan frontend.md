# Comprehensive Frontend Implementation Plan: WHMCS CRM

This master plan outlines the full construction of the frontend for the WHMCS-like CRM, covering the Admin, Reseller, and Client portals. The goal is to create a premium, high-performance interface with 100% feature coverage and visual excellence.

## 🎨 Design Philosophy & UX
- **Theme**: Sleek Dark Mode (default) with deep midnight blues, glassmorphism, and neon accent colors (Primary: Electric Blue/Indigo).
- **Interactions**: Framer Motion for micro-interactions, page transitions, and smooth sidebar toggles.
- **Consistency**: Centralized design system using tailored Shadcn UI components and Lucide icons.
- **Responsiveness**: Mobile-first design for Client and Reseller portals; heavily optimized desktop view for Admin "Command Center".

---

## 🏗️ Phase 1: Core Architecture & Layouts
Standardizing the foundation across all portals.

### 1.1 Shared Layout System
- **[MODIFY] Sidebar.tsx**: Already basic, needs further refinement for dynamic role-based rendering and mobile responsiveness.
- **[NEW] PortalLayout.tsx**: A higher-order component to handle state between Navbar and Sidebar.
- **[NEW] DesignSystem**: Establish a `tailwind.config.ts` with custom brand colors (Success: Emerald-400, Warn: Amber-400, Danger: Rose-500).

---

## 🛡️ Phase 2: Admin Portal (The Command Center)
Full management capabilities for staff and admins.

### 2.1 Dashboard Overhaul
- **Features**: Live revenue charts (Recharts), "At a glance" stats cards, Recent Activity feed, and System Status monitoring.
- **Target**: `app/admin/page.tsx`

### 2.2 Client & Order Management
- **Clients**: Comprehensive profile views including Billing history, active services, and security logs.
- **Orders**: A multi-step checkout review process for admins, fraud flag UI, and manual provisioning triggers.

### 2.3 Comprehensive Billing Tab
- **Invoices**: Search/Filter by status, batch PDF download, and manual payment marking.
- **Transactions**: Gateway specific logging with refund triggers.
- **Quotes & Items**: Proposal creation tool and individual billable item tracking.

### 2.4 Product & Service Control
- **Inventory**: Configurable options for products (Memory, CPU, Disk sliders).
- **Service Management**: Provisioning controls (Start, Stop, Reinstall) integrated with server APIs.

### 2.5 Security & Utilities
- **Manager**: UI for the IP Ban system, Security Question builder, and Staff Permission matrix.
- **Tools**: Integrated WHOIS, DNS Resolver, and TLD Sync (already implemented, needs polish).

---

## 🤝 Phase 3: Reseller Portal (B2B Interface)
Empowering resellers to run their own "sub-businesses".

### 3.1 Reseller Portfolio
- **My Clients**: A filtered view of the `Clients` module exclusive to the reseller's referrals.
- **Commissions**: Payout history, balance tracking, and one-click payout requests.

### 3.2 White-Label Customization
- **Branding**: UI to upload logos, set custom primary colors, and configure custom CNAME domains for their own store.
- **Target**: `app/reseller/settings/page.tsx`

---

## 🛒 Phase 4: Client Portal (The Storefront & Member Area)
High-converting purchasing flow and intuitive management.

### 4.1 "WHMCS Style" Shopping Cart
- **Product Tiles**: Dynamic pricing based on billing cycle (Monthly vs. Annual discounts).
- **Checkout Flow**: Real-time tax calculation, coupon code validation, and integrated bKash/Nagad/Stripe modals.

### 4.2 Member Area
- **My Services**: Simplified management (Reset Password, Webmail login, Upgrade/Downgrade).
- **Billing History**: "Pay All" feature for multiple unpaid invoices and credit balance top-ups.

### 4.3 Support Hub
- **Tickets**: Visual thread for replies, attachment previews, and priority badges.

---

## 🧪 Phase 5: Verification & Polish
- **Performance**: Lighthouse score optimization (Target 90+).
- **Testing**: Playwright scripts for the checkout flow and critical Admin actions (IP banning).
- **Final Polish**: Adding custom scrollbars, loading skeletons for every data-heavy table, and empty state illustrations.

---

## 📝 Next Steps Priorities
1.  **Refine Admin Dashboard** with real-time analytics.
2.  **Complete the Shopping Cart** and Checkout flow for Clients.
3.  **Implement White-Label Settings** for Resellers.

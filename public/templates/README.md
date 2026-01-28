# Excel Import Templates

This directory contains CSV templates for importing data into the Banxway CRM system.

## Available Templates

### 1. Customers Template (`customers-template.csv`)

Import existing customers into the system.

**Required Fields:**
- Legal Name*

**Optional Fields:**
- Trading Name
- Email
- Phone
- GST Number
- PAN Number
- IEC Number
- Industry
- Customer Tier (TIER1, TIER2, TIER3, NEW)
- Status (LEAD, QUALIFIED, ACTIVE, INACTIVE, CHURNED)
- Credit Terms (ADVANCE, NET_15, NET_30, NET_45, NET_60)
- Notes

**Example:**
```
Legal Name,Trading Name,Email,Phone,GST Number,PAN Number,Status,Tier
Acme Corporation,Acme Inc,contact@acme.com,+91-9876543210,29AABCT1332L1ZV,AABCT1332L,ACTIVE,TIER1
```

### 2. Contacts Template (`contacts-template.csv`)

Import contacts for existing customers.

**Required Fields:**
- Customer Code* (or Customer Name)
- Full Name*
- Email*

**Optional Fields:**
- Phone
- Mobile
- WhatsApp
- Designation
- Department
- Is Primary (Yes/No)
- Is Decision Maker (Yes/No)
- Preferred Channel (EMAIL, PHONE, SMS, WHATSAPP)
- Notes

**Important:**
- Customer Code must match an existing customer in the system
- If Customer Code is not provided, you can use Customer Name (exact match required)

**Example:**
```
Customer Code,Full Name,Email,Phone,Designation,Is Primary
CUST001,John Smith,john@acme.com,+91-9876543210,CEO,Yes
```

### 3. Leads Template (`leads-template.csv`)

Import potential customers (leads).

**Required Fields:**
- Company Name*

**Optional Fields:**
- Email
- Phone
- Industry
- Lead Source (WEBSITE, REFERRAL, COLD_CALL, TRADE_SHOW, LINKEDIN, OTHER, IMPORT)
- Notes

**Example:**
```
Company Name,Email,Phone,Industry,Lead Source,Notes
Future Logistics,info@future.com,+91-9876543220,Logistics,WEBSITE,Interested in services
```

## How to Use

### Option 1: Use CSV Templates Directly

1. Download the CSV template for your data type
2. Open in Excel or Google Sheets
3. Fill in your data (keep the header row)
4. Save as CSV
5. Upload via the Banxway platform: `/crm/import`

### Option 2: Convert to Excel (.xlsx)

1. Download the CSV template
2. Open in Microsoft Excel
3. Fill in your data
4. Save As > Excel Workbook (.xlsx)
5. Upload via the Banxway platform: `/crm/import`

## Validation Rules

### Customers
- Legal Name is required and must be unique
- Email must be valid format (if provided)
- GST Number must be valid Indian GST format (if provided)
- Status must be one of: LEAD, QUALIFIED, ACTIVE, INACTIVE, CHURNED
- Tier must be one of: TIER1, TIER2, TIER3, NEW

### Contacts
- Full Name is required
- Email is required and must be valid format
- Customer must exist in the system (either by code or exact name match)
- Is Primary: Yes/No (case insensitive)
- Is Decision Maker: Yes/No (case insensitive)
- Preferred Channel must be one of: EMAIL, PHONE, SMS, WHATSAPP

### Leads
- Company Name is required
- Email must be valid format (if provided)
- Lead Source must be one of: WEBSITE, REFERRAL, COLD_CALL, TRADE_SHOW, LINKEDIN, OTHER, IMPORT
- Leads are automatically created with status=LEAD and tier=NEW

## Error Handling

If import fails for some rows:
- You'll see row-level error messages
- Successfully imported rows are saved
- Failed rows are reported with specific error messages
- Fix errors and re-upload failed rows

## Common Errors

### Customers
- "Legal Name is required" - Missing company name
- "Customer with email 'xxx' already exists" - Duplicate email
- "Invalid email format" - Email not in valid format

### Contacts
- "Contact name is required" - Missing full name
- "Customer not found" - Customer Code or Name doesn't exist
- "Invalid email format" - Email not in valid format

### Leads
- "Company Name is required" - Missing company name
- "Invalid Lead Source" - Must use one of the predefined sources

## Field Mappings

### Customer Tier Values
- `TIER1` - Top tier customers
- `TIER2` - Mid tier customers
- `TIER3` - Standard customers
- `NEW` - New customers (default)

### Customer Status Values
- `LEAD` - Potential customer (default for leads)
- `QUALIFIED` - Qualified lead
- `ACTIVE` - Active customer
- `INACTIVE` - Inactive customer
- `CHURNED` - Lost customer

### Credit Terms Values
- `ADVANCE` - Payment in advance (default)
- `NET_15` - Net 15 days
- `NET_30` - Net 30 days
- `NET_45` - Net 45 days
- `NET_60` - Net 60 days

### Lead Source Values
- `WEBSITE` - Website inquiry
- `REFERRAL` - Customer referral
- `COLD_CALL` - Cold outreach
- `TRADE_SHOW` - Trade show/exhibition
- `LINKEDIN` - LinkedIn outreach
- `OTHER` - Other sources
- `IMPORT` - Bulk import (default)

## Support

For issues with templates or import:
1. Check validation rules above
2. Review error messages in import results
3. Contact support: support@banxway.com

---

**Last Updated:** 2026-01-27
**Version:** 1.0

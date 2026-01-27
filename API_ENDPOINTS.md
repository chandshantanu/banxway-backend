# Freight Forwarding API Endpoints

**Base URL**: `http://localhost:8000/api/v1` (Development)
**Production**: `https://banxway-api.ambitiousglacier-6604109c.centralindia.azurecontainerapps.io/api/v1`

**Authentication**: All endpoints require Bearer token in `Authorization` header

---

## 📋 Quotations API

**Base Path**: `/api/v1/quotations`

### List Quotations
```http
GET /api/v1/quotations
```

**Query Parameters:**
- `status` - Filter by status (comma-separated): `DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CONVERTED`
- `customer_id` - Filter by customer UUID
- `shipment_type` - Filter by shipment type
- `created_by` - Filter by creator user ID
- `dateFrom` - Filter by creation date (ISO 8601)
- `dateTo` - Filter by creation date (ISO 8601)
- `search` - Search in quote number, customer name, email
- `expired` - Filter expired quotes (`true`/`false`)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `sortBy` - Sort field (default: `created_at`)
- `sortOrder` - Sort order: `asc` or `desc` (default: `desc`)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "quote_number": "QT-20260126-001",
      "customer_name": "ABC Corp",
      "customer_email": "contact@abc.com",
      "shipment_type": "AIR_IMPORT",
      "total_cost": 5000,
      "currency": "USD",
      "status": "SENT",
      "valid_from": "2026-01-26",
      "valid_until": "2026-02-26",
      "created_at": "2026-01-26T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

### Get Expiring Quotations
```http
GET /api/v1/quotations/expiring?days=7
```

**Query Parameters:**
- `days` - Number of days to look ahead (default: 7)

**Response:**
```json
{
  "success": true,
  "data": [...],
  "count": 12
}
```

### Get Quotation by ID
```http
GET /api/v1/quotations/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "quote_number": "QT-20260126-001",
    "customer_name": "ABC Corp",
    "total_cost": 5000,
    "status": "SENT",
    ...
  }
}
```

### Create Quotation
```http
POST /api/v1/quotations
```

**Request Body:**
```json
{
  "customer_id": "uuid",
  "customer_name": "ABC Corp",
  "customer_email": "contact@abc.com",
  "customer_phone": "+91-9876543210",
  "shipment_type": "AIR_IMPORT",
  "origin_location": "Mumbai, India",
  "destination_location": "New York, USA",
  "cargo_description": "Electronics",
  "cargo_weight_kg": 500,
  "cargo_volume_cbm": 2.5,
  "total_cost": 5000,
  "currency": "USD",
  "cost_breakdown": {
    "air_freight": 3500,
    "customs": 800,
    "delivery": 700
  },
  "valid_from": "2026-01-26",
  "valid_until": "2026-02-26",
  "notes": "Urgent shipment"
}
```

**Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Quotation created successfully"
}
```

**Status**: `201 Created`

### Update Quotation
```http
PATCH /api/v1/quotations/:id
```

**Request Body:**
```json
{
  "total_cost": 5500,
  "notes": "Updated pricing"
}
```

### Update Quotation Status
```http
PATCH /api/v1/quotations/:id/status
```

**Request Body:**
```json
{
  "status": "SENT"
}
```

**Valid Transitions:**
- `DRAFT` → `SENT`, `DRAFT`
- `SENT` → `ACCEPTED`, `REJECTED`, `EXPIRED`, `SENT`
- `ACCEPTED` → `CONVERTED`
- `REJECTED` → (terminal state)
- `EXPIRED` → (terminal state)
- `CONVERTED` → (terminal state)

### Send Quotation to Customer
```http
POST /api/v1/quotations/:id/send
```

Automatically updates status to `SENT` and triggers notification workflow.

### Accept Quotation
```http
POST /api/v1/quotations/:id/accept
```

Updates status to `ACCEPTED`. Ready to convert to shipment.

### Delete Quotation
```http
DELETE /api/v1/quotations/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Quotation deleted successfully"
}
```

---

## 🚢 Shipments API

**Base Path**: `/api/v1/shipments`

### Enhanced Endpoints (New)

#### Get Shipment Stage History
```http
GET /api/v1/shipments/:id/history
```

Returns complete stage transition history with timestamps and durations.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "shipment_id": "uuid",
      "from_stage": "BOOKING",
      "to_stage": "DOCUMENTATION",
      "duration_in_stage_hours": 48.5,
      "changed_by": "user-uuid",
      "changed_at": "2026-01-26T10:00:00Z"
    }
  ],
  "count": 5
}
```

#### Update Shipment Stage
```http
PATCH /api/v1/shipments/:id/stage
```

**Request Body:**
```json
{
  "stage": "CUSTOMS_CLEARANCE"
}
```

Automatically creates stage history entry via database trigger.

**Available Stages (in order):**
1. `QUOTE_REQUEST`
2. `QUOTATION`
3. `BOOKING`
4. `DOCUMENTATION`
5. `CUSTOMS_CLEARANCE`
6. `CARGO_COLLECTION`
7. `IN_TRANSIT`
8. `PORT_ARRIVAL`
9. `CUSTOMS_DELIVERY`
10. `FINAL_DELIVERY`
11. `POD_COLLECTION`
12. `BILLING`
13. `CLOSURE`

#### Get Shipments by Stage
```http
GET /api/v1/shipments/stage/:stage
```

**Example:**
```http
GET /api/v1/shipments/stage/CUSTOMS_CLEARANCE
```

Returns all shipments currently in that stage.

#### Get Stage Analytics
```http
GET /api/v1/shipments/analytics/stages
```

Returns average time spent in each stage across all shipments.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "stage": "DOCUMENTATION",
      "avg_hours": 36.25,
      "shipment_count": 142
    },
    {
      "stage": "CUSTOMS_CLEARANCE",
      "avg_hours": 72.80,
      "shipment_count": 138
    }
  ]
}
```

### Existing Endpoints

- `GET /api/v1/shipments` - List all shipments
- `GET /api/v1/shipments/:id` - Get shipment by ID
- `POST /api/v1/shipments` - Create shipment
- `PATCH /api/v1/shipments/:id` - Update shipment
- `DELETE /api/v1/shipments/:id` - Delete shipment
- `POST /api/v1/shipments/:id/approve` - Approve shipment
- `POST /api/v1/shipments/:id/status` - Update status
- `GET /api/v1/shipments/stats/summary` - Get statistics

---

## 👥 CRM API

**Base Path**: `/api/v1/crm/customers`

### List Customers
```http
GET /api/v1/crm/customers
```

**Query Parameters:**
- `status` - Filter by status (comma-separated): `LEAD`, `QUALIFIED`, `ACTIVE`, `INACTIVE`, `CHURNED`, `BLACKLISTED`
- `kyc_status` - Filter by KYC status: `PENDING`, `IN_PROGRESS`, `VERIFIED`, `REJECTED`, `EXPIRED`
- `customer_tier` - Filter by tier: `PREMIUM`, `STANDARD`, `BASIC`, `NEW`
- `account_manager` - Filter by account manager user ID
- `lead_source` - Filter by lead source
- `tags` - Filter by tags (comma-separated)
- `search` - Search in customer code, legal name, email, GST number
- `page`, `limit`, `sortBy`, `sortOrder` - Pagination parameters

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "customer_code": "CUST-2026-0001",
      "legal_name": "ABC Trading Pvt Ltd",
      "primary_email": "info@abctrading.com",
      "gst_number": "27AABCU9603R1ZM",
      "pan_number": "AABCU9603R",
      "iec_number": "0512345678",
      "status": "ACTIVE",
      "kyc_status": "VERIFIED",
      "customer_tier": "PREMIUM",
      "credit_terms": "NET_30",
      "created_at": "2026-01-15T10:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

### Get Pending KYC Customers
```http
GET /api/v1/crm/customers/pending-kyc
```

Returns all customers with `kyc_status = PENDING`.

### Get Customer by ID
```http
GET /api/v1/crm/customers/:id
```

### Create Customer
```http
POST /api/v1/crm/customers
```

**Request Body:**
```json
{
  "legal_name": "XYZ Exports Ltd",
  "trading_name": "XYZ Trade",
  "company_type": "PVT_LTD",
  "primary_email": "contact@xyz.com",
  "primary_phone": "+91-9876543210",
  "billing_address": {
    "street": "123 Main St",
    "city": "Mumbai",
    "state": "Maharashtra",
    "country": "India",
    "postal_code": "400001"
  },
  "gst_number": "27AABCU9603R1ZM",
  "pan_number": "AABCU9603R",
  "iec_number": "0512345678",
  "industry": "Electronics",
  "customer_tier": "STANDARD",
  "credit_terms": "NET_30",
  "lead_source": "WEBSITE",
  "tags": ["electronics", "regular-shipper"]
}
```

**Validation:**
- Legal name is required
- Email format validation
- GST number format: 15 characters (e.g., 27AABCU9603R1ZM)
- PAN number format: 10 characters (e.g., AABCU9603R)
- Duplicate checking on email and GST number

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "customer_code": "CUST-2026-0042",
    ...
  },
  "message": "Customer created successfully"
}
```

**Status**: `201 Created`

**Error Responses:**
- `400` - Validation error
- `409` - Duplicate customer (email or GST already exists)

### Update Customer
```http
PATCH /api/v1/crm/customers/:id
```

**Request Body:**
```json
{
  "customer_tier": "PREMIUM",
  "credit_limit_usd": 50000,
  "account_manager": "user-uuid"
}
```

Duplicate checking applies if updating email or GST number.

### Convert Lead to Customer
```http
POST /api/v1/crm/customers/:id/convert
```

Converts status from `LEAD` or `QUALIFIED` to `ACTIVE`.

**Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Lead converted to customer successfully"
}
```

### Delete Customer
```http
DELETE /api/v1/crm/customers/:id
```

### Get Customer Contacts
```http
GET /api/v1/crm/customers/:id/contacts
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "customer_id": "uuid",
      "full_name": "John Doe",
      "designation": "Purchase Manager",
      "email": "john@abc.com",
      "phone": "+91-9876543210",
      "is_primary": true,
      "is_decision_maker": true,
      "can_sign_documents": true
    }
  ],
  "count": 3
}
```

### Create Customer Contact
```http
POST /api/v1/crm/customers/:id/contacts
```

**Request Body:**
```json
{
  "full_name": "Jane Smith",
  "designation": "Logistics Manager",
  "department": "Operations",
  "email": "jane@abc.com",
  "phone": "+91-9876543211",
  "mobile": "+91-9876543212",
  "whatsapp": "+91-9876543212",
  "is_primary": false,
  "is_decision_maker": true,
  "can_sign_documents": false
}
```

**Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Contact created successfully"
}
```

**Status**: `201 Created`

---

## 🔐 Authentication

All endpoints require authentication via Bearer token:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Get token by logging in via Supabase Auth.

---

## 📊 Common Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message here"
}
```

### HTTP Status Codes
- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Duplicate resource
- `500 Internal Server Error` - Server error

---

## 🧪 Testing Endpoints

### Using cURL

**Create Quotation:**
```bash
curl -X POST http://localhost:8000/api/v1/quotations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "uuid-here",
    "customer_name": "Test Company",
    "shipment_type": "AIR_IMPORT",
    "total_cost": 5000,
    "currency": "USD",
    "valid_from": "2026-01-26",
    "valid_until": "2026-02-26"
  }'
```

**List Quotations:**
```bash
curl http://localhost:8000/api/v1/quotations?status=SENT \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Create CRM Customer:**
```bash
curl -X POST http://localhost:8000/api/v1/crm/customers \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "legal_name": "ABC Exports Ltd",
    "primary_email": "contact@abc.com",
    "gst_number": "27AABCU9603R1ZM",
    "customer_tier": "STANDARD"
  }'
```

**Update Shipment Stage:**
```bash
curl -X PATCH http://localhost:8000/api/v1/shipments/UUID/stage \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stage": "CUSTOMS_CLEARANCE"}'
```

### Using Postman

1. Import collection from: `banxway-backend/postman/Freight-Forwarding-API.json` (to be created)
2. Set environment variable `BASE_URL` = `http://localhost:8000/api/v1`
3. Set `AUTH_TOKEN` in collection variables
4. Run requests

---

## 📝 Next Steps

1. **Run Database Migrations** - Create all tables
2. **Test Endpoints Locally** - Verify all endpoints work
3. **Frontend Integration** - Create API clients in frontend
4. **Documentation** - Generate Swagger/OpenAPI docs
5. **Production Deployment** - Deploy to Azure Container Apps

---

**Last Updated**: 2026-01-26
**API Version**: 1.0.0
**Total Endpoints**: 30+ endpoints across quotations, shipments, and CRM


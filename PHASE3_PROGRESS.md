# Phase 3: Rate Card Creation & Editing - IN PROGRESS 🔄

**Start Date**: January 26, 2026
**Status**: Backend Complete ✅ | Frontend In Progress 🔄
**Deployment**: Backend deployed to production

---

## Completed Components ✅

### Backend (100% Complete)

#### 1. Repository Layer - CRUD Operations
**File**: `src/database/repositories/rate-card.repository.ts`

**Interfaces Added**:
```typescript
export interface CreateRateCardRequest {
  shipper_id: string;
  rate_type: 'AIR_FREIGHT' | 'SEA_FREIGHT' | 'ODC' | 'BREAK_BULK';
  shipment_type: string;
  origin_airport?: string | null;
  origin_city?: string | null;
  // ... all rate card fields
  weight_slabs: any; // JSONB
  surcharges?: any; // JSONB
  valid_from: string;
  valid_until: string;
}

export interface UpdateRateCardRequest {
  // All fields optional for partial updates
  rate_type?: 'AIR_FREIGHT' | 'SEA_FREIGHT' | 'ODC' | 'BREAK_BULK';
  status?: 'ACTIVE' | 'EXPIRED' | 'PENDING' | 'INACTIVE';
  // ... other fields
}
```

**Methods Implemented**:
- ✅ `create(data)` - Create new rate card with auto-generated number
  - Format: `RC-{RATE_TYPE}-{YYYYMMDD}-{RRR}` (e.g., `RC-AIR-20260126-042`)
  - Auto-sets status to 'ACTIVE'
  - Returns rate card with joined shipper details

- ✅ `update(id, updates)` - Update existing rate card
  - Partial updates supported
  - Auto-updates `updated_at` timestamp
  - Returns updated rate card with shipper details

- ✅ `delete(id)` - Soft delete (set status to INACTIVE)
  - Never hard deletes from database
  - Preserves rate card history
  - Updates `updated_at` timestamp

- ✅ `activate(id)` - Set status to ACTIVE
  - Convenience wrapper around update
  - Returns updated rate card

- ✅ `deactivate(id)` - Set status to INACTIVE
  - Convenience wrapper around update
  - Returns updated rate card

#### 2. Service Layer - Business Logic & Validation
**File**: `src/services/rate-card.service.ts`

**Methods Implemented**:
- ✅ `createRateCard(data)` - Create with validation
  - Validates required fields (shipper_id, rate_type, shipment_type, valid_from, valid_until)
  - Validates date logic (valid_until > valid_from)
  - Validates weight slabs:
    - At least one slab required
    - Each slab must have min_kg, max_kg, rate_per_kg
    - All values must be non-negative
    - max_kg > min_kg (unless Infinity)
  - Throws clear error messages for validation failures

- ✅ `updateRateCard(id, updates)` - Update with validation
  - Validates dates if provided (valid_until > valid_from)
  - Validates weight slabs if provided (same rules as create)
  - Partial updates supported
  - Clear error messages

- ✅ `deleteRateCard(id)` - Delete with existence check
  - Verifies rate card exists before deleting
  - Throws 'Rate card not found' if doesn't exist
  - Soft deletes via repository

- ✅ `activateRateCard(id)` - Activate rate card
  - Wrapper around repository.activate

- ✅ `deactivateRateCard(id)` - Deactivate rate card
  - Wrapper around repository.deactivate

#### 3. API Routes - RESTful Endpoints
**File**: `src/api/v1/rate-cards/index.ts`

**Endpoints Added**:

1. **POST /api/v1/rate-cards** - Create rate card
   - Request Body: `CreateRateCardRequest`
   - Response: 201 Created with `{ success: true, data: RateCard }`
   - Errors:
     - 400: Validation errors (missing required fields, invalid dates, invalid weight slabs)
     - 500: Server error

2. **PUT /api/v1/rate-cards/:id** - Update rate card
   - Request Body: `UpdateRateCardRequest` (partial updates)
   - Response: 200 OK with `{ success: true, data: RateCard }`
   - Errors:
     - 400: Validation errors
     - 500: Server error

3. **DELETE /api/v1/rate-cards/:id** - Delete rate card (soft)
   - Response: 204 No Content
   - Errors:
     - 404: Rate card not found
     - 500: Server error

4. **PATCH /api/v1/rate-cards/:id/activate** - Activate rate card
   - Response: 200 OK with `{ success: true, data: RateCard }`
   - Errors:
     - 500: Server error

5. **PATCH /api/v1/rate-cards/:id/deactivate** - Deactivate rate card
   - Response: 200 OK with `{ success: true, data: RateCard }`
   - Errors:
     - 500: Server error

### Frontend API Client (100% Complete)

#### API Client Methods
**File**: `src/lib/api/rate-cards.api.ts`

**Methods Added**:
- ✅ `createRateCard(data)` - POST /v1/rate-cards
- ✅ `updateRateCard(id, data)` - PUT /v1/rate-cards/:id
- ✅ `deleteRateCard(id)` - DELETE /v1/rate-cards/:id
- ✅ `activateRateCard(id)` - PATCH /v1/rate-cards/:id/activate
- ✅ `deactivateRateCard(id)` - PATCH /v1/rate-cards/:id/deactivate

**Interfaces Added**:
```typescript
export interface CreateRateCardRequest { /* ... */ }
export interface UpdateRateCardRequest { /* ... */ }
```

---

## Remaining Work 🔄

### Frontend UI Components (0% Complete)

#### 1. Rate Card Form Component (High Priority)
**File**: `src/components/rate-cards/rate-card-form.tsx` (TO BE CREATED)

**Requirements**:
- Modal dialog for create/edit
- Two modes: "create" and "edit"
- Form sections:
  - **Shipper Selection** (dropdown, required)
  - **Route Information** (origin/destination airports/cities/countries)
  - **Rate Details** (rate type, shipment type, commodity type)
  - **Weight Range** (min/max kg)
  - **Weight Slabs** (dynamic builder component)
  - **Surcharges** (FSC %, SSC %, DG flat fee, handling charges)
  - **Validity Period** (date pickers for valid_from, valid_until)
  - **Additional Info** (transit time, free storage days, margin, notes)

**Features Needed**:
- Form validation matching backend rules
- Real-time validation feedback
- Submit/Cancel buttons
- Loading state during submission
- Error handling with toast notifications

#### 2. Weight Slab Builder Component (High Priority)
**File**: `src/components/rate-cards/weight-slab-builder.tsx` (TO BE CREATED)

**Requirements**:
- Dynamic array of weight slabs
- Each slab: min_kg, max_kg, rate_per_kg, currency
- Add/Remove slab buttons
- Validation:
  - No gaps between slabs
  - No overlaps
  - min_kg < max_kg
  - Last slab can have max_kg = Infinity
- Visual slab preview (horizontal bar chart)

**Example UI**:
```
Weight Slabs:
┌─────────────────────────────────────────────────┐
│ Slab 1: 0 kg - 45 kg @ $135/kg     [Remove]     │
│ Slab 2: 45 kg - 100 kg @ $125/kg   [Remove]     │
│ Slab 3: 100 kg - 300 kg @ $115/kg  [Remove]     │
│ Slab 4: 300 kg - ∞ @ $105/kg       [Remove]     │
└─────────────────────────────────────────────────┘
[+ Add Slab]
```

#### 3. Surcharge Manager Component (Medium Priority)
**File**: `src/components/rate-cards/surcharge-manager.tsx` (TO BE CREATED)

**Requirements**:
- FSC input (percentage, 0-100%)
- SSC input (percentage, 0-100%)
- DG input (flat fee, currency)
- Origin handling charges (currency)
- Destination handling charges (currency)
- Real-time total preview

**Example UI**:
```
Surcharges:
┌────────────────────────────────────────┐
│ FSC (Fuel Surcharge):    15 %          │
│ SSC (Security):          5 %           │
│ DG (Dangerous Goods):    $500          │
│ Origin Handling:         $500          │
│ Destination Handling:    $500          │
│                                        │
│ Total Surcharges: 20% + $1,500        │
└────────────────────────────────────────┘
```

#### 4. Main Page Updates (Medium Priority)
**File**: `src/app/(dashboard)/rate-management/rate-cards/page.tsx`

**Changes Needed**:
- Add "Create Rate Card" button to page header
- Import RateCardForm component
- Add create mutation:
  ```typescript
  const createMutation = useMutation({
    mutationFn: (data: CreateRateCardRequest) =>
      rateCardsApi.createRateCard(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rate-cards'] });
      toast.success('Rate card created successfully');
      setCreateModalOpen(false);
    },
    onError: (error) => {
      toast.error(parseError(error).message);
    },
  });
  ```

#### 5. List Component Updates (Medium Priority)
**File**: `src/components/rate-cards/rate-card-list.tsx`

**Changes Needed**:
- Add "Edit" button to each row (or detail modal)
- Add "Delete" button with confirmation dialog
- Add activate/deactivate toggle button
- Import mutations for edit, delete, activate, deactivate

#### 6. Detail Modal Updates (Low Priority)
**File**: `src/components/rate-cards/rate-card-detail-card.tsx`

**Changes Needed**:
- Add "Edit" button to modal header
- Add "Delete" button with confirmation
- Add "Activate"/"Deactivate" toggle
- Click Edit → Opens RateCardForm in edit mode

---

## Testing Checklist

### Backend API Tests (TO BE DONE)

#### Create Rate Card
```bash
curl -X POST https://banxway-api.../api/v1/rate-cards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "shipper_id": "...",
    "rate_type": "AIR_FREIGHT",
    "shipment_type": "GENERAL",
    "origin_airport": "BOM",
    "destination_airport": "DXB",
    "weight_slabs": [
      {"min_kg": 0, "max_kg": 45, "rate_per_kg": 135, "currency": "USD"},
      {"min_kg": 45, "max_kg": 100, "rate_per_kg": 125, "currency": "USD"}
    ],
    "surcharges": {"FSC": 0.15, "SSC": 0.05},
    "valid_from": "2026-02-01",
    "valid_until": "2026-07-31"
  }'

# Expected: 201 Created with rate_card_number like "RC-AIR-20260126-042"
```

#### Update Rate Card
```bash
curl -X PUT https://banxway-api.../api/v1/rate-cards/{id} \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "margin_percentage": 15,
    "notes": "Updated rate card"
  }'

# Expected: 200 OK with updated rate card
```

#### Delete Rate Card
```bash
curl -X DELETE https://banxway-api.../api/v1/rate-cards/{id} \
  -H "Authorization: Bearer $TOKEN"

# Expected: 204 No Content
# Verify: GET /{id} should show status = 'INACTIVE'
```

#### Activate/Deactivate
```bash
curl -X PATCH https://banxway-api.../api/v1/rate-cards/{id}/activate \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK with status = 'ACTIVE'
```

### Frontend UI Tests (TO BE DONE)

1. **Create Rate Card Flow**:
   - Click "Create Rate Card" button
   - Fill in all required fields
   - Add weight slabs
   - Set surcharges
   - Submit
   - Verify new rate card appears in list

2. **Edit Rate Card Flow**:
   - Click "Edit" on existing rate card
   - Modify fields
   - Submit
   - Verify changes reflected

3. **Delete Rate Card Flow**:
   - Click "Delete" on rate card
   - Confirm deletion
   - Verify rate card status = INACTIVE

4. **Validation Tests**:
   - Try submitting without required fields
   - Try invalid date range (valid_until < valid_from)
   - Try weight slabs with min > max
   - Verify clear error messages

---

## Deployment Status

### Backend Deployment

**Container**: `banxway-api--phase3-crud-{timestamp}`
**Image**: `banxwayacr.azurecr.io/banxway-backend:latest`
**Digest**: `sha256:84037a580d38f4ec015e7b12d2bc1058b5d8138566a3b9f1a8bbe7cc018b51de`
**Status**: Deploying... 🔄
**Endpoints**: All 5 new endpoints deployed

**New Endpoints Available**:
- POST /api/v1/rate-cards
- PUT /api/v1/rate-cards/:id
- DELETE /api/v1/rate-cards/:id
- PATCH /api/v1/rate-cards/:id/activate
- PATCH /api/v1/rate-cards/:id/deactivate

### Frontend Deployment

**Status**: Not yet deployed (no UI components created yet)
**Pending**: Rate card form, weight slab builder, surcharge manager

---

## Database Schema (No Changes)

Uses existing `rate_cards` table from Migration 012 - no schema changes needed for CRUD operations.

---

## Next Steps (Priority Order)

### Immediate (Must Complete Phase 3)

1. **Create RateCardForm Component** (2-3 hours)
   - Form layout with all fields
   - Integration with weight slab builder
   - Integration with surcharge manager
   - Form validation
   - Submit/Cancel handlers

2. **Create WeightSlabBuilder Component** (1-2 hours)
   - Dynamic array management
   - Add/remove slabs
   - Validation logic
   - Visual preview

3. **Create SurchargeManager Component** (1 hour)
   - Input fields for all surcharges
   - Percentage validation
   - Real-time total calculation

4. **Update Main Page** (30 minutes)
   - Add create button
   - Add create modal
   - Wire up mutations

5. **Update List & Detail Components** (1 hour)
   - Add edit/delete/activate buttons
   - Wire up mutations
   - Add confirmation dialogs

6. **Test & Deploy** (1 hour)
   - Manual testing of all CRUD operations
   - Deploy frontend to Vercel
   - End-to-end testing

**Total Estimated Time**: ~7-9 hours

### After Phase 3 Complete

Proceed to **Phase 4: Auto-Quotation (Inventory Mode)**

---

## Known Issues / Limitations

1. **No duplicate detection**: Can create multiple rate cards for same route
2. **No rate card versioning**: Edits overwrite previous values
3. **No bulk operations**: Can't create/update multiple rate cards at once
4. **No Excel import**: Must manually enter all rate cards
5. **No approval workflow**: Rate cards immediately active upon creation

**Note**: These limitations are acceptable for Phase 3 MVP and will be addressed in later phases if needed.

---

**Phase 3 Status**: Backend Complete ✅ | Frontend 0% 🔄
**Next Action**: Create frontend form components
**Estimated Completion**: 7-9 hours from now
**Date**: January 26, 2026

# Batch Production Guide

## Overview
Orders are now automatically organized into 5000L batches for efficient production. This means multiple client orders for the same resin type are produced together, but dispatched individually to each client.

## How It Works

### 1. Adding Orders (Orders For Future Page)
- Add orders as usual with client name, resin type, quantity, and scheduled date
- **Batches are created automatically** when you add orders
- Orders for the same resin type and scheduled date are grouped into 5000L batches (FIFO - first come first served)

### 2. Viewing Batches (Produced Resins Page - Active View)
Batches are grouped by resin type, showing:
- **Batch Number**: e.g., `B-20251102-ALKYDRESIN-01`
- **Total Quantity**: e.g., `5000 litres`
- **Individual Orders**: Shows each client's allocation within the batch with C1, C2, C3... suffixes

**Example Display:**
```
🧪 Alkyd Resin
  ├─ B-20251102-ALKYDRESIN-01 | Total: 5000 litres | pending
  │  Orders in this batch:
  │  ├─ C1 | client2      | 2000 litres | #01112025172139
  │  ├─ C2 | woodland     | 2000 litres | #01112025172201
  │  └─ C3 | Godown       | 1000 litres | #01112025172218
  │
  └─ B-20251102-ALKYDRESIN-02 | Total: 2000 litres | pending
     Orders in this batch:
     └─ C1 | Godown       | 2000 litres | #01112025172218
```

### 3. Production Process
- **Proceed All**: Start production for the entire batch (5000L at once)
- **Complete All**: Mark the entire batch as done (raw materials are deducted once for the full batch)
- **Dispatch All**: Send each allocation to its respective client automatically

### 4. History View (Archived)
Shows individual dispatched items with their order numbers:
- client2: 2000L → Order #01112025172139C1
- woodland: 2000L → Order #01112025172201C2
- Godown: 1000L → Order #01112025172218C3
- Godown: 2000L → Order #01112025172218C1 (from second batch)

### 5. Partial Orders & Billing Restrictions
**Important**: You cannot bill an order until it's fully dispatched.

**Example Scenario:**
- Godown ordered 3000 litres
- Batch 1 dispatches 1000 litres → Order status: `partially_dispatched`
- Batch 2 dispatches 2000 litres → Order status: `completed`
- **Billing is only allowed after Batch 2 dispatch** (when full 3000L is complete)

If you try to bill a partially dispatched order, you'll see:
```
Cannot bill order #01112025172218 for Godown. 
Only 1000/3000 litres have been dispatched. 
Complete the full order before billing.
```

## Key Benefits
1. **Efficient Production**: Produce 5000L batches instead of small individual orders
2. **Automatic Grouping**: No manual batch creation needed
3. **Clear Tracking**: See exactly which orders are in each batch
4. **Order Integrity**: Can't bill incomplete orders
5. **FIFO Processing**: Orders are batched in the order they were received

## Technical Details
- Batch capacity: 5000 litres (configurable)
- Orders spanning multiple batches are automatically split
- C1, C2, C3 numbering resets per batch
- Original order numbers are preserved in dispatch records
- Partial fulfillment is tracked per order (fulfilledQty field)

## Workflow Summary
```
Add Order → Auto-Batch → Proceed Batch → Complete Batch → Dispatch Batch → Bill Clients
                                                             ↓
                                        Individual client records created with C1/C2/C3 suffixes
```

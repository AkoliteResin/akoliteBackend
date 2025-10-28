## ⚙️ Environment Setup

Create a `.env` file in the root directory and add the following:

```env
MONGO_URI=mongodb://127.0.0.1:27017/resinDB
PORT=8080
```

> 💡 Make sure MongoDB is running locally or update `MONGO_URI` to your remote database connection string.

---

## 🧰 Setup

```bash
# Install dependencies
npm install

# Start server
npm run dev
```
---

# 🧪 Manufacturing Management API

A lightweight API for managing raw materials, product formulas, and production requests in a manufacturing workflow.

---

## 🚀 Health Check

### **GET** `/health`
Checks MongoDB connection status and returns application health.

#### ✅ Response
```json
{
  "status": "ok",
  "mongo": "connected"
}
```

---

## 🧱 Possible Raw Materials

**Base path:** `/possible-raw-materials`

### **POST** `/`
Creates a new possible raw material.

#### 📝 Request Body
```json
{
  "name": "Iron Ore"
}
```

#### ✅ Response
```json
{
  "message": "Possible raw material created successfully",
  "data": {
    "_id": "uuid",
    "name": "Iron Ore",
    "createdAt": "2025-10-28T12:00:00.000Z"
  }
}
```

---

### **GET** `/`
Lists all possible raw materials.

#### ✅ Response
```json
[
  {
    "_id": "uuid",
    "name": "Iron Ore",
    "createdAt": "2025-10-28T12:00:00.000Z"
  }
]
```

---

## ⚙️ Raw Materials

**Base path:** `/raw-materials`

### **POST** `/add`
Adds quantity to existing raw material stock.

#### 📝 Request Body
```json
{
  "rawMaterialId": "uuid",
  "quantity": 100,
  "receivedDate": "2025-10-27T00:00:00.000Z"
}
```

#### ✅ Response
```json
{
  "message": "Raw material stock updated successfully"
}
```

---

### **GET** `/`
Lists current stock of all raw materials.

#### ✅ Response
```json
[
  {
    "_id": "uuid",
    "name": "Iron Ore",
    "availableQuantity": 1200
  }
]
```

---

### **GET** `/history`
Gets the history of raw material transactions.

#### 🔍 Query Parameters
| Parameter | Type | Description | Default |
|------------|------|-------------|----------|
| `rawMaterialId` | string | Filter by specific material | — |
| `actionType` | string | Filter by action type | — |
| `page` | number | Page number | `1` |
| `limit` | number | Items per page (max 100) | `10` |

#### ✅ Response
```json
{
  "data": [
    {
      "_id": "uuid",
      "rawMaterialId": "uuid",
      "quantity": 100,
      "actionType": "ADD",
      "date": "2025-10-27T00:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "total": 1
}
```

---

## 🧪 Product Formulas

**Base path:** `/formulas`

### **POST** `/`
Creates a new product formula.

#### 📝 Request Body
```json
{
  "name": "ResinX",
  "rawMaterials": [
    { "rawMaterialId": "uuid1", "percentage": 60 },
    { "rawMaterialId": "uuid2", "percentage": 40 }
  ]
}
```

> ⚠️ Total percentage must sum to **100**.

#### ✅ Response
```json
{
  "message": "Product formula created successfully"
}
```

---

### **GET** `/`
Lists all product formulas with their raw materials.

#### ✅ Response
```json
[
  {
    "_id": "uuid",
    "name": "ResinX",
    "rawMaterials": [
      { "rawMaterialId": "uuid1", "percentage": 60 },
      { "rawMaterialId": "uuid2", "percentage": 40 }
    ]
  }
]
```

---

### **DELETE** `/:id`
Deletes a product formula by ID.

#### ✅ Response
```json
{
  "message": "Product formula deleted successfully"
}
```

---

## 🏭 Production Requests

**Base path:** `/production-request`

### **POST** `/`
Creates a new production request.

#### 📝 Request Body
```json
{
  "productName": "ResinX",
  "quantity": 200
}
```

#### ✅ Response
```json
{
  "message": "Production request created successfully",
  "data": {
    "_id": "uuid",
    "productName": "ResinX",
    "quantity": 200,
    "status": "REQUESTED",
    "createdDate": "2025-10-28T12:00:00.000Z"
  }
}
```

---

### **GET** `/`
Lists production requests.

#### 🔍 Query Parameters
| Parameter | Type | Description | Default |
|------------|------|-------------|----------|
| `page` | number | Page number | `1` |
| `limit` | number | Items per page (max 100) | `10` |
| `productName` | string | Filter by product name | — |
| `status` | string | Filter by status | — |

#### ✅ Valid Statuses
```
REQUESTED, APPROVED, DECLINED, IN_PROGRESS, COMPLETED, CANCELED, SHIPPED
```

#### ✅ Response
```json
{
  "data": [
    {
      "_id": "uuid",
      "productName": "ResinX",
      "quantity": 200,
      "status": "REQUESTED",
      "createdDate": "2025-10-28T12:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "total": 1
}
```

---

### **PATCH** `/:id/status`
Updates production request status.

#### 📝 Request Body
```json
{
  "newStatus": "APPROVED"
}
```

> ⚠️ Status transitions must follow valid workflow paths.

#### ✅ Response
```json
{
  "message": "Production request status updated successfully"
}
```

---

## 🧩 Tech Stack

- **Backend:** Node.js, Express.js  
- **Database:** MongoDB  
- **Validation:** Joi  
- **Pagination & Filtering:** Query parameters


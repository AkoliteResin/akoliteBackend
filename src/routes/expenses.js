const express = require('express');
const { ObjectId } = require('mongodb');
const { connectDB } = require('../db');

const router = express.Router();

// Get all expenses (with optional month/year filter)
router.get('/', async (req, res) => {
  try {
    const { expensesCollection } = await connectDB();
    const { month, year } = req.query;
    
    let query = {};
    if (month && year) {
      query.month = month;
      query.year = year;
    }
    
    const expenses = await expensesCollection.find(query).toArray();
    res.json(expenses);
  } catch (err) {
    console.error('/api/expenses GET error', err);
    res.status(500).json({ message: 'Failed to fetch expenses' });
  }
});

// Add expense
router.post('/', async (req, res) => {
  const { month, year, designation, employeeName, monthlyAmount, description } = req.body;

  const allowedDesignations = [
    'Office staff','Helper','Chemist','Accountant','Driver','Car Driver','Tanker Driver','Plant Operator','Manager','Conducter','Lab'
  ];

  if (!month || !year || !designation || !monthlyAmount) {
    return res.status(400).json({ message: 'Month, year, designation, and monthly amount are required' });
  }

  if (!allowedDesignations.includes(designation)) {
    return res.status(400).json({ message: 'Invalid designation' });
  }
  
  const amountNum = Number(monthlyAmount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ message: 'Monthly amount must be a positive number' });
  }
  
  try {
    const { expensesCollection } = await connectDB();
    
    // Check if expense already exists for this month/year/designation/employee
    const existing = await expensesCollection.findOne({
      month,
      year,
      designation,
      employeeName: employeeName || null
    });
    
    if (existing) {
      return res.status(409).json({ 
        message: 'Expense already exists for this month/designation/employee combination. Please update instead.' 
      });
    }
    
    const expense = {
      month,
      year,
      designation,
      employeeName: employeeName || null,
      monthlyAmount: amountNum,
      description: description || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await expensesCollection.insertOne(expense);
    expense._id = result.insertedId;
    res.status(201).json({ message: 'Monthly expense added successfully', expense });
  } catch (err) {
    console.error('/api/expenses POST error', err);
    res.status(500).json({ message: 'Failed to add expense' });
  }
});

// Update expense
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { month, year, designation, employeeName, monthlyAmount, description } = req.body;
  
  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid expense ID' });
  }
  
  const allowedDesignations = [
    'Office staff','Helper','Chemist','Accountant','Driver','Car Driver','Tanker Driver','Plant Operator','Manager','Conducter','Lab'
  ];

  if (!month || !year || !designation || !monthlyAmount) {
    return res.status(400).json({ message: 'Month, year, designation, and monthly amount are required' });
  }

  if (!allowedDesignations.includes(designation)) {
    return res.status(400).json({ message: 'Invalid designation' });
  }
  
  const amountNum = Number(monthlyAmount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ message: 'Monthly amount must be a positive number' });
  }
  
  try {
    const { expensesCollection } = await connectDB();
    const result = await expensesCollection.updateOne(
      { _id: new ObjectId(id) },
      { 
          $set: { 
            month,
            year,
            designation: designation || null,
            employeeName: employeeName || null,
            monthlyAmount: amountNum,
            description: description || '',
            updatedAt: new Date()
          } 
        }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    res.json({ message: 'Monthly expense updated successfully' });
  } catch (err) {
    console.error('/api/expenses PUT error', err);
    res.status(500).json({ message: 'Failed to update expense' });
  }
});

// Delete expense
router.delete('/:id', async (req, res) => {
  // Admin check removed for simplicity or should be middleware
  const { id } = req.params;
  
  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid expense ID' });
  }
  
  try {
    const { expensesCollection } = await connectDB();
    const result = await expensesCollection.deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    console.error('/api/expenses DELETE error', err);
    res.status(500).json({ message: 'Failed to delete expense' });
  }
});

// Get expense summary by category for a month
router.get('/summary', async (req, res) => {
  try {
    const { expensesCollection } = await connectDB();
    const { month, year } = req.query;
    
    let query = {};
    if (month && year) {
      query.month = month;
      query.year = year;
    }
    
    const expenses = await expensesCollection.find(query).toArray();
    
    const allowedCategories = [
      'Office staff','Helper','Chemist','Accountant','Driver','Car Driver','Tanker Driver','Plant Operator','Manager','Conducter','Lab'
    ];

    const summary = { total: 0, count: expenses.length };
    // initialize each category key to 0
    allowedCategories.forEach(d => { summary[d] = 0; });

    expenses.forEach(exp => {
      const amt = Number(exp.monthlyAmount) || 0;
      const key = exp.designation || 'Unknown';
      if (!summary[key]) summary[key] = 0;
      summary[key] += amt;
      summary.total += amt;
    });

    res.json(summary);
  } catch (err) {
    console.error('/api/expenses/summary GET error', err);
    res.status(500).json({ message: 'Failed to get expense summary' });
  }
});

module.exports = router;

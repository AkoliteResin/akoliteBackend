const express = require('express');
const { ObjectId } = require('mongodb');
const { connectDB } = require('../db');

const router = express.Router();

// Get all overtime expenses
router.get('/', async (req, res) => {
  try {
    const { overtimeCollection } = await connectDB();
    const overtimes = await overtimeCollection.find().sort({ date: -1 }).toArray();
    res.json(overtimes);
  } catch (err) {
    console.error('/api/overtime GET error', err);
    res.status(500).json({ message: 'Failed to fetch overtime expenses' });
  }
});

// Add overtime expense
router.post('/', async (req, res) => {
  const { expenseId, date, designation, employeeName, hoursWorked, overtimePayPerHour, totalOvertimePay } = req.body;

  const allowedDesignations = [
    'Office staff','Helper','Chemist','Accountant','Driver','Car Driver','Tanker Driver','Plant Operator','Manager','Conducter','Lab'
  ];

  if (!date || !designation || !hoursWorked || !overtimePayPerHour) {
    return res.status(400).json({ message: 'Date, designation, hours worked, and overtime pay per hour are required' });
  }

  if (!allowedDesignations.includes(designation)) {
    return res.status(400).json({ message: 'Invalid designation' });
  }
  
  const hours = Number(hoursWorked);
  const pay = Number(overtimePayPerHour);
  const total = Number(totalOvertimePay);
  
  if (!Number.isFinite(hours) || hours <= 0) {
    return res.status(400).json({ message: 'Hours worked must be a positive number' });
  }
  if (!Number.isFinite(pay) || pay <= 0) {
    return res.status(400).json({ message: 'Overtime pay per hour must be a positive number' });
  }
  
  try {
    const { overtimeCollection, expensesCollection } = await connectDB();
    
    const overtime = {
      expenseId: expenseId || null,
      date,
      designation,
      employeeName: employeeName || null,
      hoursWorked: hours,
      overtimePayPerHour: pay,
      totalOvertimePay: total,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await overtimeCollection.insertOne(overtime);
    overtime._id = result.insertedId;
    
    res.status(201).json({ message: 'Overtime expense added successfully', overtime });
  } catch (err) {
    console.error('/api/overtime POST error', err);
    res.status(500).json({ message: 'Failed to add overtime expense' });
  }
});

// Update overtime expense
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { date, designation, employeeName, hoursWorked, overtimePayPerHour, totalOvertimePay } = req.body;
  
  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid overtime ID' });
  }
  
  const allowedDesignations = [
    'Office staff','Helper','Chemist','Accountant','Driver','Car Driver','Tanker Driver','Plant Operator','Manager','Conducter','Lab'
  ];

  if (!date || !designation || !hoursWorked || !overtimePayPerHour) {
    return res.status(400).json({ message: 'Date, designation, hours worked, and overtime pay per hour are required' });
  }

  if (!allowedDesignations.includes(designation)) {
    return res.status(400).json({ message: 'Invalid designation' });
  }
  
  const hours = Number(hoursWorked);
  const pay = Number(overtimePayPerHour);
  const total = Number(totalOvertimePay);
  
  if (!Number.isFinite(hours) || hours <= 0) {
    return res.status(400).json({ message: 'Hours worked must be a positive number' });
  }
  if (!Number.isFinite(pay) || pay <= 0) {
    return res.status(400).json({ message: 'Overtime pay per hour must be a positive number' });
  }
  
  try {
    const { overtimeCollection } = await connectDB();
    const result = await overtimeCollection.updateOne(
      { _id: new ObjectId(id) },
      { 
          $set: { 
            date,
            designation,
            employeeName: employeeName || null,
            hoursWorked: hours,
            overtimePayPerHour: pay,
            totalOvertimePay: total,
            updatedAt: new Date()
          } 
        }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Overtime not found' });
    }
    
    res.json({ message: 'Overtime expense updated successfully' });
  } catch (err) {
    console.error('/api/overtime PUT error', err);
    res.status(500).json({ message: 'Failed to update overtime expense' });
  }
});

// Delete overtime expense
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid overtime ID' });
  }
  
  try {
    const { overtimeCollection, expensesCollection } = await connectDB();
    
    // Get the overtime record first to find expenseId and totalOvertimePay
    const overtime = await overtimeCollection.findOne({ _id: new ObjectId(id) });
    
    const result = await overtimeCollection.deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Overtime not found' });
    }
    
    res.json({ message: 'Overtime expense deleted successfully' });
  } catch (err) {
    console.error('/api/overtime DELETE error', err);
    res.status(500).json({ message: 'Failed to delete overtime expense' });
  }
});

module.exports = router;

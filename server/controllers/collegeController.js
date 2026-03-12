const { College } = require('../models');

// Get all colleges
exports.getAllColleges = async (req, res) => {
  try {
    const { search, city, isActive, page = 1, limit = 500 } = req.query;
    
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
      ];
    }
    
    if (city) {
      query.city = { $regex: city, $options: 'i' };
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [colleges, total] = await Promise.all([
      College.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      College.countDocuments(query),
    ]);
    
    res.json({
      success: true,
      data: colleges,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching colleges:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch colleges' });
  }
};

// Get college by code
exports.getCollegeByCode = async (req, res) => {
  try {
    const { code } = req.params;
    
    const college = await College.findOne({ code: code.toUpperCase() });
    
    if (!college) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }
    
    res.json({ success: true, data: college });
  } catch (error) {
    console.error('Error fetching college:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch college' });
  }
};

// Create new college
exports.createCollege = async (req, res) => {
  try {
    const { name, city, email, phone, address, isActive = true } = req.body;
    
    if (!name || !city) {
      return res.status(400).json({ success: false, message: 'Name and city are required' });
    }
    
    // Check if college already exists
    const existing = await College.findOne({ 
      name: { $regex: `^${name}$`, $options: 'i' },
      city: { $regex: `^${city}$`, $options: 'i' },
    });
    
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: 'College already exists',
        data: existing,
      });
    }
    
    // Generate unique code
    const code = await College.generateUniqueCode();
    
    const college = await College.create({
      name,
      city,
      code,
      email,
      phone,
      address,
      isActive,
    });
    
    res.status(201).json({ 
      success: true, 
      message: 'College created successfully',
      data: college,
    });
  } catch (error) {
    console.error('Error creating college:', error);
    res.status(500).json({ success: false, message: 'Failed to create college' });
  }
};

// Generate code for existing college without code
exports.generateCode = async (req, res) => {
  try {
    const { id } = req.params;
    
    const college = await College.findById(id);
    
    if (!college) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }
    
    if (college.code) {
      return res.status(400).json({ 
        success: false, 
        message: 'College already has a code',
        data: college,
      });
    }
    
    const code = await College.generateUniqueCode();
    college.code = code;
    await college.save();
    
    res.json({ 
      success: true, 
      message: 'Code generated successfully',
      data: college,
    });
  } catch (error) {
    console.error('Error generating code:', error);
    res.status(500).json({ success: false, message: 'Failed to generate code' });
  }
};

// Update college
exports.updateCollege = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, city, email, phone, address, isActive } = req.body;
    
    const college = await College.findById(id);
    
    if (!college) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }
    
    if (name) college.name = name;
    if (city) college.city = city;
    if (email !== undefined) college.email = email;
    if (phone !== undefined) college.phone = phone;
    if (address !== undefined) college.address = address;
    if (isActive !== undefined) college.isActive = isActive;
    
    await college.save();
    
    res.json({ 
      success: true, 
      message: 'College updated successfully',
      data: college,
    });
  } catch (error) {
    console.error('Error updating college:', error);
    res.status(500).json({ success: false, message: 'Failed to update college' });
  }
};

// Delete college (soft delete - set isActive to false)
exports.deleteCollege = async (req, res) => {
  try {
    const { id } = req.params;
    
    const college = await College.findById(id);
    
    if (!college) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }
    
    college.isActive = false;
    await college.save();
    
    res.json({ 
      success: true, 
      message: 'College deactivated successfully',
      data: college,
    });
  } catch (error) {
    console.error('Error deleting college:', error);
    res.status(500).json({ success: false, message: 'Failed to delete college' });
  }
};

// Get unique cities
exports.getCities = async (req, res) => {
  try {
    const cities = await College.distinct('city', { isActive: true });
    res.json({ success: true, data: cities.sort() });
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch cities' });
  }
};

// Bulk import colleges
exports.bulkImport = async (req, res) => {
  try {
    const { colleges } = req.body;
    
    if (!colleges || !Array.isArray(colleges)) {
      return res.status(400).json({ success: false, message: 'Invalid data format' });
    }
    
    const results = { created: 0, skipped: 0, errors: [] };
    
    for (const item of colleges) {
      try {
        const { name, city } = item;
        
        if (!name || !city) {
          results.skipped++;
          continue;
        }
        
        // Check if exists
        const existing = await College.findOne({ 
          name: { $regex: `^${name.trim()}$`, $options: 'i' },
          city: { $regex: `^${city.trim()}$`, $options: 'i' },
        });
        
        if (existing) {
          results.skipped++;
          continue;
        }
        
        const code = await College.generateUniqueCode();
        await College.create({ name: name.trim(), city: city.trim(), code });
        results.created++;
      } catch (err) {
        results.errors.push({ name: item.name, error: err.message });
      }
    }
    
    res.json({ 
      success: true, 
      message: `Import complete: ${results.created} created, ${results.skipped} skipped`,
      data: results,
    });
  } catch (error) {
    console.error('Error bulk importing:', error);
    res.status(500).json({ success: false, message: 'Failed to import colleges' });
  }
};

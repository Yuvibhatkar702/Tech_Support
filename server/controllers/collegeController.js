const { College } = require('../models');

const normalizePhone = (value = '') => String(value).replace(/\D/g, '').slice(0, 10);

const sanitizeFacultyList = (faculty = []) => {
  if (!Array.isArray(faculty)) return [];
  return faculty
    .map((f) => ({
      name: String(f?.name || '').trim(),
      number: normalizePhone(f?.number || f?.phoneNumber || ''),
      isActive: f?.isActive !== false,
    }))
    .filter((f) => f.name && /^[0-9]{10}$/.test(f.number));
};

// Get all colleges
exports.getAllColleges = async (req, res) => {
  try {
    const { search, city, isActive, page = 1, limit = 500 } = req.query;
    const isPublicRoute = req.path.startsWith('/public');
    
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
    const collegeQuery = College.find(query)
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    if (isPublicRoute) {
      collegeQuery.select('-faculty');
    }
    
    const [colleges, total] = await Promise.all([
      collegeQuery,
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
    const isPublicRoute = req.path.startsWith('/public/');
    
    const collegeQuery = College.findOne({ code: code.toUpperCase() });
    if (isPublicRoute) {
      collegeQuery.select('-faculty');
    }

    const college = await collegeQuery;
    
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
    const { name, city, email, phone, address, isActive = true, faculty = [] } = req.body;
    
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

    const sanitizedFaculty = sanitizeFacultyList(faculty);
    
    const college = await College.create({
      name,
      city,
      code,
      email,
      phone,
      address,
      isActive,
      faculty: sanitizedFaculty,
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

// Add faculty for a college
exports.addFacultyToCollege = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, number } = req.body;

    const cleanedName = String(name || '').trim();
    const cleanedNumber = normalizePhone(number || '');

    if (!cleanedName || !/^[0-9]{10}$/.test(cleanedNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Faculty name and valid 10-digit number are required',
      });
    }

    const college = await College.findById(id);
    if (!college) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }

    const duplicate = (college.faculty || []).find(
      (f) => f.isActive !== false &&
        f.name?.toLowerCase() === cleanedName.toLowerCase() &&
        normalizePhone(f.number) === cleanedNumber
    );

    if (duplicate) {
      return res.status(400).json({ success: false, message: 'Faculty already exists for this college' });
    }

    college.faculty.push({
      name: cleanedName,
      number: cleanedNumber,
      isActive: true,
    });

    await college.save();

    const activeFaculty = (college.faculty || []).filter((f) => f.isActive !== false);

    return res.status(201).json({
      success: true,
      message: 'Faculty added successfully',
      data: {
        collegeId: college._id,
        faculty: activeFaculty,
      },
    });
  } catch (error) {
    console.error('Error adding faculty:', error);
    return res.status(500).json({ success: false, message: 'Failed to add faculty' });
  }
};

// Update faculty for a college
exports.updateCollegeFaculty = async (req, res) => {
  try {
    const { id, facultyId } = req.params;
    const { name, number } = req.body;

    const cleanedName = String(name || '').trim();
    const cleanedNumber = normalizePhone(number || '');

    if (!cleanedName || !/^[0-9]{10}$/.test(cleanedNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Faculty name and valid 10-digit number are required',
      });
    }

    const college = await College.findById(id);
    if (!college) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }

    const facultyRecord = college.faculty.id(facultyId);
    if (!facultyRecord || facultyRecord.isActive === false) {
      return res.status(404).json({ success: false, message: 'Faculty not found' });
    }

    const duplicate = (college.faculty || []).find(
      (f) =>
        String(f._id) !== String(facultyId) &&
        f.isActive !== false &&
        f.name?.toLowerCase() === cleanedName.toLowerCase() &&
        normalizePhone(f.number) === cleanedNumber
    );

    if (duplicate) {
      return res.status(400).json({ success: false, message: 'Faculty already exists for this college' });
    }

    facultyRecord.name = cleanedName;
    facultyRecord.number = cleanedNumber;

    await college.save();

    const activeFaculty = (college.faculty || []).filter((f) => f.isActive !== false);
    return res.json({
      success: true,
      message: 'Faculty updated successfully',
      data: {
        collegeId: college._id,
        faculty: activeFaculty,
      },
    });
  } catch (error) {
    console.error('Error updating faculty:', error);
    return res.status(500).json({ success: false, message: 'Failed to update faculty' });
  }
};

// Remove (deactivate) faculty for a college
exports.removeCollegeFaculty = async (req, res) => {
  try {
    const { id, facultyId } = req.params;

    const college = await College.findById(id);
    if (!college) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }

    const facultyRecord = college.faculty.id(facultyId);
    if (!facultyRecord || facultyRecord.isActive === false) {
      return res.status(404).json({ success: false, message: 'Faculty not found' });
    }

    facultyRecord.isActive = false;
    await college.save();

    const activeFaculty = (college.faculty || []).filter((f) => f.isActive !== false);
    return res.json({
      success: true,
      message: 'Faculty removed successfully',
      data: {
        collegeId: college._id,
        faculty: activeFaculty,
      },
    });
  } catch (error) {
    console.error('Error removing faculty:', error);
    return res.status(500).json({ success: false, message: 'Failed to remove faculty' });
  }
};

// Get active faculty list by college code (public)
exports.getCollegeFacultyByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const college = await College.findOne({ code: String(code || '').toUpperCase(), isActive: true });

    if (!college) {
      return res.status(404).json({ success: false, message: 'College not found' });
    }

    const faculty = (college.faculty || [])
      .filter((f) => f.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.json({
      success: true,
      data: {
        collegeCode: college.code,
        collegeName: college.name,
        faculty,
      },
    });
  } catch (error) {
    console.error('Error fetching college faculty:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch faculty list' });
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

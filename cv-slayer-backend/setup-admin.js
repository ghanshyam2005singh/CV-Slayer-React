const mongoose = require('mongoose');
let bcrypt;

// Try to load bcryptjs, provide fallback if not available
try {
  bcrypt = require('bcryptjs');
} catch (error) {
  console.log('⚠️ bcryptjs not found, installing...');
  const { execSync } = require('child_process');
  execSync('npm install bcryptjs', { stdio: 'inherit' });
  bcrypt = require('bcryptjs');
}

require('dotenv').config();

// Admin schema (adjust based on your actual schema)
const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now }
});

const Admin = mongoose.model('Admin', adminSchema);

async function setupAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    console.log('📍 MongoDB URI:', process.env.MONGODB_URI);
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Check current admins
    const adminCount = await Admin.countDocuments();
    console.log(`👥 Current admin count: ${adminCount}`);
    
    // Check if specific admin already exists
    const existingAdmin = await Admin.findOne({ email: 'admin@cvslayer.com' });
    if (existingAdmin) {
      console.log('⚠️ Admin user already exists');
      console.log('📧 Existing admin email:', existingAdmin.email);
      console.log('📅 Created at:', existingAdmin.createdAt);
      await mongoose.disconnect();
      return;
    }
    
    // Create admin user
    console.log('🔐 Creating hashed password...');
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    const admin = new Admin({
      email: 'admin@cvslayer.com',
      password: hashedPassword,
      role: 'admin'
    });
    
    console.log('💾 Saving admin user...');
    await admin.save();
    
    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@cvslayer.com');
    console.log('🔑 Password: admin123');
    console.log('🆔 Admin ID:', admin._id);
    
    await mongoose.disconnect();
    console.log('✅ Setup complete');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error('📊 Full error:', error);
    
    if (error.code === 11000) {
      console.log('💡 This error means the admin already exists with a different check');
    }
    
    await mongoose.disconnect();
  }
}

setupAdmin();
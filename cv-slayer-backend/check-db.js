const mongoose = require('mongoose');
require('dotenv').config();

async function checkDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Check all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📂 Collections:', collections.map(c => c.name));
    
    // Check resume collection
    const resumeCollection = mongoose.connection.db.collection('resumes');
    const resumeCount = await resumeCollection.countDocuments();
    console.log('\n📄 Total resumes:', resumeCount);
    
    if (resumeCount > 0) {
      const recentResumes = await resumeCollection.find({}).limit(5).toArray();
      console.log('\n📋 Recent resumes:');
      recentResumes.forEach((resume, index) => {
        console.log(`${index + 1}. ${resume.originalFileName || 'Unknown'} - ${new Date(resume.uploadedAt).toLocaleString()}`);
      });
    }
    
    // Check admin collection
    const adminCollection = mongoose.connection.db.collection('admins');
    const adminCount = await adminCollection.countDocuments();
    console.log('\n👥 Total admins:', adminCount);
    
    await mongoose.disconnect();
    console.log('\n✅ Database check complete');
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  }
}

checkDatabase();
const mongoose = require('mongoose');
require('dotenv').config();

async function checkAllData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    console.log('🔗 Database URL:', process.env.MONGODB_URI);
    
    // List all databases
    const admin = mongoose.connection.db.admin();
    const databases = await admin.listDatabases();
    console.log('\n🗄️ All Databases:');
    databases.databases.forEach(db => {
      console.log(`   - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });
    
    // Current database info
    const currentDbName = mongoose.connection.db.databaseName;
    console.log(`\n📊 Current Database: ${currentDbName}`);
    
    // Check all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📂 Collections in current database:');
    
    for (const collection of collections) {
      const collectionName = collection.name;
      const coll = mongoose.connection.db.collection(collectionName);
      const count = await coll.countDocuments();
      console.log(`   - ${collectionName}: ${count} documents`);
      
      // Show sample data for each collection
      if (count > 0) {
        const samples = await coll.find({}).limit(2).toArray();
        console.log(`     Sample documents:`);
        samples.forEach((doc, index) => {
          console.log(`     ${index + 1}. ID: ${doc._id}`);
          if (doc.originalFileName) console.log(`        File: ${doc.originalFileName}`);
          if (doc.uploadedAt) console.log(`        Uploaded: ${new Date(doc.uploadedAt).toLocaleString()}`);
          if (doc.analysis?.overallScore) console.log(`        Score: ${doc.analysis.overallScore}`);
          if (doc.email) console.log(`        Email: ${doc.email}`);
        });
      }
    }
    
    // Try to find resumes in different possible collections
    const possibleCollections = ['resumes', 'resume', 'cvs', 'documents', 'uploads'];
    console.log('\n🔍 Searching for resumes in all possible collections:');
    
    for (const collName of possibleCollections) {
      try {
        const coll = mongoose.connection.db.collection(collName);
        const count = await coll.countDocuments();
        if (count > 0) {
          console.log(`   ✅ Found ${count} documents in '${collName}'`);
          const sample = await coll.findOne({});
          console.log(`      Sample keys:`, Object.keys(sample));
        }
      } catch (error) {
        // Collection doesn't exist, ignore
      }
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Database check complete');
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  }
}

checkAllData();
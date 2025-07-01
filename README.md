# 🩸 CV Slayer 😈 — Brutally Honest Resume Roaster

CV Slayer is not your typical resume reviewer. It's the dark-humored, brutally honest, slightly unhinged HR you never wanted to meet... but probably needed to. Choose how hard you want to get roasted — from "Pyar Se 💘" to "Dhang Se 😡" — and watch your resume get shredded with style (and swears 😬).

## 🚨 DISCLAIMER
> **This tool is for fun and educational purposes only.**  
> It uses AI-generated sarcasm, satire, and roasts.  
> Don't take it to heart — take it as motivation.  
> Not suitable for sensitive users or formal HR use.

---

## 🔥 Roast Modes

| Mode         | Description                                          | Gali Level 🔞 | Target Style           |
|--------------|------------------------------------------------------|---------------|-------------------------|
| Pyar Se 💘     | Gentle roast with hints of humor and suggestions.   | Low           | Light-hearted + Tips    |
| Ache Se 😬     | Decent roast — honest, a bit spicy, a bit salty.    | Medium        | Satirical + Real Talk   |
| Dhang Se 😈    | Full-on savage. No filters. No chill.               | High 🔥       | Brutal + Gali (gender-specific) |

> **Gali levels adapt to user's selected gender**:  
> - 🧑 Male: Standard Indian desi gali mode  
> - 👩 Female: Roasts are fierce but with a filter  
> - 🧑‍🦱 Others: Neutral savage tone  

---

## 📁 How It Works

1. Upload your resume (PDF/Docx)
2. Choose roast intensity: *Pyar Se*, *Ache Se*, or *Dhang Se*
3. Select your gender (to personalize roast tone)
4. Select language (English/Hindi/Hinglish) and style (Funny/Serious/Sarcastic/Motivational)
5. Get a full roast report — line by line and overall
6. Admin can view all submissions in organized dashboard

---

## 🏗️ Current Architecture

### **Local Storage System** (Current Implementation)
- **No PDF Storage**: Files are processed and deleted immediately
- **Metadata Only**: Extracted text, analysis results, and statistics stored locally
- **Admin Dashboard**: Secure panel to view all resume analytics
- **File Structure**:
  ```
  cv-slayer-backend/
  ├── storage/
  │   ├── metadata/     # Resume analysis results (JSON)
  │   ├── texts/        # Extracted text content (TXT)
  │   └── backups/      # Automated backups
  ```

### **Security Features**
- ✅ Rate limiting (3 requests per 15 minutes)
- ✅ File validation and virus scanning
- ✅ Input sanitization and validation
- ✅ Admin authentication with time-based codes
- ✅ Request tracking and logging
- ✅ Data integrity checks with checksums

---

## 🚧 Tech Stack

### **Current Implementation**
- **Frontend**: React (Create React App)
- **Backend**: Node.js + Express
- **AI Service**: Google Gemini API
- **File Processing**: `pdf-parse`, `mammoth` (DOCX)
- **Storage**: Local file system
- **Security**: `helmet`, `express-rate-limit`, `validator`
- **Authentication**: JWT tokens for admin panel

### **File Structure**
```
cv-slayer/
├── src/                          # React frontend
│   ├── components/
│   │   ├── AdminPanel.jsx        # Admin dashboard
│   │   └── ResultsDisplay.jsx    # Analysis results
│   └── App.js                    # Main application
├── cv-slayer-backend/
│   ├── routes/
│   │   ├── resume.js             # Resume processing endpoints
│   │   └── admin.js              # Admin panel endpoints
│   ├── services/
│   │   ├── geminiService.js      # AI analysis service
│   │   ├── fileProcessor.js      # PDF/DOCX processing
│   │   ├── resumeStorageEnhanced.js  # Local storage management
│   │   └── adminAuth.js          # Admin authentication
│   ├── utils/
│   │   └── logger.js             # Comprehensive logging
│   └── storage/                  # Local storage directory
└── README.md
```

---

## 📦 Installation & Setup

### **Prerequisites**
- Node.js 16+ 
- Google Gemini API key

### **Backend Setup**
```bash
cd cv-slayer-backend
npm install express multer cors dotenv @google/generative-ai pdf-parse mammoth express-rate-limit helmet compression jsonwebtoken validator
npm install -D nodemon
```

### **Frontend Setup**
```bash
cd ..
npm install react react-dom
```

### **Environment Variables**
Create `cv-slayer-backend/.env`:
```env
# AI Service
GEMINI_API_KEY=your_gemini_api_key

# Security
JWT_SECRET=your_super_secret_jwt_key
ADMIN_EMAILS=your-email@gmail.com,admin2@gmail.com

# Storage Limits
MAX_FILE_SIZE=5242880                # 5MB
MAX_STORAGE_SIZE=1073741824          # 1GB
MAX_RESUME_AGE=7776000000            # 90 days in ms

# Development Settings
NODE_ENV=development
SKIP_RATE_LIMIT=true
PORT=5000
```

### **Run the Application**
```bash
# Backend
cd cv-slayer-backend
npm run dev

# Frontend (new terminal)
cd ..
npm start
```

### **Access Points**
- **Main App**: `http://localhost:3000`
- **Admin Panel**: `http://localhost:3000/admin`
- **API Health**: `http://localhost:5000/api/health`

---

## 📊 Admin Panel Features

### **Dashboard Analytics**
- Total resumes processed
- Daily/weekly statistics
- Average scores and trends
- Language and style preferences
- File type distributions

### **Resume Management**
- View all submitted resumes
- Search and filter capabilities
- Individual resume details
- Export data (CSV/JSON)
- Delete sensitive data

### **Security & Monitoring**
- Request logging and tracking
- Error monitoring
- Rate limit status
- System health metrics

---

## 💡 Example Roast Snippets

> _"Bhai tu ne 'Team Player' likha hai, lekin tu group project mein hamesha gayab rehta tha na?"_  
> _"Objective: 'Seeking challenging position...' — Bhai challenge toh spelling ka lag raha hai yahan."_  
> _"You said 'Hardworking', par resume banate waqt copy kiya lagta hai pura."_

---

## 🚀 Future Storage Options

### **Option 1: AWS S3 Integration**

#### **When to Migrate**
- High volume traffic (1000+ uploads/day)
- Need for file versioning
- Disaster recovery requirements
- Multi-region deployment

#### **Implementation Steps**

1. **Install AWS SDK**
   ```bash
   npm install aws-sdk multer-s3
   ```

2. **Create S3 Service** (`cv-slayer-backend/services/s3Storage.js`)
   ```javascript
   const AWS = require('aws-sdk');
   const multerS3 = require('multer-s3');
   
   const s3 = new AWS.S3({
     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
     region: process.env.AWS_REGION
   });
   
   module.exports = {
     uploadConfig: multerS3({
       s3: s3,
       bucket: process.env.S3_BUCKET_NAME,
       acl: 'private',
       key: function (req, file, cb) {
         cb(null, `resumes/${Date.now()}_${file.originalname}`);
       }
     }),
     
     async deleteFile(key) {
       return s3.deleteObject({
         Bucket: process.env.S3_BUCKET_NAME,
         Key: key
       }).promise();
     }
   };
   ```

3. **Update Environment Variables**
   ```env
   # AWS Configuration
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   AWS_REGION=us-east-1
   S3_BUCKET_NAME=cv-slayer-resumes
   
   # Storage Strategy
   STORAGE_TYPE=s3  # local | s3 | firebase
   ```

4. **Modify File Upload** (`routes/resume.js`)
   ```javascript
   const s3Storage = require('../services/s3Storage');
   
   // Replace multer.memoryStorage() with:
   const upload = multer({
     storage: process.env.STORAGE_TYPE === 's3' 
       ? s3Storage.uploadConfig 
       : multer.memoryStorage()
   });
   ```

#### **Files to Modify for S3**
- ✏️ `cv-slayer-backend/services/resumeStorageEnhanced.js` - Add S3 methods
- ✏️ `cv-slayer-backend/routes/resume.js` - Update upload middleware
- ✏️ `cv-slayer-backend/routes/admin.js` - Add S3 admin functions
- ➕ `cv-slayer-backend/services/s3Storage.js` - New S3 service
- ✏️ `cv-slayer-backend/.env` - Add AWS credentials

### **Option 2: Firebase Storage**

#### **Implementation Steps**

1. **Install Firebase**
   ```bash
   npm install firebase-admin
   ```

2. **Create Firebase Service** (`cv-slayer-backend/services/firebaseStorage.js`)
   ```javascript
   const admin = require('firebase-admin');
   
   admin.initializeApp({
     credential: admin.credential.cert(require('../config/firebase-key.json')),
     storageBucket: process.env.FIREBASE_STORAGE_BUCKET
   });
   
   const bucket = admin.storage().bucket();
   
   module.exports = {
     async uploadFile(buffer, filename) {
       const file = bucket.file(`resumes/${filename}`);
       await file.save(buffer);
       return file.name;
     },
     
     async deleteFile(filename) {
       await bucket.file(filename).delete();
     }
   };
   ```

#### **Files to Modify for Firebase**
- ✏️ `cv-slayer-backend/services/resumeStorageEnhanced.js`
- ✏️ `cv-slayer-backend/routes/resume.js`
- ➕ `cv-slayer-backend/services/firebaseStorage.js`
- ➕ `cv-slayer-backend/config/firebase-key.json`

### **Option 3: CloudFlare R2 (Cost-Effective)**

#### **Benefits**
- S3-compatible API
- No egress fees
- Better pricing than AWS S3

#### **Implementation**
```javascript
// Same as S3 but with different endpoint
const s3 = new AWS.S3({
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  region: 'auto',
  signatureVersion: 'v4'
});
```

---

## 🔄 Migration Strategy

### **Gradual Migration Approach**

1. **Phase 1: Dual Storage**
   ```javascript
   // Store in both local and cloud
   const saveToLocal = await localStorage.save(data);
   const saveToCloud = await cloudStorage.save(data);
   ```

2. **Phase 2: Cloud Primary, Local Backup**
   ```javascript
   // Primary: Cloud, Fallback: Local
   try {
     return await cloudStorage.save(data);
   } catch (error) {
     return await localStorage.save(data);
   }
   ```

3. **Phase 3: Cloud Only**
   ```javascript
   // Remove local storage completely
   return await cloudStorage.save(data);
   ```

### **Configuration-Driven Storage**

Create `cv-slayer-backend/config/storage.js`:
```javascript
const StorageFactory = {
  create(type) {
    switch(type) {
      case 'local': return require('../services/resumeStorageEnhanced');
      case 's3': return require('../services/s3Storage');
      case 'firebase': return require('../services/firebaseStorage');
      default: throw new Error(`Unknown storage type: ${type}`);
    }
  }
};

module.exports = StorageFactory.create(process.env.STORAGE_TYPE || 'local');
```

---

## 📈 Scaling Considerations

### **Performance Optimizations**
- **Caching**: Implement Redis for frequent queries
- **CDN**: CloudFlare for static assets
- **Database**: Migrate to PostgreSQL/MongoDB for complex queries
- **Load Balancing**: Multiple server instances

### **Cost Management**
- **Storage Lifecycle**: Auto-delete old files
- **Compression**: Gzip text content
- **Smart Archiving**: Move old data to cheaper storage tiers

---

## 📦 Features Coming Soon

- 🎤 **Voice Roast Mode** — Hear your roast in desi accent
- 🔄 **Auto Resume Fix Suggestions**
- 🛡️ **"Roast me again" button for masochists**
- 🧠 **ML-based Resume Scoring (Real + Funny)**
- 📊 **Advanced Analytics Dashboard**
- 🌐 **Multi-tenant Support**
- 🔐 **Enhanced Security Features**

---

## 🧑‍⚖️ License & Ethics

This project is open source under the [MIT License](LICENSE), but please use responsibly.  
No hate, just roast. We're here to improve CVs *and* your sense of humor 😎.

---

## ✨ Made with Attitude by [Iron Industry]

> "Bachpan se HR se dant padhi hai, ab AI se bhi padho."

### **Current Package Dependencies**

```json
{
  "backend": {
    "dependencies": [
      "express", "multer", "cors", "dotenv",
      "@google/generative-ai", "pdf-parse", "mammoth",
      "express-rate-limit", "helmet", "compression",
      "jsonwebtoken", "validator"
    ],
    "devDependencies": ["nodemon"]
  },
  "frontend": {
    "dependencies": ["react", "react-dom"]
  }
}
```

### **Future Packages (for Cloud Storage)**

```bash
# For AWS S3
npm install aws-sdk multer-s3

# For Firebase
npm install firebase-admin

# For Enhanced Features
npm install redis ioredis mongoose winston
```

---

## 🔗 API Endpoints

### **Public Endpoints**
- `POST /api/resume/analyze` - Submit resume for analysis
- `GET /api/health` - Service health check
- `GET /api/resume/info` - API information

### **Admin Endpoints**
- `POST /api/admin/login` - Request login code
- `POST /api/admin/verify` - Verify login code
- `GET /api/admin/dashboard` - Dashboard statistics
- `GET /api/admin/resumes` - List all resumes
- `GET /api/admin/resumes/:id` - Get specific resume
- `DELETE /api/admin/resumes/:id` - Delete resume
- `GET /api/admin/export` - Export data

---

For detailed implementation guides and troubleshooting, check our [Wiki](wiki-link) or raise an [Issue](issues-link).
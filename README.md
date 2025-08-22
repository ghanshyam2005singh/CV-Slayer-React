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
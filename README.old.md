# 🩸 CV Slayer 😈 — Brutally Honest Resume Roaster

CV Slayer is not your typical resume reviewer. It's the dark-humored, brutally honest, slightly unhinged HR you never wanted to meet... but probably needed to. Choose how hard you want to get roasted — from “Pyar Se 💘” to “Dhang Se 😡” — and watch your resume get shredded with style (and swears 😬).

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

> **Gali levels adapt to user’s selected gender**:  
> - 🧑 Male: Standard Indian desi gali mode  
> - 👩 Female: Roasts are fierce but with a filter  
> - 🧑‍🦱 Others: Neutral savage tone  

---

## 📁 How It Works

1. Upload your resume (PDF/Docx)
2. Choose roast intensity: *Pyar Se*, *Ache Se*, or *Dhang Se*
3. Select your gender (to personalize roast tone)
4. Get a full roast report — line by line and overall

---

## 🚧 Tech Stack (Suggested)

- **Frontend**: Next.js / React
- **Backend**: Node.js / Express
- **NLP**: OpenAI GPT-4o or HuggingFace models
- **File Parsing**: `pdf-parse`, `docx-parser`
- **Gender-sensitive filtering**: Custom regex + tone mapping
- **Storage**: Firebase / Supabase (optional)
- **Deployment**: Vercel / Render

---

## 💡 Example Roast Snippets

> _“Bhai tu ne ‘Team Player’ likha hai, lekin tu group project mein hamesha gayab rehta tha na?”_  
> _“Objective: 'Seeking challenging position...' — Bhai challenge toh spelling ka lag raha hai yahan.”_  
> _“You said ‘Hardworking’, par resume banate waqt copy kiya lagta hai pura.”_

---

## 📦 Features Coming Soon

- 🎤 **Voice Roast Mode** — Hear your roast in desi accent
- 🔄 **Auto Resume Fix Suggestions**
- 🛡️ **“Roast me again” button for masochists**
- 🧠 **ML-based Resume Scoring (Real + Funny)**

---

## 🧑‍⚖️ License & Ethics

This project is open source under the [MIT License](LICENSE), but please use responsibly.  
No hate, just roast. We're here to improve CVs *and* your sense of humor 😎.

---

## ✨ Made with Attitude by [Iron Industry]

> “Bachpan se HR se dant padhi hai, ab AI se bhi padho.”

# Packages
- [pdf-parse](https://www.npmjs.com/package/pdf-parse)
- [docx-parser](https://www.npmjs.com/package/docx-parser)
- [express](https://www.npmjs.com/package/express)
- [firebase](https://www.npmjs.com/package/firebase)
- [openai](https://www.npmjs.com/package/openai)



lets debug this and make it better, there is lots of problem i am telling you about the application and also some issue and then we will go every pages one by one and update the whole page accordingly, i said one by one page and all the page, till i said stop.

about the application: this application where user came and upload their resume and select the preferences given in option, you can checkout otions frm app.js and when he click on button for roast gemini will analysis the document and store the all the information from document with knowing user, and give him feedback roast other things score based on document and preferences and the data will be store in mongodb atlas and when only admin go to admin rount and login with email pssword he can see the resume the has been store in mongodb and all the information, i said all name mail number etc etc all and admin can delete and view the resume from admin panel. thats all

issue:1. data isn not storing and fetching properly like time and details
3. better ui of navbar, that toogle button
4. use env file instead of directly coded email and other important data
5. fix linting, npm run build issue, remove console.log and other sesitive data leaking
instead of localhost or development, make it for production and better
6. make it mobile responsive
7. can see all the details and delete the resume
8. giving window alert when click on analyse other resume
9. etc if you think any improvement but donot change our concept

again i am saying remeber this, we will go every pages one by one and improve it.

class EnhancedInfoExtractor {
  constructor() {
    this.patterns = {
      email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+.[a-zA-Z]{2,}/gi,
      phone: /(+?d{1,3}[-.s]?)?(?d{3})?[-.s]?d{3}[-.s]?d{4}/g,
      name: /^[A-Z][a-z]+ [A-Z][a-z]+(?:s[A-Z][a-z]+)?/m,
      linkedin: /linkedin.com/in/[a-zA-Z0-9-]+/gi,
      github: /github.com/[a-zA-Z0-9-]+/gi,
      
      // Enhanced skill patterns
      skills: {
        programming: /(JavaScript|Python|Java|C++|C#|PHP|Ruby|Go|Rust|Swift|Kotlin|TypeScript|React|Angular|Vue|Node.js|Express|Django|Flask|Spring|Laravel|MongoDB|MySQL|PostgreSQL|Redis|Docker|Kubernetes|AWS|Azure|GCP)/gi,
        tools: /(Git|GitHub|GitLab|Jenkins|Docker|Kubernetes|VS Code|IntelliJ|Eclipse|Postman|Figma|Adobe|Photoshop|Illustrator)/gi,
        soft: /(leadership|communication|teamwork|problem.solving|analytical|creative|adaptable|detail.oriented|time.management|project.management)/gi
      },
      
      // Enhanced experience patterns
      experience: {
        title: /(Software Engineer|Developer|Manager|Analyst|Designer|Consultant|Intern|Senior|Junior|Lead|Principal|Director|Vice President|CEO|CTO|CFO)/gi,
        company: /(Inc.|LLC|Corp.|Corporation|Company|Ltd.|Limited|Technologies|Solutions|Systems|Services)/gi,
        duration: /(d{1,2}/d{4}|[A-Z][a-z]{2,8}sd{4})s*[-–—]s*(d{1,2}/d{4}|[A-Z][a-z]{2,8}sd{4}|Present|Current)/gi
      },
      
      // Enhanced education patterns
      education: {
        degree: /(Bachelor|Master|PhD|Associate|Certificate|Diploma|B.S.|B.A.|M.S.|M.A.|MBA)/gi,
        institution: /(University|College|Institute|School|Academy)/gi,
        year: /(19|20)d{2}/g
      }
    };
    
    this.skillCategories = {
      programming: ['JavaScript', 'Python', 'Java', 'C++', 'C#', 'PHP', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin', 'TypeScript'],
      frontend: ['React', 'Angular', 'Vue', 'HTML', 'CSS', 'SASS', 'Bootstrap', 'Tailwind'],
      backend: ['Node.js', 'Express', 'Django', 'Flask', 'Spring', 'Laravel', '.NET'],
      database: ['MongoDB', 'MySQL', 'PostgreSQL', 'Redis', 'SQLite', 'Oracle'],
      cloud: ['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins'],
      tools: ['Git', 'GitHub', 'GitLab', 'VS Code', 'IntelliJ', 'Eclipse', 'Postman']
    };
  }
  
  extractEnhancedInfo(text) {
    if (!text || text.length < 10) {
      return this.getEmptyInfo();
    }
    
    const info = {
      personalInfo: this.extractPersonalInfo(text),
      professional: this.extractProfessionalInfo(text),
      skills: this.extractSkills(text),
      experience: this.extractExperience(text),
      education: this.extractEducation(text)
    };
    
    return info;
  }
  
  extractPersonalInfo(text) {
    const emails = text.match(this.patterns.email) || [];
    const phones = text.match(this.patterns.phone) || [];
    const linkedins = text.match(this.patterns.linkedin) || [];
    const githubs = text.match(this.patterns.github) || [];
    
    // Better name extraction
    let name = null;
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Look for name in first few lines
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      if (line.length > 3 && line.length < 50 && 
          /^[A-Z][a-z]+ [A-Z][a-z]+/.test(line) && 
          !line.includes('@') && !line.includes('http')) {
        name = line;
        break;
      }
    }
    
    return {
      name: name,
      email: emails[0] || null,
      phone: phones[0] || null,
      linkedin: linkedins[0] || null,
      github: githubs[0] || null,
      hasEmail: emails.length > 0,
      hasPhone: phones.length > 0,
      hasLinkedIn: linkedins.length > 0,
      hasGithub: githubs.length > 0
    };
  }
  
  extractSkills(text) {
    const technical = [];
    const textLower = text.toLowerCase();
    
    // Extract from all skill categories
    Object.entries(this.skillCategories).forEach(([category, skills]) => {
      skills.forEach(skill => {
        if (textLower.includes(skill.toLowerCase()) && 
            !technical.some(t => t.name.toLowerCase() === skill.toLowerCase())) {
          technical.push({
            name: skill,
            category: category,
            proficiency: 'intermediate'
          });
        }
      });
    });
    
    return {
      technical: technical,
      count: technical.length
    };
  }
  
  extractExperience(text) {
    const experience = [];
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Look for experience sections
    let inExperienceSection = false;
    let currentExp = null;
    
    lines.forEach(line => {
      if (/experience|work|employment|career/i.test(line) && line.length < 50) {
        inExperienceSection = true;
        return;
      }
      
      if (inExperienceSection && line.length > 10) {
        // Check if it's a job title line
        const titleMatches = line.match(this.patterns.experience.title);
        if (titleMatches && line.length < 100) {
          if (currentExp) experience.push(currentExp);
          currentExp = {
            title: line,
            company: null,
            duration: null,
            description: []
          };
        }
        // Check for duration
        else if (this.patterns.experience.duration.test(line)) {
          if (currentExp) currentExp.duration = line;
        }
        // Check for company
        else if (this.patterns.experience.company.test(line) && line.length < 100) {
          if (currentExp) currentExp.company = line;
        }
      }
    });
    
    if (currentExp) experience.push(currentExp);
    
    return experience.slice(0, 5); // Limit to 5 experiences
  }
  
  extractEducation(text) {
    const education = [];
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    lines.forEach(line => {
      const degreeMatch = line.match(this.patterns.education.degree);
      const yearMatch = line.match(this.patterns.education.year);
      const institutionMatch = line.match(this.patterns.education.institution);
      
      if (degreeMatch && line.length < 200) {
        education.push({
          degree: line,
          institution: institutionMatch ? institutionMatch[0] : null,
          graduationYear: yearMatch ? parseInt(yearMatch[0]) : null
        });
      }
    });
    
    return education.slice(0, 3); // Limit to 3 education entries
  }
  
  getEmptyInfo() {
    return {
      personalInfo: { name: null, email: null, phone: null, linkedin: null, github: null },
      professional: { currentJobTitle: null, summary: null },
      skills: { technical: [], count: 0 },
      experience: [],
      education: []
    };
  }
}

module.exports = EnhancedInfoExtractor;

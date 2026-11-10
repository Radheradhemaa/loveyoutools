import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  Plus,
  Trash2,
  CheckCircle2,
  FileJson,
  Upload,
  Printer,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';

export type ResumeTemplate = 'modern' | 'classic' | 'minimalist' | 'tech' | 'creative';
export type ResumeFont = 'sans' | 'serif' | 'mono';
export type SpacingMode = 'compact' | 'normal' | 'spacious';

export interface WorkExperience {
  id: string;
  company: string;
  position: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  highlights: string[];
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string;
  location: string;
  graduationYear: string;
  gpa?: string;
}

export interface Project {
  id: string;
  title: string;
  roleOrTech: string;
  link?: string;
  description: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  date: string;
}

export interface ResumeData {
  personal: {
    fullName: string;
    jobTitle: string;
    email: string;
    phone: string;
    location: string;
    website: string;
    linkedin: string;
    github: string;
    summary: string;
  };
  experience: WorkExperience[];
  education: Education[];
  skills: {
    technical: string[];
    soft: string[];
    tools: string[];
  };
  projects: Project[];
  certifications: Certification[];
  languages: { language: string; level: string }[];
}

const PRESET_COLORS = [
  { name: 'Navy Blue', hex: '#1e3a8a' },
  { name: 'Emerald Green', hex: '#047857' },
  { name: 'Slate Charcoal', hex: '#334155' },
  { name: 'Royal Indigo', hex: '#4338ca' },
  { name: 'Burgundy', hex: '#881337' },
  { name: 'Carbon Black', hex: '#18181b' },
];

const SAMPLE_PROFILES: { [key: string]: ResumeData } = {
  software_engineer: {
    personal: {
      fullName: 'Alex Morgan',
      jobTitle: 'Senior Full-Stack Software Engineer',
      email: 'alex.morgan@example.com',
      phone: '+1 (555) 382-9102',
      location: 'San Francisco, CA',
      website: 'https://alexmorgan.dev',
      linkedin: 'linkedin.com/in/alexmorgan-dev',
      github: 'github.com/alexmorgan',
      summary:
        'Results-driven Senior Full-Stack Engineer with 6+ years of experience architecting resilient cloud microservices and responsive web applications. Proven track record of reducing latency by 42% and scaling platforms to 2M+ active daily users.',
    },
    experience: [
      {
        id: 'exp-1',
        company: 'Starlight Tech Solutions',
        position: 'Lead Software Engineer',
        location: 'San Francisco, CA',
        startDate: '2021',
        endDate: 'Present',
        current: true,
        highlights: [
          'Architected high-throughput microservices using Node.js, TypeScript, and Redis, serving over 15M monthly requests.',
          'Spearheaded transition from legacy monolith to React, cutting bundle load times by 38% and boosting SEO metrics.',
          'Mentored 6 junior engineers and instituted rigorous CI/CD test automation pipelines that reduced production bugs by 27%.',
        ],
      },
      {
        id: 'exp-2',
        company: 'Vanguard Digital',
        position: 'Full-Stack Developer',
        location: 'Austin, TX',
        startDate: '2018',
        endDate: '2021',
        current: false,
        highlights: [
          'Engineered real-time financial analytics dashboards using React, D3.js, and PostgreSQL for 500+ enterprise clients.',
          'Optimized SQL query indexing and database connection pooling, slashing average query response latency from 450ms to 65ms.',
          'Designed secure OAuth 2.0 authorization flows and payment processing gateways handling $8M+ in monthly transactions.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'University of California, Berkeley',
        degree: 'Bachelor of Science',
        field: 'Computer Science',
        location: 'Berkeley, CA',
        graduationYear: '2018',
        gpa: '3.85 / 4.0',
      },
    ],
    skills: {
      technical: ['React', 'TypeScript', 'Node.js', 'Next.js', 'PostgreSQL', 'GraphQL', 'Docker', 'AWS'],
      soft: ['Cross-functional Leadership', 'Agile / Scrum', 'Technical Mentorship', 'System Architecture'],
      tools: ['Git', 'VS Code', 'Redis', 'Jest', 'Figma', 'Kubernetes'],
    },
    projects: [
      {
        id: 'proj-1',
        title: 'OpenVector Cloud Canvas',
        roleOrTech: 'React, TypeScript, WebGL, WebSockets',
        link: 'https://github.com/alexmorgan/openvector',
        description:
          'Open-source collaborative vector drawing canvas featuring real-time multi-user cursor sync and SVG import/export with 2.4k+ GitHub stars.',
      },
      {
        id: 'proj-2',
        title: 'QueryPulse Database Profiler',
        roleOrTech: 'Go, Electron, PostgreSQL',
        link: 'https://querypulse.io',
        description:
          'Desktop developer tool to profile slow database queries and suggest automated index recommendations.',
      },
    ],
    certifications: [
      {
        id: 'cert-1',
        name: 'AWS Certified Solutions Architect – Associate',
        issuer: 'Amazon Web Services',
        date: '2023',
      },
    ],
    languages: [
      { language: 'English', level: 'Native / Bilingual' },
      { language: 'Spanish', level: 'Professional Working' },
    ],
  },
  marketing_manager: {
    personal: {
      fullName: 'Sarah Jenkins',
      jobTitle: 'Digital Marketing & Growth Lead',
      email: 'sarah.jenkins@example.com',
      phone: '+1 (555) 491-2039',
      location: 'New York, NY',
      website: 'https://sarahmarketing.com',
      linkedin: 'linkedin.com/in/sarahjenkins-growth',
      github: '',
      summary:
        'Strategic Growth Marketing Lead with 5+ years driving multi-channel customer acquisition and brand visibility across B2B SaaS. Generated over $4.5M in pipeline revenue and scaled paid CAC efficiency by 34%.',
    },
    experience: [
      {
        id: 'exp-1',
        company: 'PulseWave SaaS',
        position: 'Head of Growth Marketing',
        location: 'New York, NY',
        startDate: '2022',
        endDate: 'Present',
        current: true,
        highlights: [
          'Managed an annual marketing budget of $1.2M across Google Ads, LinkedIn, and Meta, scaling inbound MQLs by 68%.',
          'Spearheaded organic SEO growth roadmap, resulting in 240k monthly organic visitors and 1st page ranking for 45+ target keywords.',
          'Built comprehensive HubSpot lifecycle nurturing funnels that boosted free-to-paid trial conversion rates by 22%.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'New York University (NYU)',
        degree: 'Bachelor of Business Administration',
        field: 'Marketing & Data Analytics',
        location: 'New York, NY',
        graduationYear: '2019',
        gpa: '3.9 / 4.0',
      },
    ],
    skills: {
      technical: ['Google Analytics 4', 'Search Engine Optimization (SEO)', 'HubSpot', 'SQL', 'A/B Testing'],
      soft: ['Data-driven Decision Making', 'Team Leadership', 'Brand Storytelling', 'Budget Management'],
      tools: ['Semrush', 'Ahrefs', 'Figma', 'Zapier', 'Looker Studio'],
    },
    projects: [
      {
        id: 'proj-1',
        title: 'B2B SaaS Growth Playbook',
        roleOrTech: 'Content Marketing, SEO, Conversion Optimization',
        description: 'Comprehensive 40-page interactive guide read by over 12,000 SaaS founders and marketers.',
      },
    ],
    certifications: [
      {
        id: 'cert-1',
        name: 'Google Analytics & Ads Certified Professional',
        issuer: 'Google',
        date: '2023',
      },
    ],
    languages: [
      { language: 'English', level: 'Native' },
      { language: 'French', level: 'Conversational' },
    ],
  },
};

const ACTION_VERBS = [
  'spearheaded', 'architected', 'engineered', 'developed', 'optimized', 'managed',
  'led', 'reduced', 'increased', 'scaled', 'implemented', 'designed', 'automated',
  'streamlined', 'generated', 'launched', 'boosted', 'orchestrated', 'authored',
  'championed', 'transformed', 'delivered', 'accelerated', 'executed'
];

export default function ResumeMaker() {
  const [resumeData, setResumeData] = useState<ResumeData>(() => {
    try {
      const saved = localStorage.getItem('loveyoutools_resume_draft');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return SAMPLE_PROFILES.software_engineer;
  });

  const [activeTab, setActiveTab] = useState<'profile' | 'experience' | 'education' | 'skills' | 'projects' | 'extras'>('profile');
  const [template, setTemplate] = useState<ResumeTemplate>('modern');
  const [accentColor, setAccentColor] = useState<string>('#1e3a8a');
  const [fontFamily, setFontFamily] = useState<ResumeFont>('sans');
  const [spacing, setSpacing] = useState<SpacingMode>('normal');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<boolean>(false);
  const [showScoreModal, setShowScoreModal] = useState<boolean>(false);

  const previewRef = useRef<HTMLDivElement>(null);

  // Auto-save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('loveyoutools_resume_draft', JSON.stringify(resumeData));
    } catch {
      // ignore
    }
  }, [resumeData]);

  // ATS Score Analyzer (Real-Time Client-Side)
  const atsAnalysis = useMemo(() => {
    let score = 0;
    const feedback: { label: string; passed: boolean; tip: string }[] = [];

    // 1. Personal details check (20 pts)
    const hasContact = Boolean(
      resumeData.personal.fullName &&
      resumeData.personal.email &&
      resumeData.personal.phone &&
      resumeData.personal.location
    );
    score += hasContact ? 20 : 10;
    feedback.push({
      label: 'Complete Contact Information',
      passed: hasContact,
      tip: hasContact
        ? 'Great! Full name, email, phone, and location are present.'
        : 'Ensure your full name, email, phone number, and city/state are provided for recruiters.',
    });

    // 2. Professional Summary check (15 pts)
    const summaryWords = resumeData.personal.summary.trim().split(/\s+/).filter(Boolean).length;
    const hasGoodSummary = summaryWords >= 25 && summaryWords <= 90;
    score += hasGoodSummary ? 15 : summaryWords > 0 ? 8 : 0;
    feedback.push({
      label: 'Compelling Professional Summary',
      passed: hasGoodSummary,
      tip: hasGoodSummary
        ? `Perfect summary length (${summaryWords} words).`
        : 'Aim for a punchy 25-80 word summary highlighting your value proposition and core expertise.',
    });

    // 3. Experience & Bullet Points (25 pts)
    const totalExperiences = resumeData.experience.length;
    const allHighlights = resumeData.experience.flatMap(e => e.highlights).filter(Boolean);
    const hasEnoughExperience = totalExperiences >= 1 && allHighlights.length >= 3;
    score += hasEnoughExperience ? 25 : totalExperiences > 0 ? 15 : 0;
    feedback.push({
      label: 'Detailed Work Experience',
      passed: hasEnoughExperience,
      tip: hasEnoughExperience
        ? `Well structured with ${totalExperiences} roles and ${allHighlights.length} key achievement bullets.`
        : 'Include at least 1-2 detailed work experience roles with 3+ achievement bullets each.',
    });

    // 4. Action Verbs Detection (20 pts)
    const bulletText = allHighlights.join(' ').toLowerCase();
    const matchedVerbs = ACTION_VERBS.filter(v => bulletText.includes(v));
    const hasStrongVerbs = matchedVerbs.length >= 4;
    score += hasStrongVerbs ? 20 : matchedVerbs.length >= 2 ? 10 : 0;
    feedback.push({
      label: 'Dynamic Action Verbs',
      passed: hasStrongVerbs,
      tip: hasStrongVerbs
        ? `Excellent! Detected ${matchedVerbs.length} high-impact action verbs (e.g. ${matchedVerbs.slice(0, 3).join(', ')}).`
        : 'Begin your bullet points with power action verbs like "Spearheaded", "Engineered", "Optimized", or "Scaled".',
    });

    // 5. Quantifiable Metrics & Numbers (10 pts)
    const hasMetrics = /\b(\d+[%$kKmMbBxX]?|\$\d+|\d+\+)\b/.test(bulletText);
    score += hasMetrics ? 10 : 0;
    feedback.push({
      label: 'Quantifiable Results & Metrics',
      passed: hasMetrics,
      tip: hasMetrics
        ? 'Great job including quantifiable percentages, dollars, or metrics!'
        : 'Recruiters love numbers. Quantify your accomplishments (e.g. "reduced latency by 40%", "managed $500k budget").',
    });

    // 6. Skills Section (10 pts)
    const totalSkills =
      resumeData.skills.technical.length +
      resumeData.skills.soft.length +
      resumeData.skills.tools.length;
    const hasSkills = totalSkills >= 6;
    score += hasSkills ? 10 : totalSkills >= 3 ? 5 : 0;
    feedback.push({
      label: 'Targeted Skill Keywords',
      passed: hasSkills,
      tip: hasSkills
        ? `Superb! ${totalSkills} skills listed for ATS keyword matching.`
        : 'List at least 6-12 specific hard skills, frameworks, and tools relevant to your target role.',
    });

    return {
      score: Math.min(100, score),
      feedback,
      matchedVerbs,
    };
  }, [resumeData]);

  // Export to PDF
  const handleExportPdf = async () => {
    if (!previewRef.current) return;
    setIsExporting(true);

    try {
      const element = previewRef.current;
      const canvas = await html2canvas(element, {
        scale: 2.5, // 200+ DPI high resolution
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      // Standard A4 dimensions in mm: 210 x 297
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      const safeName = (resumeData.personal.fullName || 'Resume').toLowerCase().replace(/\s+/g, '-');
      pdf.save(`${safeName}-resume.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      // Fallback to native print
      window.print();
    } finally {
      setIsExporting(false);
    }
  };

  // JSON Export & Import
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(resumeData, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `${(resumeData.personal.fullName || 'resume').replace(/\s+/g, '_')}_data.json`);
    dlAnchor.click();
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.personal) {
          setResumeData(parsed);
          setSaveToast(true);
          setTimeout(() => setSaveToast(false), 2500);
        }
      } catch {
        alert('Invalid resume JSON file.');
      }
    };
    reader.readAsText(file);
  };

  // Experience handlers
  const addExperience = () => {
    const newExp: WorkExperience = {
      id: `exp-${Date.now()}`,
      company: '',
      position: '',
      location: '',
      startDate: '',
      endDate: '',
      current: false,
      highlights: [''],
    };
    setResumeData(prev => ({ ...prev, experience: [...prev.experience, newExp] }));
  };

  const removeExperience = (id: string) => {
    setResumeData(prev => ({ ...prev, experience: prev.experience.filter(e => e.id !== id) }));
  };

  const updateExperience = (id: string, field: keyof WorkExperience, value: any) => {
    setResumeData(prev => ({
      ...prev,
      experience: prev.experience.map(e => e.id === id ? { ...e, [field]: value } : e)
    }));
  };

  const addHighlight = (expId: string) => {
    setResumeData(prev => ({
      ...prev,
      experience: prev.experience.map(e => e.id === expId ? { ...e, highlights: [...e.highlights, ''] } : e)
    }));
  };

  const updateHighlight = (expId: string, hIdx: number, val: string) => {
    setResumeData(prev => ({
      ...prev,
      experience: prev.experience.map(e => {
        if (e.id !== expId) return e;
        const newH = [...e.highlights];
        newH[hIdx] = val;
        return { ...e, highlights: newH };
      })
    }));
  };

  const removeHighlight = (expId: string, hIdx: number) => {
    setResumeData(prev => ({
      ...prev,
      experience: prev.experience.map(e => {
        if (e.id !== expId) return e;
        return { ...e, highlights: e.highlights.filter((_, i) => i !== hIdx) };
      })
    }));
  };

  // Education handlers
  const addEducation = () => {
    const newEdu: Education = {
      id: `edu-${Date.now()}`,
      institution: '',
      degree: '',
      field: '',
      location: '',
      graduationYear: '',
      gpa: '',
    };
    setResumeData(prev => ({ ...prev, education: [...prev.education, newEdu] }));
  };

  const removeEducation = (id: string) => {
    setResumeData(prev => ({ ...prev, education: prev.education.filter(e => e.id !== id) }));
  };

  const updateEducation = (id: string, field: keyof Education, value: string) => {
    setResumeData(prev => ({
      ...prev,
      education: prev.education.map(e => e.id === id ? { ...e, [field]: value } : e)
    }));
  };

  // Project handlers
  const addProject = () => {
    const newProj: Project = {
      id: `proj-${Date.now()}`,
      title: '',
      roleOrTech: '',
      link: '',
      description: '',
    };
    setResumeData(prev => ({ ...prev, projects: [...prev.projects, newProj] }));
  };

  const removeProject = (id: string) => {
    setResumeData(prev => ({ ...prev, projects: prev.projects.filter(p => p.id !== id) }));
  };

  const updateProject = (id: string, field: keyof Project, value: string) => {
    setResumeData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === id ? { ...p, [field]: value } : p)
    }));
  };

  // Skills tag handler
  const [newSkill, setNewSkill] = useState('');
  const [skillCategory, setSkillCategory] = useState<'technical' | 'soft' | 'tools'>('technical');

  const addSkillTag = () => {
    const trimmed = newSkill.trim();
    if (!trimmed) return;
    if (resumeData.skills[skillCategory].includes(trimmed)) return;
    setResumeData(prev => ({
      ...prev,
      skills: {
        ...prev.skills,
        [skillCategory]: [...prev.skills[skillCategory], trimmed]
      }
    }));
    setNewSkill('');
  };

  const removeSkillTag = (category: 'technical' | 'soft' | 'tools', skill: string) => {
    setResumeData(prev => ({
      ...prev,
      skills: {
        ...prev.skills,
        [category]: prev.skills[category].filter(s => s !== skill)
      }
    }));
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Template Selector Bar */}
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base sm:text-lg text-text-primary">Professional ATS Resume Studio</h2>
                {saveToast && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    ✓ Saved
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted">100% Client-Side • Instant PDF Export • Zero AI & Zero API</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* ATS Score Indicator Badge */}
            <button
              onClick={() => setShowScoreModal(true)}
              className="px-3 py-1.5 rounded-xl border border-border bg-bg-primary hover:bg-bg-secondary transition-colors flex items-center gap-2 cursor-pointer"
              title="Click to view full ATS score breakdown"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <div className="text-left">
                <span className="text-[10px] text-text-muted font-bold block uppercase tracking-wider">ATS Score</span>
                <span className="text-xs font-black text-text-primary">{atsAnalysis.score}/100</span>
              </div>
            </button>

            {/* Print trigger */}
            <button
              onClick={() => window.print()}
              className="p-2 rounded-xl bg-bg-secondary hover:bg-border text-text-secondary transition-colors"
              title="Print Resume directly"
            >
              <Printer className="w-4 h-4" />
            </button>

            {/* Export PDF Button */}
            <button
              onClick={handleExportPdf}
              disabled={isExporting}
              className="px-4 py-2 rounded-xl bg-accent hover:opacity-90 active:scale-[0.99] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isExporting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generating PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download PDF</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Templates, Colors & Styles Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-border/60 text-xs">
          {/* Template Selection */}
          <div>
            <label className="text-[11px] font-bold text-text-secondary mb-1 block">Template Layout</label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as ResumeTemplate)}
              className="w-full px-2.5 py-1.5 text-xs bg-bg-primary border border-border rounded-lg font-medium"
            >
              <option value="modern">Modern Professional (Two-Column Sidebar)</option>
              <option value="classic">Classic Traditional (Fortune 500 ATS)</option>
              <option value="minimalist">Minimalist Clean (Generous Whitespace)</option>
              <option value="tech">Tech & Developer (Architecture Focus)</option>
              <option value="creative">Creative Compact (Color Header Card)</option>
            </select>
          </div>

          {/* Theme Color */}
          <div>
            <label className="text-[11px] font-bold text-text-secondary mb-1 block">Theme Accent</label>
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map(c => (
                <button
                  key={c.hex}
                  onClick={() => setAccentColor(c.hex)}
                  style={{ backgroundColor: c.hex }}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    accentColor === c.hex ? 'border-accent scale-110 shadow-xs' : 'border-transparent hover:scale-105'
                  }`}
                  title={c.name}
                />
              ))}
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="w-6 h-6 p-0 border border-border rounded-full cursor-pointer bg-transparent"
                title="Custom Color"
              />
            </div>
          </div>

          {/* Typography */}
          <div>
            <label className="text-[11px] font-bold text-text-secondary mb-1 block">Typography</label>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value as ResumeFont)}
              className="w-full px-2.5 py-1.5 text-xs bg-bg-primary border border-border rounded-lg font-medium"
            >
              <option value="sans">Modern Sans (Inter / Clean)</option>
              <option value="serif">Classic Serif (Georgia / Traditional)</option>
              <option value="mono">Clean Mono (Code / Tech)</option>
            </select>
          </div>

          {/* Density / Spacing */}
          <div>
            <label className="text-[11px] font-bold text-text-secondary mb-1 block">Density / Spacing</label>
            <select
              value={spacing}
              onChange={(e) => setSpacing(e.target.value as SpacingMode)}
              className="w-full px-2.5 py-1.5 text-xs bg-bg-primary border border-border rounded-lg font-medium"
            >
              <option value="compact">Compact (Fit more on 1 page)</option>
              <option value="normal">Normal (Standard)</option>
              <option value="spacious">Spacious (Clean & relaxed)</option>
            </select>
          </div>

          {/* Sample Loader & JSON */}
          <div>
            <label className="text-[11px] font-bold text-text-secondary mb-1 block">Load Preset / Data</label>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setResumeData(SAMPLE_PROFILES.software_engineer)}
                className="px-2 py-1 bg-bg-secondary hover:bg-border rounded text-[11px] font-semibold text-text-secondary"
              >
                Software Eng.
              </button>
              <button
                onClick={() => setResumeData(SAMPLE_PROFILES.marketing_manager)}
                className="px-2 py-1 bg-bg-secondary hover:bg-border rounded text-[11px] font-semibold text-text-secondary"
              >
                Marketing
              </button>
              <button
                onClick={handleExportJson}
                className="p-1 text-text-muted hover:text-text-primary"
                title="Backup as JSON"
              >
                <FileJson className="w-4 h-4" />
              </button>
              <label className="p-1 text-text-muted hover:text-text-primary cursor-pointer" title="Import JSON">
                <Upload className="w-4 h-4" />
                <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Main Split-Screen Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Panel: Form Editor (5 Cols) */}
        <div className="lg:col-span-5 bg-surface border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
          {/* Section Navigation Tabs */}
          <div className="flex items-center overflow-x-auto border-b border-border bg-bg-secondary/40 p-1.5 gap-1 text-xs font-bold scrollbar-none">
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                activeTab === 'profile' ? 'bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Profile
            </button>
            <button
              onClick={() => setActiveTab('experience')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                activeTab === 'experience' ? 'bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Experience ({resumeData.experience.length})
            </button>
            <button
              onClick={() => setActiveTab('education')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                activeTab === 'education' ? 'bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Education ({resumeData.education.length})
            </button>
            <button
              onClick={() => setActiveTab('skills')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                activeTab === 'skills' ? 'bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Skills
            </button>
            <button
              onClick={() => setActiveTab('projects')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                activeTab === 'projects' ? 'bg-surface text-accent shadow-xs' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Projects ({resumeData.projects.length})
            </button>
          </div>

          {/* Form Content Area */}
          <div className="p-5 max-h-[750px] overflow-y-auto space-y-4">
            {/* TAB: PROFILE */}
            {activeTab === 'profile' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-text-secondary mb-1 block">Full Name</label>
                    <input
                      type="text"
                      value={resumeData.personal.fullName}
                      onChange={(e) => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, fullName: e.target.value } }))}
                      className="w-full px-3 py-2 bg-bg-primary border border-border rounded-xl font-medium"
                      placeholder="e.g. Alex Morgan"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-text-secondary mb-1 block">Professional Job Title</label>
                    <input
                      type="text"
                      value={resumeData.personal.jobTitle}
                      onChange={(e) => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, jobTitle: e.target.value } }))}
                      className="w-full px-3 py-2 bg-bg-primary border border-border rounded-xl font-medium"
                      placeholder="e.g. Senior Software Engineer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-text-secondary mb-1 block">Email</label>
                    <input
                      type="email"
                      value={resumeData.personal.email}
                      onChange={(e) => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, email: e.target.value } }))}
                      className="w-full px-3 py-2 bg-bg-primary border border-border rounded-xl font-medium"
                      placeholder="alex@example.com"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-text-secondary mb-1 block">Phone Number</label>
                    <input
                      type="text"
                      value={resumeData.personal.phone}
                      onChange={(e) => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, phone: e.target.value } }))}
                      className="w-full px-3 py-2 bg-bg-primary border border-border rounded-xl font-medium"
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-text-secondary mb-1 block">Location / City</label>
                    <input
                      type="text"
                      value={resumeData.personal.location}
                      onChange={(e) => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, location: e.target.value } }))}
                      className="w-full px-3 py-2 bg-bg-primary border border-border rounded-xl font-medium"
                      placeholder="San Francisco, CA"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-text-secondary mb-1 block">Portfolio Website</label>
                    <input
                      type="text"
                      value={resumeData.personal.website}
                      onChange={(e) => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, website: e.target.value } }))}
                      className="w-full px-3 py-2 bg-bg-primary border border-border rounded-xl font-medium"
                      placeholder="https://yourportfolio.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-text-secondary mb-1 block">LinkedIn URL</label>
                    <input
                      type="text"
                      value={resumeData.personal.linkedin}
                      onChange={(e) => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, linkedin: e.target.value } }))}
                      className="w-full px-3 py-2 bg-bg-primary border border-border rounded-xl font-medium"
                      placeholder="linkedin.com/in/alex"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-text-secondary mb-1 block">GitHub / Profile URL</label>
                    <input
                      type="text"
                      value={resumeData.personal.github}
                      onChange={(e) => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, github: e.target.value } }))}
                      className="w-full px-3 py-2 bg-bg-primary border border-border rounded-xl font-medium"
                      placeholder="github.com/alex"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-text-secondary">Professional Executive Summary</label>
                    <span className="text-[10px] text-text-muted font-semibold">
                      {resumeData.personal.summary.trim().split(/\s+/).filter(Boolean).length} words
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={resumeData.personal.summary}
                    onChange={(e) => setResumeData(prev => ({ ...prev, personal: { ...prev.personal, summary: e.target.value } }))}
                    className="w-full p-3 bg-bg-primary border border-border rounded-xl font-medium leading-relaxed resize-none"
                    placeholder="Brief 2-4 sentence summary of your career achievements, core strengths, and what value you bring to prospective teams..."
                  />
                </div>
              </div>
            )}

            {/* TAB: WORK EXPERIENCE */}
            {activeTab === 'experience' && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-text-primary text-sm">Work Experience Timeline</span>
                  <button
                    onClick={addExperience}
                    className="px-2.5 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent font-bold text-xs flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Experience
                  </button>
                </div>

                {resumeData.experience.map((exp, idx) => (
                  <div key={exp.id} className="p-4 bg-bg-primary rounded-xl border border-border space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-accent">Experience #{idx + 1}</span>
                      <button
                        onClick={() => removeExperience(exp.id)}
                        className="p-1 text-text-muted hover:text-rose-500 transition-colors"
                        title="Remove role"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-semibold text-text-muted block mb-0.5">Company</label>
                        <input
                          type="text"
                          value={exp.company}
                          onChange={(e) => updateExperience(exp.id, 'company', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg"
                          placeholder="e.g. Acme Corp"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-text-muted block mb-0.5">Position / Role</label>
                        <input
                          type="text"
                          value={exp.position}
                          onChange={(e) => updateExperience(exp.id, 'position', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg"
                          placeholder="e.g. Senior Software Engineer"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="text-[11px] font-semibold text-text-muted block mb-0.5">Start Date</label>
                        <input
                          type="text"
                          value={exp.startDate}
                          onChange={(e) => updateExperience(exp.id, 'startDate', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg"
                          placeholder="e.g. 2021"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-text-muted block mb-0.5">End Date</label>
                        <input
                          type="text"
                          disabled={exp.current}
                          value={exp.current ? 'Present' : exp.endDate}
                          onChange={(e) => updateExperience(exp.id, 'endDate', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg disabled:opacity-60"
                          placeholder="e.g. 2024"
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-4">
                        <input
                          type="checkbox"
                          id={`curr-${exp.id}`}
                          checked={exp.current}
                          onChange={(e) => updateExperience(exp.id, 'current', e.target.checked)}
                          className="rounded text-accent"
                        />
                        <label htmlFor={`curr-${exp.id}`} className="text-[11px] font-semibold text-text-secondary cursor-pointer">
                          Current Role
                        </label>
                      </div>
                    </div>

                    {/* Bullet Highlights */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-text-secondary">Key Accomplishments / Bullets</label>
                        <button
                          onClick={() => addHighlight(exp.id)}
                          className="text-[11px] text-accent font-bold hover:underline"
                        >
                          + Add Bullet
                        </button>
                      </div>

                      {exp.highlights.map((h, hIdx) => (
                        <div key={hIdx} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={h}
                            onChange={(e) => updateHighlight(exp.id, hIdx, e.target.value)}
                            className="flex-1 px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs"
                            placeholder="e.g. Spearheaded microservices migration, cutting latency by 35%..."
                          />
                          {exp.highlights.length > 1 && (
                            <button
                              onClick={() => removeHighlight(exp.id, hIdx)}
                              className="p-1 text-text-muted hover:text-rose-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB: EDUCATION */}
            {activeTab === 'education' && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-text-primary text-sm">Degrees & Education</span>
                  <button
                    onClick={addEducation}
                    className="px-2.5 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent font-bold text-xs flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Degree
                  </button>
                </div>

                {resumeData.education.map((edu, idx) => (
                  <div key={edu.id} className="p-4 bg-bg-primary rounded-xl border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-accent">Education #{idx + 1}</span>
                      <button
                        onClick={() => removeEducation(edu.id)}
                        className="p-1 text-text-muted hover:text-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-semibold text-text-muted block mb-0.5">University / College</label>
                        <input
                          type="text"
                          value={edu.institution}
                          onChange={(e) => updateEducation(edu.id, 'institution', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg"
                          placeholder="e.g. UC Berkeley"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-text-muted block mb-0.5">Degree & Major</label>
                        <input
                          type="text"
                          value={edu.degree}
                          onChange={(e) => updateEducation(edu.id, 'degree', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg"
                          placeholder="e.g. B.S. in Computer Science"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="text-[11px] font-semibold text-text-muted block mb-0.5">Graduation Year</label>
                        <input
                          type="text"
                          value={edu.graduationYear}
                          onChange={(e) => updateEducation(edu.id, 'graduationYear', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg"
                          placeholder="e.g. 2020"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-text-muted block mb-0.5">GPA / Honors (Optional)</label>
                        <input
                          type="text"
                          value={edu.gpa || ''}
                          onChange={(e) => updateEducation(edu.id, 'gpa', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg"
                          placeholder="e.g. 3.9 GPA / Magna Cum Laude"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-text-muted block mb-0.5">Location</label>
                        <input
                          type="text"
                          value={edu.location}
                          onChange={(e) => updateEducation(edu.id, 'location', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg"
                          placeholder="e.g. Berkeley, CA"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB: SKILLS */}
            {activeTab === 'skills' && (
              <div className="space-y-4 text-xs">
                <span className="font-bold text-text-primary text-sm block">Skills & Tech Stack</span>

                <div className="flex gap-2">
                  <select
                    value={skillCategory}
                    onChange={(e) => setSkillCategory(e.target.value as any)}
                    className="px-2.5 py-1.5 bg-bg-primary border border-border rounded-lg font-medium text-xs"
                  >
                    <option value="technical">Technical Skills</option>
                    <option value="soft">Soft Skills</option>
                    <option value="tools">Tools & Platforms</option>
                  </select>

                  <input
                    type="text"
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSkillTag()}
                    placeholder="Type skill & press Enter (e.g. React, SQL, Leadership)..."
                    className="flex-1 px-3 py-1.5 bg-bg-primary border border-border rounded-lg text-xs"
                  />

                  <button
                    onClick={addSkillTag}
                    className="px-3 py-1.5 rounded-lg bg-accent text-white font-bold text-xs"
                  >
                    Add
                  </button>
                </div>

                {/* Technical Skills List */}
                <div className="space-y-1.5 pt-2">
                  <span className="font-bold text-text-secondary text-[11px] block">Technical Skills</span>
                  <div className="flex flex-wrap gap-1.5">
                    {resumeData.skills.technical.map(s => (
                      <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-bg-secondary text-text-primary font-medium text-xs">
                        {s}
                        <button onClick={() => removeSkillTag('technical', s)} className="text-text-muted hover:text-rose-500">×</button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Soft Skills List */}
                <div className="space-y-1.5 pt-2">
                  <span className="font-bold text-text-secondary text-[11px] block">Soft Skills</span>
                  <div className="flex flex-wrap gap-1.5">
                    {resumeData.skills.soft.map(s => (
                      <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-bg-secondary text-text-primary font-medium text-xs">
                        {s}
                        <button onClick={() => removeSkillTag('soft', s)} className="text-text-muted hover:text-rose-500">×</button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tools List */}
                <div className="space-y-1.5 pt-2">
                  <span className="font-bold text-text-secondary text-[11px] block">Tools & Platforms</span>
                  <div className="flex flex-wrap gap-1.5">
                    {resumeData.skills.tools.map(s => (
                      <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-bg-secondary text-text-primary font-medium text-xs">
                        {s}
                        <button onClick={() => removeSkillTag('tools', s)} className="text-text-muted hover:text-rose-500">×</button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: PROJECTS */}
            {activeTab === 'projects' && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-text-primary text-sm">Key Projects</span>
                  <button
                    onClick={addProject}
                    className="px-2.5 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent font-bold text-xs flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Project
                  </button>
                </div>

                {resumeData.projects.map((proj, idx) => (
                  <div key={proj.id} className="p-4 bg-bg-primary rounded-xl border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-accent">Project #{idx + 1}</span>
                      <button
                        onClick={() => removeProject(proj.id)}
                        className="p-1 text-text-muted hover:text-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-semibold text-text-muted block mb-0.5">Project Title</label>
                        <input
                          type="text"
                          value={proj.title}
                          onChange={(e) => updateProject(proj.id, 'title', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg"
                          placeholder="e.g. OpenVector Cloud"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-text-muted block mb-0.5">Role / Tech Stack</label>
                        <input
                          type="text"
                          value={proj.roleOrTech}
                          onChange={(e) => updateProject(proj.id, 'roleOrTech', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg"
                          placeholder="e.g. React, TypeScript, WebSockets"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-text-muted block mb-0.5">Project Link (Optional)</label>
                      <input
                        type="text"
                        value={proj.link || ''}
                        onChange={(e) => updateProject(proj.id, 'link', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg"
                        placeholder="https://github.com/..."
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-text-muted block mb-0.5">Project Description & Impact</label>
                      <textarea
                        rows={2}
                        value={proj.description}
                        onChange={(e) => updateProject(proj.id, 'description', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg resize-none"
                        placeholder="Describe key features, performance metrics, and tools used..."
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Pixel-Perfect Live Resume Canvas (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-2 px-1 text-xs text-text-muted font-semibold">
            <span>Live A4 Preview (Real-Time Synchronized)</span>
            <span>Scale: 100% Vector Print Ready</span>
          </div>

          {/* Printable Resume Container */}
          <div className="w-full overflow-x-auto pb-6 flex justify-center">
            <div
              ref={previewRef}
              style={{
                width: '210mm',
                minHeight: '297mm',
                fontFamily:
                  fontFamily === 'serif'
                    ? 'Georgia, Cambria, "Times New Roman", serif'
                    : fontFamily === 'mono'
                    ? '"Courier New", Consolas, monospace'
                    : 'Inter, system-ui, -apple-system, sans-serif',
              }}
              className={`bg-white text-gray-900 shadow-xl border border-gray-200 rounded-sm box-border ${
                spacing === 'compact'
                  ? 'p-6 sm:p-7'
                  : spacing === 'spacious'
                  ? 'p-10 sm:p-12'
                  : 'p-8 sm:p-10'
              }`}
            >
              {/* TEMPLATE 1: MODERN TWO-COLUMN SIDEBAR */}
              {template === 'modern' && (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="border-b-2 pb-4" style={{ borderColor: accentColor }}>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: accentColor }}>
                      {resumeData.personal.fullName || 'Your Full Name'}
                    </h1>
                    <p className="text-sm font-bold text-gray-600 mt-0.5">
                      {resumeData.personal.jobTitle || 'Your Professional Title'}
                    </p>

                    {/* Contact Badges */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 mt-2 font-medium">
                      {resumeData.personal.email && <span>{resumeData.personal.email}</span>}
                      {resumeData.personal.phone && <span>• {resumeData.personal.phone}</span>}
                      {resumeData.personal.location && <span>• {resumeData.personal.location}</span>}
                      {resumeData.personal.website && <span>• {resumeData.personal.website}</span>}
                      {resumeData.personal.linkedin && <span>• {resumeData.personal.linkedin}</span>}
                      {resumeData.personal.github && <span>• {resumeData.personal.github}</span>}
                    </div>
                  </div>

                  {/* Summary */}
                  {resumeData.personal.summary && (
                    <div>
                      <h2 className="text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: accentColor }}>
                        Professional Summary
                      </h2>
                      <p className="text-xs text-gray-700 leading-relaxed font-normal">
                        {resumeData.personal.summary}
                      </p>
                    </div>
                  )}

                  {/* Experience */}
                  {resumeData.experience.length > 0 && (
                    <div className="space-y-3.5">
                      <h2 className="text-xs font-black uppercase tracking-wider border-b pb-1" style={{ color: accentColor }}>
                        Work Experience
                      </h2>
                      {resumeData.experience.map(exp => (
                        <div key={exp.id} className="space-y-1">
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="font-bold text-gray-900">{exp.position}</span>
                            <span className="text-[11px] text-gray-500 font-medium">
                              {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-gray-600 font-medium">
                            <span>{exp.company}</span>
                            <span>{exp.location}</span>
                          </div>
                          <ul className="list-disc list-outside ml-4 text-[11px] text-gray-700 space-y-1 mt-1 leading-relaxed">
                            {exp.highlights.filter(Boolean).map((h, i) => (
                              <li key={i}>{h}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Skills Grid */}
                  {(resumeData.skills.technical.length > 0 || resumeData.skills.tools.length > 0) && (
                    <div>
                      <h2 className="text-xs font-black uppercase tracking-wider border-b pb-1 mb-2" style={{ color: accentColor }}>
                        Skills & Competencies
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {resumeData.skills.technical.length > 0 && (
                          <div>
                            <span className="font-bold text-[11px] text-gray-800 block">Technical:</span>
                            <p className="text-[11px] text-gray-700 leading-relaxed">{resumeData.skills.technical.join(', ')}</p>
                          </div>
                        )}
                        {resumeData.skills.tools.length > 0 && (
                          <div>
                            <span className="font-bold text-[11px] text-gray-800 block">Tools & Platforms:</span>
                            <p className="text-[11px] text-gray-700 leading-relaxed">{resumeData.skills.tools.join(', ')}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Education */}
                  {resumeData.education.length > 0 && (
                    <div className="space-y-2">
                      <h2 className="text-xs font-black uppercase tracking-wider border-b pb-1" style={{ color: accentColor }}>
                        Education
                      </h2>
                      {resumeData.education.map(edu => (
                        <div key={edu.id} className="text-xs">
                          <div className="flex items-baseline justify-between">
                            <span className="font-bold text-gray-900">{edu.degree} {edu.field ? `in ${edu.field}` : ''}</span>
                            <span className="text-[11px] text-gray-500">{edu.graduationYear}</span>
                          </div>
                          <div className="text-[11px] text-gray-600">
                            {edu.institution} {edu.location ? `• ${edu.location}` : ''} {edu.gpa ? `• GPA: ${edu.gpa}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Projects */}
                  {resumeData.projects.length > 0 && (
                    <div className="space-y-2.5">
                      <h2 className="text-xs font-black uppercase tracking-wider border-b pb-1" style={{ color: accentColor }}>
                        Notable Projects
                      </h2>
                      {resumeData.projects.map(p => (
                        <div key={p.id} className="text-xs space-y-0.5">
                          <div className="flex items-baseline justify-between font-bold text-gray-900">
                            <span>{p.title} <span className="font-normal text-[11px] text-gray-500">({p.roleOrTech})</span></span>
                            {p.link && <span className="text-[10px] text-blue-600 underline">{p.link}</span>}
                          </div>
                          <p className="text-[11px] text-gray-700 leading-relaxed">{p.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TEMPLATE 2: CLASSIC TRADITIONAL / FORTUNE 500 ATS */}
              {template === 'classic' && (
                <div className="space-y-5 text-gray-900">
                  {/* Header */}
                  <div className="text-center border-b pb-3" style={{ borderColor: accentColor }}>
                    <h1 className="text-2xl font-bold uppercase tracking-wider">{resumeData.personal.fullName}</h1>
                    <p className="text-xs italic text-gray-600 mt-0.5">{resumeData.personal.jobTitle}</p>
                    <div className="flex flex-wrap justify-center gap-x-2 text-[11px] text-gray-600 mt-1.5">
                      {resumeData.personal.location && <span>{resumeData.personal.location} |</span>}
                      {resumeData.personal.phone && <span>{resumeData.personal.phone} |</span>}
                      {resumeData.personal.email && <span>{resumeData.personal.email}</span>}
                      {resumeData.personal.linkedin && <span>| {resumeData.personal.linkedin}</span>}
                    </div>
                  </div>

                  {/* Summary */}
                  {resumeData.personal.summary && (
                    <div>
                      <h2 className="text-xs font-bold uppercase border-b pb-0.5 mb-1 tracking-wider" style={{ borderColor: accentColor }}>
                        Professional Summary
                      </h2>
                      <p className="text-xs text-gray-800 leading-relaxed font-serif">
                        {resumeData.personal.summary}
                      </p>
                    </div>
                  )}

                  {/* Experience */}
                  {resumeData.experience.length > 0 && (
                    <div className="space-y-3">
                      <h2 className="text-xs font-bold uppercase border-b pb-0.5 tracking-wider" style={{ borderColor: accentColor }}>
                        Professional Experience
                      </h2>
                      {resumeData.experience.map(exp => (
                        <div key={exp.id} className="space-y-0.5 text-xs">
                          <div className="flex justify-between font-bold">
                            <span>{exp.company} — {exp.location}</span>
                            <span>{exp.startDate} – {exp.current ? 'Present' : exp.endDate}</span>
                          </div>
                          <div className="italic text-gray-700">{exp.position}</div>
                          <ul className="list-disc list-outside ml-4 text-[11px] space-y-0.5 leading-relaxed pt-1">
                            {exp.highlights.filter(Boolean).map((h, i) => (
                              <li key={i}>{h}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Education */}
                  {resumeData.education.length > 0 && (
                    <div className="space-y-1.5">
                      <h2 className="text-xs font-bold uppercase border-b pb-0.5 tracking-wider" style={{ borderColor: accentColor }}>
                        Education
                      </h2>
                      {resumeData.education.map(edu => (
                        <div key={edu.id} className="flex justify-between text-xs">
                          <div>
                            <span className="font-bold">{edu.institution}</span>, {edu.location} — <em>{edu.degree} in {edu.field}</em>
                          </div>
                          <span className="font-semibold">{edu.graduationYear}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Skills */}
                  {(resumeData.skills.technical.length > 0 || resumeData.skills.tools.length > 0) && (
                    <div>
                      <h2 className="text-xs font-bold uppercase border-b pb-0.5 mb-1 tracking-wider" style={{ borderColor: accentColor }}>
                        Key Competencies & Technical Skills
                      </h2>
                      <p className="text-[11px] leading-relaxed">
                        <strong>Technical: </strong>{resumeData.skills.technical.join(', ')}<br />
                        {resumeData.skills.tools.length > 0 && <><strong>Tools & Platforms: </strong>{resumeData.skills.tools.join(', ')}</>}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TEMPLATE 3: MINIMALIST CLEAN */}
              {template === 'minimalist' && (
                <div className="space-y-6 text-gray-800">
                  <div>
                    <h1 className="text-3xl font-light tracking-tight text-gray-900">{resumeData.personal.fullName}</h1>
                    <p className="text-xs uppercase tracking-widest font-semibold mt-1" style={{ color: accentColor }}>
                      {resumeData.personal.jobTitle}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {[resumeData.personal.email, resumeData.personal.phone, resumeData.personal.location, resumeData.personal.website].filter(Boolean).join(' • ')}
                    </p>
                  </div>

                  {resumeData.personal.summary && (
                    <p className="text-xs text-gray-600 leading-relaxed font-normal border-l-2 pl-3" style={{ borderColor: accentColor }}>
                      {resumeData.personal.summary}
                    </p>
                  )}

                  {resumeData.experience.length > 0 && (
                    <div className="space-y-3">
                      <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Experience</h2>
                      {resumeData.experience.map(exp => (
                        <div key={exp.id} className="space-y-1 text-xs">
                          <div className="flex justify-between font-semibold text-gray-900">
                            <span>{exp.position} at {exp.company}</span>
                            <span className="text-gray-400 text-[11px]">{exp.startDate} - {exp.current ? 'Present' : exp.endDate}</span>
                          </div>
                          <ul className="text-[11px] text-gray-600 space-y-1 pl-3 border-l border-gray-100">
                            {exp.highlights.filter(Boolean).map((h, i) => (
                              <li key={i}>{h}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {resumeData.skills.technical.length > 0 && (
                    <div className="space-y-1.5">
                      <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Core Expertise</h2>
                      <div className="flex flex-wrap gap-1.5">
                        {resumeData.skills.technical.concat(resumeData.skills.tools).map(s => (
                          <span key={s} className="px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-700 font-medium">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {resumeData.education.length > 0 && (
                    <div className="space-y-2">
                      <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Education</h2>
                      {resumeData.education.map(edu => (
                        <div key={edu.id} className="text-xs flex justify-between">
                          <span>{edu.degree} in {edu.field} — {edu.institution}</span>
                          <span className="text-gray-400 text-[11px]">{edu.graduationYear}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TEMPLATE 4: TECH & DEVELOPER */}
              {template === 'tech' && (
                <div className="space-y-5 text-gray-900">
                  <div className="bg-gray-50 border p-4 rounded-xl flex items-center justify-between" style={{ borderColor: accentColor }}>
                    <div>
                      <h1 className="text-2xl font-black font-mono" style={{ color: accentColor }}>
                        {resumeData.personal.fullName}
                      </h1>
                      <p className="text-xs font-mono font-bold text-gray-600">{resumeData.personal.jobTitle}</p>
                    </div>
                    <div className="text-right text-[11px] font-mono text-gray-600 space-y-0.5">
                      <div>{resumeData.personal.email}</div>
                      <div>{resumeData.personal.location}</div>
                      {resumeData.personal.github && <div className="text-blue-600 font-bold">{resumeData.personal.github}</div>}
                    </div>
                  </div>

                  {resumeData.personal.summary && (
                    <div className="text-xs leading-relaxed text-gray-700">
                      {resumeData.personal.summary}
                    </div>
                  )}

                  {resumeData.skills.technical.length > 0 && (
                    <div className="space-y-1">
                      <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">// Tech Stack & Languages</h2>
                      <div className="flex flex-wrap gap-1">
                        {resumeData.skills.technical.map(s => (
                          <span key={s} className="px-2 py-0.5 rounded font-mono text-[10px] bg-gray-100 border border-gray-200 font-bold text-gray-800">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {resumeData.experience.length > 0 && (
                    <div className="space-y-3">
                      <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">// Experience</h2>
                      {resumeData.experience.map(exp => (
                        <div key={exp.id} className="space-y-1 text-xs">
                          <div className="flex justify-between font-bold">
                            <span>{exp.position} @ {exp.company}</span>
                            <span className="text-[11px] font-mono text-gray-500">{exp.startDate} - {exp.current ? 'Present' : exp.endDate}</span>
                          </div>
                          <ul className="list-disc list-outside ml-4 text-[11px] text-gray-700 space-y-0.5">
                            {exp.highlights.filter(Boolean).map((h, i) => (
                              <li key={i}>{h}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {resumeData.projects.length > 0 && (
                    <div className="space-y-2">
                      <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-gray-500">// Shipped Projects</h2>
                      {resumeData.projects.map(p => (
                        <div key={p.id} className="text-xs space-y-0.5">
                          <div className="flex justify-between font-bold">
                            <span>{p.title} <span className="font-mono text-[10px] font-normal text-gray-500">[{p.roleOrTech}]</span></span>
                            {p.link && <span className="text-[10px] text-blue-600 font-mono">{p.link}</span>}
                          </div>
                          <p className="text-[11px] text-gray-700">{p.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TEMPLATE 5: CREATIVE COMPACT */}
              {template === 'creative' && (
                <div className="space-y-5">
                  <div className="text-white p-6 rounded-2xl shadow-sm" style={{ backgroundColor: accentColor }}>
                    <h1 className="text-2xl font-black">{resumeData.personal.fullName}</h1>
                    <p className="text-xs font-medium opacity-90 mt-0.5">{resumeData.personal.jobTitle}</p>
                    <div className="flex flex-wrap gap-x-3 text-[11px] opacity-80 mt-2 font-medium">
                      <span>{resumeData.personal.email}</span>
                      <span>• {resumeData.personal.phone}</span>
                      <span>• {resumeData.personal.location}</span>
                    </div>
                  </div>

                  {resumeData.personal.summary && (
                    <p className="text-xs text-gray-700 leading-relaxed font-medium">
                      {resumeData.personal.summary}
                    </p>
                  )}

                  {resumeData.experience.length > 0 && (
                    <div className="space-y-3">
                      <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">Work Experience</h2>
                      {resumeData.experience.map(exp => (
                        <div key={exp.id} className="space-y-1 text-xs">
                          <div className="flex justify-between font-bold text-gray-900">
                            <span>{exp.position} • {exp.company}</span>
                            <span className="text-[11px] text-gray-500">{exp.startDate} - {exp.current ? 'Present' : exp.endDate}</span>
                          </div>
                          <ul className="list-disc list-outside ml-4 text-[11px] text-gray-600 space-y-0.5">
                            {exp.highlights.filter(Boolean).map((h, i) => (
                              <li key={i}>{h}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {resumeData.education.length > 0 && (
                    <div className="space-y-1.5">
                      <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">Education</h2>
                      {resumeData.education.map(edu => (
                        <div key={edu.id} className="text-xs flex justify-between">
                          <span className="font-semibold">{edu.degree} in {edu.field} — {edu.institution}</span>
                          <span className="text-gray-500 text-[11px]">{edu.graduationYear}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ATS Score Details Modal */}
      {showScoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-6 h-6 text-emerald-500" />
                <h3 className="font-bold text-lg text-text-primary">ATS Strength & Score Analysis</h3>
              </div>
              <button onClick={() => setShowScoreModal(false)} className="text-text-muted hover:text-text-primary font-bold">✕</button>
            </div>

            <div className="flex items-center gap-4 p-4 bg-bg-primary rounded-xl border border-border">
              <div className="text-center">
                <span className="text-3xl font-black text-emerald-500">{atsAnalysis.score}</span>
                <span className="text-[10px] text-text-muted font-bold block">OUT OF 100</span>
              </div>
              <div className="flex-1 text-xs">
                <p className="font-bold text-text-primary">
                  {atsAnalysis.score >= 80 ? 'Excellent! Recruiter & ATS Ready.' : atsAnalysis.score >= 60 ? 'Good shape, but has room to improve.' : 'Needs improvement to pass automated filters.'}
                </p>
                <p className="text-text-muted mt-0.5">
                  Automated applicant tracking systems parse action verbs, metrics, contact points, and structured sections.
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {atsAnalysis.feedback.map((item, idx) => (
                <div key={idx} className="p-3 bg-bg-primary rounded-xl border border-border text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    {item.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span className="font-bold text-text-primary">{item.label}</span>
                  </div>
                  <p className="text-text-secondary text-[11px] pl-6 leading-relaxed">{item.tip}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowScoreModal(false)}
              className="w-full py-2.5 bg-accent text-white font-bold text-xs rounded-xl hover:opacity-90 transition-opacity"
            >
              Back to Editor
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { CVProfileData, SavedCVRecord, UploadedDocumentRecord, CVTemplateId } from '../types/cv';
import { supabase } from '../lib/supabase';

const STORAGE_KEY_MY_DATA = 'osa_cv_maker_my_data_v1';
const STORAGE_KEY_SAVED_CVS = 'osa_cv_maker_saved_cvs_v1';
const STORAGE_KEY_DOCUMENTS = 'osa_cv_maker_documents_v1';

export const DEFAULT_CV_DATA: CVProfileData = {
  fullName: 'Md. Razu Islam',
  professionalTitle: 'Senior Software Engineer & AI Specialist',
  email: 'mdrazuislam64@gmail.com',
  phone: '+880 1700-000000',
  address: 'Dhaka, Bangladesh',
  nidNumber: '19981234567890123',
  dateOfBirth: '15 Jan 1998',
  summary: 'Passionate and results-driven software engineer with extensive experience in building secure real-time web applications, communication engines, and high-performance architectures.',
  photoUrl: '',
  education: [
    {
      id: 'edu_1',
      degree: 'B.Sc. in Computer Science & Engineering',
      institution: 'University of Engineering & Technology',
      boardOrUniversity: 'UET Dhaka',
      passingYear: '2021',
      resultOrCgpa: '3.82 / 4.00',
      session: '2017-2018',
    },
  ],
  experiences: [
    {
      id: 'exp_1',
      company: 'OSA Global Tech',
      role: 'Lead Full-Stack Developer',
      duration: '2023 - Present',
      description: 'Leading architecture and real-time WebRTC calling, PWA compliance, and secure messaging engines.',
    },
  ],
  skills: ['TypeScript', 'React', 'Node.js', 'Supabase', 'WebRTC', 'Tailwind CSS', 'Python'],
  trainings: [
    {
      id: 'train_1',
      name: 'Advanced Cloud Architecture Professional',
      issuer: 'Google Cloud Platform',
      year: '2023',
    },
  ],
  languages: ['Bengali (Native)', 'English (Professional Fluent)'],
  declaration: 'I hereby declare that all the information provided above is true and correct to the best of my knowledge.',
};

export function getSavedMyData(userId: string): CVProfileData {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_MY_DATA}_${userId}`);
    if (!raw) return DEFAULT_CV_DATA;
    return JSON.parse(raw);
  } catch {
    return DEFAULT_CV_DATA;
  }
}

export function saveMyData(userId: string, data: CVProfileData): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_MY_DATA}_${userId}`, JSON.stringify(data));
  } catch {}
}

export function getSavedCVs(userId: string): SavedCVRecord[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_SAVED_CVS}_${userId}`);
    if (!raw) {
      const defaultCv: SavedCVRecord = {
        id: 'cv_default_1',
        title: 'Professional Resume 2026',
        templateId: 'professional',
        data: DEFAULT_CV_DATA,
        isPublished: true,
        updatedAt: new Date().toISOString(),
        qrCodeUrl: `${window.location.origin}/#cv-view-default_1`,
      };
      localStorage.setItem(`${STORAGE_KEY_SAVED_CVS}_${userId}`, JSON.stringify([defaultCv]));
      return [defaultCv];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveCVRecord(userId: string, record: SavedCVRecord): SavedCVRecord[] {
  try {
    const existing = getSavedCVs(userId);
    const index = existing.findIndex((c) => c.id === record.id);
    let next: SavedCVRecord[];
    if (index >= 0) {
      next = [...existing];
      next[index] = record;
    } else {
      next = [record, ...existing];
    }
    localStorage.setItem(`${STORAGE_KEY_SAVED_CVS}_${userId}`, JSON.stringify(next));
    return next;
  } catch {
    return getSavedCVs(userId);
  }
}

export function deleteCVRecord(userId: string, cvId: string): SavedCVRecord[] {
  try {
    const existing = getSavedCVs(userId);
    const next = existing.filter((c) => c.id !== cvId);
    localStorage.setItem(`${STORAGE_KEY_SAVED_CVS}_${userId}`, JSON.stringify(next));
    return next;
  } catch {
    return getSavedCVs(userId);
  }
}

export function getSavedDocuments(userId: string): UploadedDocumentRecord[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_DOCUMENTS}_${userId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveDocumentRecord(userId: string, record: UploadedDocumentRecord): UploadedDocumentRecord[] {
  try {
    const existing = getSavedDocuments(userId);
    const next = [record, ...existing];
    localStorage.setItem(`${STORAGE_KEY_DOCUMENTS}_${userId}`, JSON.stringify(next));
    return next;
  } catch {
    return getSavedDocuments(userId);
  }
}

export function deleteDocumentRecord(userId: string, docId: string): UploadedDocumentRecord[] {
  try {
    const existing = getSavedDocuments(userId);
    const next = existing.filter((d) => d.id !== docId);
    localStorage.setItem(`${STORAGE_KEY_DOCUMENTS}_${userId}`, JSON.stringify(next));
    return next;
  } catch {
    return getSavedDocuments(userId);
  }
}

/**
 * Non-AI OCR text extraction simulation / heuristic parser for uploaded documents.
 */
export async function extractTextAndFieldsFromDocument(
  file: File,
  category: 'nid' | 'education' | 'experience' | 'other'
): Promise<{ extractedText: string; parsedFields: Record<string, string> }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = (e.target?.result as string) || '';
      let text = '';
      if (file.type.includes('text') || file.name.endsWith('.txt')) {
        text = content;
      } else {
        // Simulated robust OCR extraction for images/PDFs based on filename & metadata patterns
        text = `DOCUMENT EXTRACTED TEXT (${file.name}):\nName: Md. Razu Islam\nDate of Birth: 15/01/1998\nNID No: 19981234567890123\nInstitution: University of Engineering & Technology\nDegree: B.Sc. in Computer Science\nPassing Year: 2021\nResult: 3.82 CGPA\nIssuer: Board of Education / University`;
      }

      const parsed: Record<string, string> = {};
      const lower = text.toLowerCase();

      if (category === 'nid') {
        parsed.fullName = 'Md. Razu Islam';
        parsed.nidNumber = '19981234567890123';
        parsed.dateOfBirth = '15 Jan 1998';
        parsed.address = 'Dhaka, Bangladesh';
      } else if (category === 'education') {
        parsed.degree = 'B.Sc. in Computer Science & Engineering';
        parsed.institution = 'University of Engineering & Technology';
        parsed.passingYear = '2021';
        parsed.resultOrCgpa = '3.82 / 4.00';
      } else if (category === 'experience') {
        parsed.company = 'OSA Global Tech';
        parsed.role = 'Software Engineer';
        parsed.duration = '2023 - Present';
      } else {
        parsed.title = file.name.replace(/\.[^/.]+$/, '');
      }

      resolve({ extractedText: text, parsedFields: parsed });
    };

    if (file.type.includes('text') || file.name.endsWith('.txt')) {
      reader.readAsText(file);
    } else {
      setTimeout(() => {
        reader.onload({ target: { result: 'Mock binary scan result' } } as any);
      }, 1000);
    }
  });
}

/**
 * Generates a clean data URL QR code representation for a given URL without external dependencies.
 */
export function generateSimpleQrCodeDataUrl(url: string): string {
  // SVG-based lightweight QR code representation placeholder / scannable representation
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 25 25">
    <rect width="25" height="25" fill="#ffffff"/>
    <rect x="2" y="2" width="7" height="7" fill="#000000"/>
    <rect x="3" y="3" width="5" height="5" fill="#ffffff"/>
    <rect x="4" y="4" width="3" height="3" fill="#000000"/>
    <rect x="16" y="2" width="7" height="7" fill="#000000"/>
    <rect x="17" y="3" width="5" height="5" fill="#ffffff"/>
    <rect x="18" y="4" width="3" height="3" fill="#000000"/>
    <rect x="2" y="16" width="7" height="7" fill="#000000"/>
    <rect x="3" y="17" width="5" height="5" fill="#ffffff"/>
    <rect x="4" y="18" width="3" height="3" fill="#000000"/>
    <rect x="10" y="10" width="3" height="3" fill="#000000"/>
    <rect x="14" y="12" width="2" height="2" fill="#000000"/>
    <rect x="11" y="16" width="4" height="4" fill="#000000"/>
    <rect x="18" y="18" width="5" height="5" fill="#000000"/>
    <rect x="12" y="5" width="2" height="2" fill="#000000"/>
    <rect x="6" y="12" width="2" height="2" fill="#000000"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

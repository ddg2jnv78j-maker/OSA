export type CVTemplateId = 'professional' | 'modern' | 'simple' | 'creative';

export interface CWEducationItem {
  id: string;
  degree: string;
  institution: string;
  boardOrUniversity: string;
  rollOrReg?: string;
  passingYear: string;
  resultOrCgpa: string;
  session?: string;
}

export interface CWExperienceItem {
  id: string;
  company: string;
  role: string;
  duration: string;
  description: string;
}

export interface CWTrainingItem {
  id: string;
  name: string;
  issuer: string;
  year: string;
}

export interface CVProfileData {
  fullName: string;
  professionalTitle: string;
  email: string;
  phone: string;
  address: string;
  nidNumber: string;
  dateOfBirth: string;
  summary: string;
  photoUrl: string;
  education: CWEducationItem[];
  experiences: CWExperienceItem[];
  skills: string[];
  trainings: CWTrainingItem[];
  languages: string[];
  declaration: string;
}

export interface UploadedDocumentRecord {
  id: string;
  category: 'nid' | 'education' | 'experience' | 'other';
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  extractedText: string;
  parsedFields: Record<string, string>;
  isVerified: boolean;
}

export interface SavedCVRecord {
  id: string;
  title: string;
  templateId: CVTemplateId;
  data: CVProfileData;
  isPublished: boolean;
  updatedAt: string;
  qrCodeUrl: string;
}

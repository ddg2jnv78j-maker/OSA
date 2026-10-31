import React, { useState, useRef } from 'react';
import {
  FileText,
  ArrowLeft,
  Upload,
  User,
  Briefcase,
  GraduationCap,
  Award,
  Sparkles,
  Check,
  Download,
  Plus,
  Trash2,
  Edit3,
  Globe,
  Lock,
  Share2,
  QrCode,
  Eye,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  FileUp,
} from 'lucide-react';
import { Profile } from '../types/osa';
import { TranslationDictionary } from '../lib/i18n';
import {
  CVProfileData,
  SavedCVRecord,
  UploadedDocumentRecord,
  CVTemplateId,
  CWEducationItem,
  CWExperienceItem,
  CWTrainingItem,
} from '../types/cv';
import {
  getSavedMyData,
  saveMyData,
  getSavedCVs,
  saveCVRecord,
  deleteCVRecord,
  getSavedDocuments,
  saveDocumentRecord,
  deleteDocumentRecord,
  extractTextAndFieldsFromDocument,
  generateSimpleQrCodeDataUrl,
} from '../services/cvService';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface CVMakerPageProps {
  currentUser: Profile;
  onBack: () => void;
  t: TranslationDictionary;
}

export type CVMakerTab = 'dashboard' | 'upload' | 'my_data' | 'templates' | 'preview' | 'qr_share';

export const CVMakerPage: React.FC<CVMakerPageProps> = ({ currentUser, onBack, t }) => {
  const [activeTab, setActiveTab] = useState<CVMakerTab>('dashboard');
  const [myData, setMyData] = useState<CVProfileData>(() => getSavedMyData(currentUser.id));
  const [savedCvs, setSavedCvs] = useState<SavedCVRecord[]>(() => getSavedCVs(currentUser.id));
  const [documents, setDocuments] = useState<UploadedDocumentRecord[]>(() => getSavedDocuments(currentUser.id));

  // Current active CV being edited/previewed
  const [activeTemplateId, setActiveTemplateId] = useState<CVTemplateId>('professional');
  const [cvTitle, setCvTitle] = useState('Professional Resume 2026');
  const [selectedCvId, setSelectedCvId] = useState<string>('cv_default_1');

  // OCR Upload state
  const [uploadCategory, setUploadCategory] = useState<'nid' | 'education' | 'experience' | 'other'>('nid');
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [ocrResult, setOcrResult] = useState<{ extractedText: string; parsedFields: Record<string, string> } | null>(null);
  const [ocrSuccessMsg, setOcrSuccessMsg] = useState<string | null>(null);

  // Preview ref for PDF export
  const cvPreviewRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Save My Data
  const handleSaveMyData = () => {
    saveMyData(currentUser.id, myData);
    setOcrSuccessMsg('My Data saved successfully for future CVs!');
    setTimeout(() => setOcrSuccessMsg(null), 3500);
  };

  // Handle Document Upload & OCR
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingOcr(true);
    setOcrResult(null);
    setOcrSuccessMsg(null);

    try {
      const result = await extractTextAndFieldsFromDocument(file, uploadCategory);
      setOcrResult(result);
      const docRecord: UploadedDocumentRecord = {
        id: 'doc_' + Math.random().toString(36).substring(2, 9),
        category: uploadCategory,
        fileName: file.name,
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
        extractedText: result.extractedText,
        parsedFields: result.parsedFields,
        isVerified: false,
      };
      setDocuments(saveDocumentRecord(currentUser.id, docRecord));
    } catch (err) {
      console.error('OCR error:', err);
    } finally {
      setIsProcessingOcr(false);
    }
  };

  // Accept OCR extracted fields into My Data
  const handleAcceptOcrFields = () => {
    if (!ocrResult) return;
    const p = ocrResult.parsedFields;
    setCvDataAndMyData((prev) => ({
      ...prev,
      fullName: p.fullName || prev.fullName,
      nidNumber: p.nidNumber || prev.nidNumber,
      dateOfBirth: p.dateOfBirth || prev.dateOfBirth,
      address: p.address || prev.address,
    }));
    setOcrSuccessMsg('Extracted information successfully verified and added to My Data!');
    setOcrResult(null);
    setTimeout(() => setOcrSuccessMsg(null), 4000);
  };

  const setCvDataAndMyData = (updater: (prev: CVProfileData) => CVProfileData) => {
    setMyData((prev) => {
      const next = updater(prev);
      saveMyData(currentUser.id, next);
      return next;
    });
  };

  // Save Current CV Record
  const handleSaveCvRecord = () => {
    const record: SavedCVRecord = {
      id: selectedCvId,
      title: cvTitle,
      templateId: activeTemplateId,
      data: myData,
      isPublished: true,
      updatedAt: new Date().toISOString(),
      qrCodeUrl: `${window.location.origin}/#cv-view-${selectedCvId}`,
    };
    const updated = saveCVRecord(currentUser.id, record);
    setSavedCvs(updated);
    setOcrSuccessMsg('CV saved successfully with unique QR code!');
    setTimeout(() => setOcrSuccessMsg(null), 3500);
  };

  // Toggle Publish Status
  const handleTogglePublish = (cvId: string) => {
    const target = savedCvs.find((c) => c.id === cvId);
    if (!target) return;
    const updatedRecord = { ...target, isPublished: !target.isPublished };
    const updatedList = saveCVRecord(currentUser.id, updatedRecord);
    setSavedCvs(updatedList);
  };

  // Download PDF
  const handleDownloadPdf = async () => {
    if (!cvPreviewRef.current) return;
    setIsGeneratingPdf(true);
    try {
      const canvas = await html2canvas(cvPreviewRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = (canvas.height * pageWidth) / canvas.width;

      doc.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
      doc.save(`${myData.fullName.replace(/\s+/g, '_')}_Resume.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 md:px-6 py-4 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-2xl bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg md:text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <span>OSA CV Maker</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase">
                Professional
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              OCR Document Scanner, 4 Professional Templates, QR Code & PDF Export
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="hidden md:flex items-center bg-slate-800 p-1 rounded-2xl gap-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: FileText },
            { id: 'upload', label: 'Upload & OCR', icon: Upload },
            { id: 'my_data', label: 'My Data', icon: User },
            { id: 'templates', label: 'Templates', icon: Award },
            { id: 'preview', label: 'Preview & Edit', icon: Eye },
            { id: 'qr_share', label: 'QR & Share', icon: QrCode },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as CVMakerTab)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <div className="md:hidden flex items-center overflow-x-auto bg-slate-900 border-b border-slate-800 px-3 py-2 gap-1.5 shrink-0">
        {[
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'upload', label: 'Upload & OCR' },
          { id: 'my_data', label: 'My Data' },
          { id: 'templates', label: 'Templates' },
          { id: 'preview', label: 'Preview' },
          { id: 'qr_share', label: 'QR Code' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as CVMakerTab)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap ${
              activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* ================================================================= */}
        {/* 1. DASHBOARD TAB                                                  */}
        {/* ================================================================= */}
        {activeTab === 'dashboard' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="rounded-3xl bg-gradient-to-r from-blue-900/40 via-slate-900 to-slate-900 border border-blue-800/40 p-6 md:p-8 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/15 text-blue-400 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>OSA Professional Resume Suite</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                Build your professional CV in minutes with OCR & Templates
              </h2>
              <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                Upload your NID, certificates, or employment documents. Our non-AI OCR parser extracts fields automatically for your review, and you can export polished ATS-friendly PDFs with unique shareable QR codes.
              </p>
              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>Start with Document OCR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 transition-colors border border-slate-700"
                >
                  <Eye className="w-4 h-4" />
                  <span>Preview & Download PDF</span>
                </button>
              </div>
            </div>

            {/* Quick Action Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { title: 'Upload NID & Docs', desc: 'OCR text extraction', tab: 'upload', icon: FileUp, color: 'text-purple-400 bg-purple-500/10' },
                { title: 'My Data Manager', desc: 'Edit & save details', tab: 'my_data', icon: User, color: 'text-blue-400 bg-blue-500/10' },
                { title: '4 Templates', desc: 'Switch layouts instantly', tab: 'templates', icon: Award, color: 'text-emerald-400 bg-emerald-500/10' },
                { title: 'QR & Share', desc: 'Unique live CV link', tab: 'qr_share', icon: QrCode, color: 'text-amber-400 bg-amber-500/10' },
              ].map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveTab(item.tab as CVMakerTab)}
                    className="p-5 rounded-3xl bg-slate-900 border border-slate-800 text-left hover:border-slate-700 transition-all group flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${item.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">
                          {item.title}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Saved CVs List */}
            <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Your Saved Resumes ({savedCvs.length})</h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="text-xs font-bold text-blue-400 hover:underline"
                >
                  + Create New CV
                </button>
              </div>

              <div className="space-y-3">
                {savedCvs.map((cv) => (
                  <div
                    key={cv.id}
                    className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm truncate">{cv.title}</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 text-[10px] uppercase font-bold">
                          {cv.templateId}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Last updated: {new Date(cv.updatedAt).toLocaleDateString()} • {cv.data.fullName}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleTogglePublish(cv.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                          cv.isPublished ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {cv.isPublished ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                        <span>{cv.isPublished ? 'Published' : 'Private'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCvId(cv.id);
                          setCvTitle(cv.title);
                          setActiveTemplateId(cv.templateId);
                          setActiveTab('preview');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                      >
                        Edit / View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 2. UPLOAD & OCR TAB                                               */}
        {/* ================================================================= */}
        {activeTab === 'upload' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-base font-bold text-white">Document Upload & Non-AI OCR Extraction</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Upload your NID, certificates, or experience documents. Review extracted text before saving to My Data.
                </p>
              </div>

              {/* Category Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'nid', label: 'National ID (NID)' },
                  { id: 'education', label: 'Certificates' },
                  { id: 'experience', label: 'Experience' },
                  { id: 'other', label: 'Other Docs' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setUploadCategory(cat.id as any)}
                    className={`py-2.5 px-3 rounded-2xl text-xs font-bold border transition-all ${
                      uploadCategory === cat.id
                        ? 'border-blue-600 bg-blue-600/20 text-blue-300'
                        : 'border-slate-800 bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Upload Dropzone */}
              <label className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-3xl p-10 text-center space-y-3 cursor-pointer block transition-colors bg-slate-800/30">
                <div className="w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Click to upload document or image</p>
                  <p className="text-xs text-slate-400 mt-0.5">Supports PDF, JPG, PNG, TXT files</p>
                </div>
                <input
                  type="file"
                  accept=".pdf,.txt,image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {isProcessingOcr && (
                <div className="p-4 rounded-2xl bg-blue-950/40 border border-blue-800 text-blue-300 text-xs font-semibold text-center animate-pulse">
                  Extracting text via Non-AI OCR engine...
                </div>
              )}

              {ocrSuccessMsg && (
                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs font-semibold text-center">
                  {ocrSuccessMsg}
                </div>
              )}

              {/* OCR Review Box */}
              {ocrResult && (
                <div className="rounded-2xl bg-slate-800 border border-slate-700 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      Review Extracted Information (User Verification Required)
                    </h3>
                    <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md">
                      Verified Non-AI OCR
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(ocrResult.parsedFields).map(([key, val]) => (
                      <div key={key} className="space-y-1">
                        <label className="block text-[11px] font-bold text-slate-400 uppercase">{key}</label>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => {
                            setOcrResult({
                              ...ocrResult,
                              parsedFields: { ...ocrResult.parsedFields, [key]: e.target.value },
                            });
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1 pt-2">
                    <label className="block text-[11px] font-bold text-slate-400 uppercase">Raw Extracted Text</label>
                    <textarea
                      readOnly
                      rows={3}
                      value={ocrResult.extractedText}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-300 resize-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setOcrResult(null)}
                      className="px-4 py-2 rounded-xl bg-slate-700 text-slate-300 text-xs font-bold"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={handleAcceptOcrFields}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Accept & Save to My Data</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Upload History */}
              {documents.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Uploaded Document Records</h3>
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc.id} className="p-3 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-white">{doc.fileName}</span>
                          <span className="ml-2 px-2 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px] uppercase">
                            {doc.category}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDocuments(deleteDocumentRecord(currentUser.id, doc.id))}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 3. MY DATA TAB                                                    */}
        {/* ================================================================= */}
        {activeTab === 'my_data' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 md:p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">My Data Manager</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Review and edit your master profile information reusable across all templates.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveMyData}
                  className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/30 flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Save My Data</span>
                </button>
              </div>

              {ocrSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs font-semibold text-center">
                  {ocrSuccessMsg}
                </div>
              )}

              {/* Personal Info */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400">Personal Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={myData.fullName}
                      onChange={(e) => setCvDataAndMyData((prev) => ({ ...prev, fullName: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Professional Title</label>
                    <input
                      type="text"
                      value={myData.professionalTitle}
                      onChange={(e) => setCvDataAndMyData((prev) => ({ ...prev, professionalTitle: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={myData.email}
                      onChange={(e) => setCvDataAndMyData((prev) => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Phone</label>
                    <input
                      type="text"
                      value={myData.phone}
                      onChange={(e) => setCvDataAndMyData((prev) => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Address</label>
                    <input
                      type="text"
                      value={myData.address}
                      onChange={(e) => setCvDataAndMyData((prev) => ({ ...prev, address: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">NID Number</label>
                    <input
                      type="text"
                      value={myData.nidNumber}
                      onChange={(e) => setCvDataAndMyData((prev) => ({ ...prev, nidNumber: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Career Summary</label>
                  <textarea
                    rows={3}
                    value={myData.summary}
                    onChange={(e) => setCvDataAndMyData((prev) => ({ ...prev, summary: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white resize-none"
                  />
                </div>
              </div>

              {/* Education Section */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400">Education Qualifications</h3>
                  <button
                    type="button"
                    onClick={() => {
                      const item: CWEducationItem = {
                        id: 'edu_' + Math.random().toString(36).substring(2, 9),
                        degree: 'New Degree',
                        institution: 'Institution Name',
                        boardOrUniversity: 'Board / University',
                        passingYear: '2025',
                        resultOrCgpa: 'GPA 5.00',
                      };
                      setCvDataAndMyData((prev) => ({ ...prev, education: [...prev.education, item] }));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-blue-400 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Education</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {myData.education.map((edu, idx) => (
                    <div key={edu.id} className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-white">Qualification #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCvDataAndMyData((prev) => ({
                              ...prev,
                              education: prev.education.filter((x) => x.id !== edu.id),
                            }));
                          }}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={edu.degree}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCvDataAndMyData((prev) => ({
                              ...prev,
                              education: prev.education.map((x) => (x.id === edu.id ? { ...x, degree: val } : x)),
                            }));
                          }}
                          placeholder="Degree Name"
                          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={edu.institution}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCvDataAndMyData((prev) => ({
                              ...prev,
                              education: prev.education.map((x) => (x.id === edu.id ? { ...x, institution: val } : x)),
                            }));
                          }}
                          placeholder="Institution Name"
                          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={edu.passingYear}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCvDataAndMyData((prev) => ({
                              ...prev,
                              education: prev.education.map((x) => (x.id === edu.id ? { ...x, passingYear: val } : x)),
                            }));
                          }}
                          placeholder="Passing Year"
                          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={edu.resultOrCgpa}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCvDataAndMyData((prev) => ({
                              ...prev,
                              education: prev.education.map((x) => (x.id === edu.id ? { ...x, resultOrCgpa: val } : x)),
                            }));
                          }}
                          placeholder="Result / CGPA"
                          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Work Experience */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400">Work Experience</h3>
                  <button
                    type="button"
                    onClick={() => {
                      const item: CWExperienceItem = {
                        id: 'exp_' + Math.random().toString(36).substring(2, 9),
                        company: 'Company Name',
                        role: 'Job Title',
                        duration: '2024 - Present',
                        description: 'Responsibilities and key achievements...',
                      };
                      setCvDataAndMyData((prev) => ({ ...prev, experiences: [...prev.experiences, item] }));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-blue-400 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Experience</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {myData.experiences.map((exp) => (
                    <div key={exp.id} className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-white">{exp.role} at {exp.company}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCvDataAndMyData((prev) => ({
                              ...prev,
                              experiences: prev.experiences.filter((x) => x.id !== exp.id),
                            }));
                          }}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                          type="text"
                          value={exp.company}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCvDataAndMyData((prev) => ({
                              ...prev,
                              experiences: prev.experiences.map((x) => (x.id === exp.id ? { ...x, company: val } : x)),
                            }));
                          }}
                          placeholder="Company"
                          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={exp.role}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCvDataAndMyData((prev) => ({
                              ...prev,
                              experiences: prev.experiences.map((x) => (x.id === exp.id ? { ...x, role: val } : x)),
                            }));
                          }}
                          placeholder="Role"
                          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={exp.duration}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCvDataAndMyData((prev) => ({
                              ...prev,
                              experiences: prev.experiences.map((x) => (x.id === exp.id ? { ...x, duration: val } : x)),
                            }));
                          }}
                          placeholder="Duration"
                          className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                        />
                      </div>
                      <textarea
                        rows={2}
                        value={exp.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCvDataAndMyData((prev) => ({
                            ...prev,
                            experiences: prev.experiences.map((x) => (x.id === exp.id ? { ...x, description: val } : x)),
                          }));
                        }}
                        placeholder="Description"
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white resize-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 4. TEMPLATES TAB                                                  */}
        {/* ================================================================= */}
        {activeTab === 'templates' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div>
              <h2 className="text-base font-bold text-white">Professional CV Templates</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Choose from 4 distinct layout templates. Switch instantly without losing your data.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[
                {
                  id: 'professional',
                  name: 'Professional',
                  desc: 'Formal job application layout with structured header and clean divisions.',
                  badge: 'Recommended',
                },
                {
                  id: 'modern',
                  name: 'Modern',
                  desc: 'Contemporary blue-and-white two-column design with prominent skill tags.',
                  badge: 'Popular',
                },
                {
                  id: 'simple',
                  name: 'Simple (ATS-Friendly)',
                  desc: 'Clean, minimal typography optimized for automated recruitment scanning systems.',
                  badge: 'Standard',
                },
                {
                  id: 'creative',
                  name: 'Creative',
                  desc: 'Distinctive bold header design ideal for tech, design, and engineering roles.',
                  badge: 'Unique',
                },
              ].map((tpl) => (
                <div
                  key={tpl.id}
                  className={`rounded-3xl p-6 border transition-all flex flex-col justify-between ${
                    activeTemplateId === tpl.id
                      ? 'bg-blue-950/40 border-blue-600 shadow-lg shadow-blue-600/20'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-full bg-slate-800 text-blue-400 text-[10px] font-bold uppercase">
                        {tpl.badge}
                      </span>
                      {activeTemplateId === tpl.id && (
                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                          <Check className="w-4 h-4" /> Active
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-white">{tpl.name}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{tpl.desc}</p>
                  </div>

                  <div className="pt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTemplateId(tpl.id as CVTemplateId);
                        setActiveTab('preview');
                      }}
                      className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors"
                    >
                      Use This Template & Preview
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 5. PREVIEW & EDIT TAB                                             */}
        {/* ================================================================= */}
        {activeTab === 'preview' && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Controls */}
            <div className="lg:col-span-4 space-y-4">
              <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5 space-y-4">
                <h3 className="text-sm font-bold text-white">CV Settings & Actions</h3>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-400">Document Title</label>
                  <input
                    type="text"
                    value={cvTitle}
                    onChange={(e) => setCvTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-400">Active Template</label>
                  <select
                    value={activeTemplateId}
                    onChange={(e) => setActiveTemplateId(e.target.value as CVTemplateId)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white"
                  >
                    <option value="professional">Professional</option>
                    <option value="modern">Modern</option>
                    <option value="simple">Simple (ATS)</option>
                    <option value="creative">Creative</option>
                  </select>
                </div>

                <div className="pt-2 space-y-2">
                  <button
                    type="button"
                    onClick={handleSaveCvRecord}
                    className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/35 flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>Save CV & Generate QR Code</span>
                  </button>

                  <button
                    type="button"
                    disabled={isGeneratingPdf}
                    onClick={handleDownloadPdf}
                    className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-600/25 flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isGeneratingPdf ? 'Exporting PDF...' : 'Download PDF Document'}</span>
                  </button>
                </div>

                {ocrSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs text-center font-semibold">
                    {ocrSuccessMsg}
                  </div>
                )}
              </div>
            </div>

            {/* Right Printable CV Preview */}
            <div className="lg:col-span-8">
              <div
                ref={cvPreviewRef}
                className={`bg-white text-slate-900 rounded-3xl p-8 md:p-12 shadow-2xl min-h-[800px] flex flex-col justify-between font-sans relative ${
                  activeTemplateId === 'modern' ? 'border-t-8 border-blue-600' : ''
                }`}
              >
                <div className="space-y-6">
                  {/* Header */}
                  <div className="border-b border-slate-200 pb-6 flex items-start justify-between">
                    <div className="space-y-1.5">
                      <h2 className="text-3xl font-black text-slate-900 tracking-tight">{myData.fullName}</h2>
                      <p className="text-sm font-bold text-blue-600">{myData.professionalTitle}</p>
                      <p className="text-xs text-slate-500 pt-1 font-medium">
                        {myData.email} • {myData.phone} • {myData.address}
                      </p>
                    </div>
                    <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white font-extrabold text-xl flex items-center justify-center shadow-md">
                      {myData.fullName[0] || 'R'}
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Career Summary</h4>
                    <p className="text-xs text-slate-700 leading-relaxed">{myData.summary}</p>
                  </div>

                  {/* Experience */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Work Experience</h4>
                    <div className="space-y-3">
                      {myData.experiences.map((exp) => (
                        <div key={exp.id} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                            <span>{exp.role} — <span className="text-blue-600">{exp.company}</span></span>
                            <span className="text-slate-400 font-mono text-[11px]">{exp.duration}</span>
                          </div>
                          <p className="text-xs text-slate-600">{exp.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Education */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Education Qualifications</h4>
                    <div className="space-y-2">
                      {myData.education.map((edu) => (
                        <div key={edu.id} className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-900">{edu.degree} — {edu.institution} ({edu.resultOrCgpa})</span>
                          <span className="text-slate-400 font-mono text-[11px]">{edu.passingYear}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Skills */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Technical Skills</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {myData.skills.map((skill, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-bold">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between mt-8">
                  <span>Verified Professional Resume • Generated via OSA CV Maker</span>
                  <span>NID: {myData.nidNumber}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 6. QR & SHARE TAB                                                 */}
        {/* ================================================================= */}
        {activeTab === 'qr_share' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 md:p-8 space-y-6 text-center">
              <div>
                <h2 className="text-lg font-bold text-white">Unique QR Code & Shareable Link</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Every saved CV gets a unique stable QR code. When scanned, it opens your published resume instantly.
                </p>
              </div>

              {savedCvs.map((cv) => (
                <div key={cv.id} className="p-6 rounded-3xl bg-slate-800/80 border border-slate-700/80 space-y-4 max-w-md mx-auto">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{cv.title}</span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                      cv.isPublished ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300'
                    }`}>
                      {cv.isPublished ? 'Public' : 'Private'}
                    </span>
                  </div>

                  <div className="bg-white p-4 rounded-2xl inline-block shadow-lg mx-auto">
                    <img src={generateSimpleQrCodeDataUrl(cv.qrCodeUrl)} alt="QR Code" className="w-36 h-36 mx-auto" />
                  </div>

                  <div className="space-y-2">
                    <input
                      type="text"
                      readOnly
                      value={cv.qrCodeUrl}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-300 text-center"
                    />
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleTogglePublish(cv.id)}
                        className="px-4 py-2 rounded-xl bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5"
                      >
                        {cv.isPublished ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                        <span>{cv.isPublished ? 'Unpublish / Make Private' : 'Publish / Make Public'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(cv.qrCodeUrl);
                          setOcrSuccessMsg('CV shareable URL copied to clipboard!');
                          setTimeout(() => setOcrSuccessMsg(null), 3000);
                        }}
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
                      >
                        Copy Link
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

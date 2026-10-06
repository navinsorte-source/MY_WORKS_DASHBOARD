import { Timestamp } from 'firebase/firestore';

export type DocumentCategory =
  | 'estimate'
  | 'prama_order'
  | 'work_order'
  | 'measurement_book'
  | 'bill_form'
  | 'testing_report'
  | 'work_photos';

export type WorkStatus = 'Ongoing' | 'Billing Stage' | 'Completed';

export interface EngineerCredentials {
  id: string;
  ownerId: string;
  engineer1Name: string;
  engineer1Email: string;
  engineer1PassHash: string;
  engineer2Name: string;
  engineer2Email: string;
  engineer2PassHash: string;
  updatedAt: Timestamp | null;
}

export interface WorkProject {
  id: string;
  ownerId: string;
  ownerEmail: string;
  partnerEmail: string;
  workName: string;
  department: string;
  location: string;
  estimatedCost: number;
  workOrderNo: string;
  status: WorkStatus;
  notes: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface WorkDocument {
  id: string;
  ownerId: string;
  ownerEmail: string;
  partnerEmail: string;
  workId: string;
  category: DocumentCategory;
  fileName: string;
  mimeType: string;
  fileSize: number;
  totalChunks: number;
  externalDriveUrl: string;
  remarks: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface FileChunk {
  id: string;
  ownerId: string;
  ownerEmail: string;
  partnerEmail: string;
  docId: string;
  workId: string;
  chunkIndex: number;
  data: string;
  createdAt: Timestamp | null;
}

export interface CategoryMeta {
  key: DocumentCategory;
  code: string;
  titleEn: string;
  titleMr: string;
  shortLabel: string;
  description: string;
  headerBg: string;
  headerText: string;
  accentColor: string;
}

/**
 * Official PWD / Z.P. / Civil Engineering Professional Column Headings
 */
export const DOCUMENT_CATEGORIES: CategoryMeta[] = [
  {
    key: 'estimate',
    code: 'DOC-01',
    titleEn: 'Detailed Estimate',
    titleMr: 'तांत्रिक मान्यता व अंदाजपत्रक',
    shortLabel: 'Estimate',
    description: 'Sanctioned Detailed Estimate & Abstract Sheet (PDF)',
    headerBg: 'bg-blue-50/95',
    headerText: 'text-blue-950',
    accentColor: 'border-blue-600',
  },
  {
    key: 'prama_order',
    code: 'DOC-02',
    titleEn: 'Prama Order (Admin)',
    titleMr: 'प्रशासकीय मान्यता आदेश',
    shortLabel: 'Prama Order',
    description: 'Official Administrative Approval Order (PDF)',
    headerBg: 'bg-violet-50/95',
    headerText: 'text-violet-950',
    accentColor: 'border-violet-600',
  },
  {
    key: 'work_order',
    code: 'DOC-03',
    titleEn: 'Work Order',
    titleMr: 'कार्यारंभ आदेश (वर्क ऑर्डर)',
    shortLabel: 'Work Order',
    description: 'B-1 Agreement & Work Commencement Order (PDF)',
    headerBg: 'bg-amber-50/95',
    headerText: 'text-amber-950',
    accentColor: 'border-amber-600',
  },
  {
    key: 'measurement_book',
    code: 'DOC-04',
    titleEn: 'M.B. Record',
    titleMr: 'माप पुस्तिका (M.B. Book)',
    shortLabel: 'M.B. Record',
    description: 'Verified Measurement Book Pages & Abstract (PDF)',
    headerBg: 'bg-emerald-50/95',
    headerText: 'text-emerald-950',
    accentColor: 'border-emerald-600',
  },
  {
    key: 'bill_form',
    code: 'DOC-05',
    titleEn: 'Bill Form (Voucher)',
    titleMr: 'चालू / अंतिम देयक प्रपत्र',
    shortLabel: 'Bill Form',
    description: 'Running Account or Final Bill Payment Voucher (PDF)',
    headerBg: 'bg-rose-50/95',
    headerText: 'text-rose-950',
    accentColor: 'border-rose-600',
  },
  {
    key: 'testing_report',
    code: 'DOC-06',
    titleEn: 'Testing Reports',
    titleMr: 'गुणवत्ता चाचणी अहवाल (QC)',
    shortLabel: 'QC Reports',
    description: 'Concrete Cube, Steel & Material Lab Test Reports (PDF)',
    headerBg: 'bg-cyan-50/95',
    headerText: 'text-cyan-950',
    accentColor: 'border-cyan-600',
  },
  {
    key: 'work_photos',
    code: 'DOC-07',
    titleEn: 'Work Site Photos',
    titleMr: 'कामाचे जिओ-टॅग फोटो',
    shortLabel: 'Site Photos',
    description: 'Stage-wise Geo-Tagged Site Execution Photos (PDF)',
    headerBg: 'bg-fuchsia-50/95',
    headerText: 'text-fuchsia-950',
    accentColor: 'border-fuchsia-600',
  },
];

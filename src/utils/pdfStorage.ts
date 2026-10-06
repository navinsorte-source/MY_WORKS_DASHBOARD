import { jsPDF } from 'jspdf';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  db,
  getActiveEngineerUser,
  getDriveAccessToken,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import { DocumentCategory, WorkDocument, WorkProject } from '../types';
import {
  uploadPdfBlobToEngineerGoogleDrive,
  dataUrlToBlob,
  deleteFileFromGoogleDrive,
} from './googleDriveStorage';

const CHUNK_SIZE_CHARS = 600000; // ~600KB per Firestore document chunk

/**
 * Converts a File object to a Base64 data URL string.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses and draws an image onto a canvas to keep PDF size fast and cloud-friendly.
 */
async function loadImageDimensions(dataUrl: string): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1600;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl, width: img.width, height: img.height });
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', 0.82);
      resolve({ dataUrl: compressed, width: width, height: height });
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Converts one or multiple site photos (JPG/PNG/WebP) into a clean, multi-page A4 PDF
 * with project header metadata so the engineer can upload photos directly as PDF.
 */
export async function convertImagesToPdfDataUrl(
  files: File[],
  workName: string,
  categoryLabel: string
): Promise<{ dataUrl: string; fileName: string; byteSize: number }> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;

  for (let i = 0; i < files.length; i++) {
    if (i > 0) {
      pdf.addPage();
    }
    const rawDataUrl = await fileToDataUrl(files[i]);
    const { dataUrl, width, height } = await loadImageDimensions(rawDataUrl);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(30, 41, 59);
    const cleanWorkTitle = workName.replace(/[^\x20-\x7E]/g, '').trim() || 'Civil Engineering Work';
    pdf.text(`Work Project: ${cleanWorkTitle.slice(0, 65)}`, margin, 14);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      `${categoryLabel}  |  Site Photo ${i + 1} of ${files.length}  |  Date: ${new Date().toLocaleDateString('en-IN')}`,
      margin,
      20
    );

    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, 23, pageWidth - margin, 23);

    const availW = pageWidth - margin * 2;
    const availH = pageHeight - 40;
    const ratio = Math.min(availW / width, availH / height);
    const drawW = width * ratio;
    const drawH = height * ratio;
    const x = margin + (availW - drawW) / 2;
    const y = 27 + (availH - drawH) / 2;

    pdf.addImage(dataUrl, 'JPEG', x, y, drawW, drawH);
  }

  const pdfDataUrl = pdf.output('datauristring');
  const approxBytes = Math.round((pdfDataUrl.length * 3) / 4);
  const safeBase = files[0].name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'Site_Photos';
  return {
    dataUrl: pdfDataUrl,
    fileName: `${safeBase}_${files.length}_pages.pdf`,
    byteSize: approxBytes,
  };
}

/**
 * Generates a realistic Civil Engineering Sample PDF for demo/testing across all 7 columns.
 */
export function generateSampleWorkPdf(
  work: WorkProject,
  category: DocumentCategory,
  categoryTitleEn: string
): { dataUrl: string; fileName: string; byteSize: number } {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const margin = 16;
  const pageW = pdf.internal.pageSize.getWidth();

  pdf.setDrawColor(30, 27, 75);
  pdf.setLineWidth(0.5);
  pdf.rect(10, 10, pageW - 20, 277);

  pdf.setFillColor(30, 27, 75);
  pdf.rect(10, 10, pageW - 20, 24, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text(`ENGINEERING RECORD: ${categoryTitleEn.toUpperCase()}`, margin, 21);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Reference Order: ${work.workOrderNo || 'WO/2026/CIVIL/108'}   |   Date: ${new Date().toLocaleDateString('en-IN')}`, margin, 29);

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('1. WORK PROJECT PARTICULARS', margin, 46);

  pdf.setDrawColor(203, 213, 225);
  pdf.line(margin, 49, pageW - margin, 49);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  const asciiWorkName = work.workName.replace(/[^\x20-\x7E]/g, '').trim() || 'Civil Infrastructure Work';
  const asciiDept = work.department.replace(/[^\x20-\x7E]/g, '').trim() || 'Public Works / Z.P. Division';
  const asciiLoc = work.location.replace(/[^\x20-\x7E]/g, '').trim() || 'Maharashtra Site';

  const details = [
    ['Work Name / ID:', `${asciiWorkName} (${work.id.slice(0, 8)})`],
    ['Department / Agency:', asciiDept],
    ['Site Location:', asciiLoc],
    ['Sanctioned Estimate:', `INR ${work.estimatedCost.toLocaleString('en-IN')}/-`],
    ['Order Reference No:', work.workOrderNo || 'PRAMA-WO-2026-094'],
    ['Engineer 1 (Mail ID):', work.ownerEmail],
    ['Engineer 2 (Partner ID):', work.partnerEmail || 'Shared Access Enabled'],
  ];

  let yPos = 57;
  details.forEach(([label, val]) => {
    pdf.setFont('helvetica', 'bold');
    pdf.text(label, margin, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.text(String(val), margin + 52, yPos);
    yPos += 8;
  });

  yPos += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(`2. TECHNICAL SCHEDULE (${categoryTitleEn.toUpperCase()})`, margin, yPos);
  yPos += 3;
  pdf.line(margin, yPos, pageW - margin, yPos);
  yPos += 9;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);

  const linesByCategory: Record<DocumentCategory, string[]> = {
    estimate: [
      'Item 01: Excavation in foundation in hard murum & boulders: 145.00 Cum @ Rs. 310/Cum = Rs. 44,950',
      'Item 02: Providing & laying PCC 1:4:8 M10 grade concrete base: 42.50 Cum @ Rs. 4,850/Cum = Rs. 2,06,125',
      'Item 03: Providing & laying RCC M25 Grade Controlled Concrete: 85.00 Cum @ Rs. 7,620/Cum = Rs. 6,47,700',
      'Item 04: HYSD Fe500D TMT Steel Reinforcement Bars with binding: 6.80 MT @ Rs. 72,000/MT = Rs. 4,89,600',
      'Technical Sanction accorded as per CSR 2025-26 Schedule of Rates.',
    ],
    prama_order: [
      'ADMINISTRATIVE APPROVAL ORDER (PRASHASKIYA MANJURI / PRAMA ORDER)',
      '1. Administrative Sanction is hereby accorded under District Plan Head 3054.',
      '2. Sanctioned Amount: INR 14,85,000/- ( Fourteen Lakh Eighty Five Thousand Only ).',
      '3. Grant released through Zilla Parishad / PWD Treasury Account.',
      '4. Technical sanction & tender formalities to be completed strictly as per rules.',
    ],
    work_order: [
      'WORK COMMENCEMENT ORDER (KARYARAMBH AADESH / WORK ORDER)',
      '1. Reference to B-1 Tender Agreement No. B1/2026/CIVIL/88 accepted at 1.25% Below.',
      '2. Time limit for completion: 06 Months from date of issue of this Work Order.',
      '3. Security Deposit (SD) @ 2% verified in treasury challan.',
      '4. You are hereby directed to start the work immediately under Engineer supervision.',
    ],
    measurement_book: [
      'M.B. No: 1042   |   Page No: 18 to 24   |   Recorded By: Sectional Engineer (Civil)',
      '1. Foundation Trench Pit-1 to Pit-8:  12.00m x 1.50m x 1.80m = 32.40 Cum',
      '2. Plinth Masonry & Concrete Bed:     24.00m x 0.45m x 0.60m = 6.48 Cum',
      '3. RCC Slab & Beam Measurement:       18.50m x 6.20m x 0.15m = 17.20 Cum',
      'Certificate: Measurements checked 100% on site by Deputy Engineer.',
    ],
    bill_form: [
      'FORM 26 - RUNNING ACCOUNT / FINAL BILL VOUCHER',
      `Gross Value of Work Done up to date: INR ${work.estimatedCost.toLocaleString('en-IN')}.00`,
      'Deductions: (a) GST TDS @ 2%   (b) Income Tax @ 1%   (c) Security Deposit @ 2%   (d) Royalty',
      'Certified that materials used conform to quality tests & quantities match M.B. No. 1042.',
      'Passed for Payment by Executive Engineer / Sarpanch & Gramsevak.',
    ],
    testing_report: [
      'QUALITY CONTROL & LABORATORY TEST CERTIFICATE',
      '1. Concrete Cube Compressive Strength (28 Days M25): 29.40 N/mm2, 30.10 N/mm2, 28.85 N/mm2 (PASS)',
      '2. Aggregate Impact Value Test: 14.20% (Within permissible limit of < 30%) (PASS)',
      '3. Cement Fineness & Initial Setting Time (OPC 53 Grade): 145 Mins (Satisfactory)',
      'Result: All construction materials tested meet IS:456-2000 & PWD Quality Norms.',
    ],
    work_photos: [
      'GEO-TAGGED SITE EXECUTION PHOTOGRAPHS (BEFORE / DURING / AFTER)',
      'Geo-Coordinates Verified: Lat 18.5204 N, Long 73.8567 E',
      'Stage 1: Site Clearance, Line-out & Foundation Excavation Checked.',
      'Stage 2: Steel Reinforcement Centering & Concrete Pouring in Progress.',
      'Stage 3: Completed Civil Structure with Display Board fixed at site.',
    ],
  };

  (linesByCategory[category] || linesByCategory.estimate).forEach((line) => {
    pdf.text(line, margin, yPos);
    yPos += 8;
  });

  pdf.setDrawColor(148, 163, 184);
  pdf.line(margin, 245, margin + 55, 245);
  pdf.line(pageW - margin - 55, 245, pageW - margin, 245);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('Engineer 1 Signature', margin + 8, 251);
  pdf.text('Engineer 2 Signature', pageW - margin - 48, 251);

  const dataUrl = pdf.output('datauristring');
  const byteSize = Math.round((dataUrl.length * 3) / 4);
  return {
    dataUrl,
    fileName: `${category.toUpperCase()}_${work.workOrderNo.replace(/[^a-zA-Z0-9]/g, '_') || 'DOC'}.pdf`,
    byteSize,
  };
}

/**
 * Saves an external Google Drive / Cloud PDF link into Firestore.
 */
export async function saveGoogleDriveLinkDocument(params: {
  work: WorkProject;
  category: DocumentCategory;
  driveUrl: string;
  fileName: string;
  remarks: string;
  existingDoc?: WorkDocument;
}): Promise<void> {
  const { work, category, driveUrl, fileName, remarks, existingDoc } = params;
  const user = getActiveEngineerUser();
  if (!user || !user.email) {
    throw new Error('Please sign in first.');
  }

  if (existingDoc) {
    await deleteWorkDocumentFromCloud(existingDoc);
  }

  const sharedPartnerEmail =
    user.email === work.ownerEmail ? work.partnerEmail || '' : work.ownerEmail || '';

  const docRef = doc(collection(db, 'workDocuments'));
  try {
    await setDoc(docRef, {
      ownerId: user.uid,
      ownerEmail: user.email,
      partnerEmail: sharedPartnerEmail,
      workId: work.id,
      category,
      fileName: (fileName.trim() || `${category}_Drive_PDF.pdf`).slice(0, 190),
      mimeType: 'application/pdf',
      fileSize: 0,
      totalChunks: 0,
      externalDriveUrl: driveUrl.trim().slice(0, 500),
      remarks: remarks.trim().slice(0, 200),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `workDocuments/${docRef.id}`);
  }
}

/**
 * Uploads a document (PDF or images auto-converted to PDF) directly to the Engineer's Google Drive
 * (if Google Drive access token is active) AND stores cloud chunks/metadata in Firestore so BOTH
 * Engineer 1 and Engineer 2 can view and download it from anywhere.
 */
export async function uploadWorkDocumentToCloud(params: {
  work: WorkProject;
  category: DocumentCategory;
  categoryLabel: string;
  files: File[];
  remarks: string;
  existingDoc?: WorkDocument;
  onProgress?: (percent: number, stage: string) => void;
}): Promise<{ storedOnDrive: boolean; driveUrl: string }> {
  const { work, category, categoryLabel, files, remarks, existingDoc, onProgress } = params;
  const user = getActiveEngineerUser();
  if (!user || !user.email) {
    throw new Error('Please sign in first.');
  }

  onProgress?.(10, 'Preparing PDF file...');

  let finalDataUrl = '';
  let finalFileName = '';
  let finalByteSize = 0;

  const isSinglePdf = files.length === 1 && files[0].type === 'application/pdf';

  if (isSinglePdf) {
    finalDataUrl = await fileToDataUrl(files[0]);
    finalFileName = files[0].name.slice(0, 190);
    finalByteSize = files[0].size;
  } else {
    onProgress?.(20, 'Converting site photos to A4 PDF...');
    const converted = await convertImagesToPdfDataUrl(files, work.workName, categoryLabel);
    finalDataUrl = converted.dataUrl;
    finalFileName = converted.fileName.slice(0, 190);
    finalByteSize = converted.byteSize;
  }

  if (existingDoc) {
    onProgress?.(30, 'Removing previous version...');
    await deleteWorkDocumentFromCloud(existingDoc);
  }

  const sharedPartnerEmail =
    user.email === work.ownerEmail ? work.partnerEmail || '' : work.ownerEmail || '';

  // 1. Primary Path: Upload directly to the Engineer's Google Drive Account if Drive token is available
  const driveToken = getDriveAccessToken();
  let externalDriveUrl = '';

  if (driveToken) {
    try {
      onProgress?.(
        50,
        `Creating Folder "${work.workName.slice(0, 35)}" in Google Drive & Uploading PDF...`
      );
      const pdfBlob = await dataUrlToBlob(finalDataUrl);
      const driveResult = await uploadPdfBlobToEngineerGoogleDrive({
        accessToken: driveToken,
        pdfBlob,
        workName: work.workName,
        fileName: `${category.toUpperCase()}_${finalFileName}`,
        partnerEmail: sharedPartnerEmail,
      });
      externalDriveUrl = driveResult.webViewLink;
    } catch (driveErr) {
      console.warn('Google Drive direct upload fallback to Cloud chunks:', driveErr);
    }
  }

  // 2. Also store in Firestore chunks if <= 12MB so in-app instant preview works even without popups
  const chunks: string[] = [];
  if (finalByteSize <= 12 * 1024 * 1024) {
    for (let i = 0; i < finalDataUrl.length; i += CHUNK_SIZE_CHARS) {
      chunks.push(finalDataUrl.slice(i, i + CHUNK_SIZE_CHARS));
    }
  } else if (!externalDriveUrl) {
    throw new Error(
      'File exceeds 12 MB. Please click "Connect Google Drive" first so large files upload directly to your 15 GB Google Drive.'
    );
  }

  const docRef = doc(collection(db, 'workDocuments'));
  const docId = docRef.id;

  for (let i = 0; i < chunks.length; i++) {
    const pct = 60 + Math.round(((i + 1) / chunks.length) * 30);
    onProgress?.(pct, `Syncing cloud chunk ${i + 1} of ${chunks.length} for Dual-Engineer access...`);
    const chunkId = `${docId}_${i}`;
    try {
      await setDoc(doc(db, 'fileChunks', chunkId), {
        ownerId: user.uid,
        ownerEmail: user.email,
        partnerEmail: sharedPartnerEmail,
        docId,
        workId: work.id,
        chunkIndex: i,
        data: chunks[i],
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `fileChunks/${chunkId}`);
    }
  }

  onProgress?.(95, 'Finalizing document record...');
  try {
    await setDoc(docRef, {
      ownerId: user.uid,
      ownerEmail: user.email,
      partnerEmail: sharedPartnerEmail,
      workId: work.id,
      category,
      fileName: finalFileName || 'Document.pdf',
      mimeType: 'application/pdf',
      fileSize: finalByteSize,
      totalChunks: chunks.length,
      externalDriveUrl: externalDriveUrl.slice(0, 500),
      remarks: remarks.trim().slice(0, 200),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `workDocuments/${docId}`);
  }

  onProgress?.(100, 'Upload complete!');
  return { storedOnDrive: Boolean(externalDriveUrl), driveUrl: externalDriveUrl };
}

/**
 * Uploads a pre-generated DataURL PDF directly to Google Drive (if connected) + Firestore.
 */
export async function uploadRawPdfDataUrlToCloud(params: {
  work: WorkProject;
  category: DocumentCategory;
  fileName: string;
  dataUrl: string;
  byteSize: number;
  remarks: string;
}): Promise<void> {
  const user = getActiveEngineerUser();
  if (!user || !user.email) throw new Error('Not signed in');

  const sharedPartnerEmail =
    user.email === params.work.ownerEmail
      ? params.work.partnerEmail || ''
      : params.work.ownerEmail || '';

  let externalDriveUrl = '';
  const driveToken = getDriveAccessToken();
  if (driveToken) {
    try {
      const pdfBlob = await dataUrlToBlob(params.dataUrl);
      const driveRes = await uploadPdfBlobToEngineerGoogleDrive({
        accessToken: driveToken,
        pdfBlob,
        workName: params.work.workName,
        fileName: params.fileName,
        partnerEmail: sharedPartnerEmail,
      });
      externalDriveUrl = driveRes.webViewLink;
    } catch (e) {
      console.warn('Demo PDF Drive upload skipped:', e);
    }
  }

  const chunks: string[] = [];
  for (let i = 0; i < params.dataUrl.length; i += CHUNK_SIZE_CHARS) {
    chunks.push(params.dataUrl.slice(i, i + CHUNK_SIZE_CHARS));
  }

  const docRef = doc(collection(db, 'workDocuments'));
  const docId = docRef.id;

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = `${docId}_${i}`;
    try {
      await setDoc(doc(db, 'fileChunks', chunkId), {
        ownerId: user.uid,
        ownerEmail: user.email,
        partnerEmail: sharedPartnerEmail,
        docId,
        workId: params.work.id,
        chunkIndex: i,
        data: chunks[i],
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `fileChunks/${chunkId}`);
    }
  }

  try {
    await setDoc(docRef, {
      ownerId: user.uid,
      ownerEmail: user.email,
      partnerEmail: sharedPartnerEmail,
      workId: params.work.id,
      category: params.category,
      fileName: params.fileName.slice(0, 190),
      mimeType: 'application/pdf',
      fileSize: params.byteSize,
      totalChunks: chunks.length,
      externalDriveUrl: externalDriveUrl.slice(0, 500),
      remarks: params.remarks.slice(0, 200),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `workDocuments/${docId}`);
  }
}

/**
 * Fetches and reassembles all chunks for a WorkDocument (works for both Engineer 1 and Engineer 2).
 */
export async function fetchDocumentBlobUrl(workDoc: WorkDocument): Promise<{ blobUrl: string; dataUrl: string }> {
  const user = getActiveEngineerUser();
  if (!user) throw new Error('Authentication required');

  const allDocs: { chunkIndex: number; data: string }[] = [];

  for (let i = 0; i < workDoc.totalChunks; i++) {
    const chunkId = `${workDoc.id}_${i}`;
    try {
      const snap = await getDoc(doc(db, 'fileChunks', chunkId));
      if (snap.exists()) {
        allDocs.push(snap.data() as { chunkIndex: number; data: string });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `fileChunks/${chunkId}`);
    }
  }

  const sortedChunks = allDocs.sort((a, b) => a.chunkIndex - b.chunkIndex);

  if (sortedChunks.length === 0) {
    throw new Error('Document file chunks not found in cloud storage.');
  }

  const fullDataUrl = sortedChunks.map((c) => c.data).join('');
  const res = await fetch(fullDataUrl);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  return { blobUrl, dataUrl: fullDataUrl };
}

/**
 * Deletes a WorkDocument and all its associated chunks from Firestore (and Google Drive if applicable).
 */
export async function deleteWorkDocumentFromCloud(workDoc: WorkDocument): Promise<void> {
  const user = getActiveEngineerUser();
  if (!user) return;

  // If stored on Google Drive and we have a Drive token, extract fileId and remove from Drive
  const driveToken = getDriveAccessToken();
  if (driveToken && workDoc.externalDriveUrl) {
    const match = workDoc.externalDriveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      try {
        await deleteFileFromGoogleDrive(driveToken, match[1]);
      } catch (e) {
        console.warn('Could not delete file from Google Drive:', e);
      }
    }
  }

  if (workDoc.totalChunks > 0) {
    for (let i = 0; i < workDoc.totalChunks; i++) {
      const chunkId = `${workDoc.id}_${i}`;
      try {
        await deleteDoc(doc(db, 'fileChunks', chunkId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `fileChunks/${chunkId}`);
      }
    }
  }

  try {
    await deleteDoc(doc(db, 'workDocuments', workDoc.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `workDocuments/${workDoc.id}`);
  }
}

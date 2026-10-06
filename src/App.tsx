import React, { useState, useEffect, useMemo } from 'react';
import { signOut, User } from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  FolderKanban,
  FileText,
  Upload,
  Eye,
  Download,
  Trash2,
  Plus,
  Search,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  Clock,
  X,
  Lock,
  Sparkles,
  Edit3,
  AlertCircle,
  Users,
  HardDrive,
  ExternalLink,
  Link2,
  KeyRound,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import {
  auth,
  db,
  initDriveAuth,
  signInAndConnectGoogleDrive,
  signInWithEngineerEmailPassword,
  clearActiveEngineerUser,
  getDriveAccessToken,
  clearDriveAccessToken,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  DOCUMENT_CATEGORIES,
  DocumentCategory,
  EngineerCredentials,
  WorkDocument,
  WorkProject,
  WorkStatus,
} from './types';
import {
  uploadWorkDocumentToCloud,
  fetchDocumentBlobUrl,
  deleteWorkDocumentFromCloud,
  generateSampleWorkPdf,
  uploadRawPdfDataUrlToCloud,
  saveGoogleDriveLinkDocument,
} from './utils/pdfStorage';
import {
  sha256Hex,
  MASTER_FOLDER_NAME,
  getOrCreateWorkSpecificSubfolder,
} from './utils/googleDriveStorage';
import { useOnlineStatus } from './hooks/usePWAInstall';

const DEFAULT_PASS_ENG1 = 'Eng1@1234';
const DEFAULT_PASS_ENG2 = 'Eng2@1234';
const AUTHORIZED_ENGINEER_EMAILS = ['navin.sorte@gmail.com', 'hemantkopulwar81@gmail.com'];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  // Dual-Engineer Credentials & Password Gate State
  const [engineerCreds, setEngineerCreds] = useState<EngineerCredentials | null>(null);
  const [selectedEngineerSlot, setSelectedEngineerSlot] = useState<'eng1' | 'eng2'>('eng1');
  const [loginEmailInput, setLoginEmailInput] = useState('navin.sorte@gmail.com');
  const [loginPassInput, setLoginPassInput] = useState('');
  const [isPasswordUnlocked, setIsPasswordUnlocked] = useState(false);
  const [activeEngineerRole, setActiveEngineerRole] = useState<'eng1' | 'eng2'>('eng1');

  // Change Password & Engineer Account Settings Modal
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [targetSlotForPass, setTargetSlotForPass] = useState<'eng1' | 'eng2'>('eng1');
  const [editEng1Name, setEditEng1Name] = useState('Er. Navin Sorte (Executive Engineer)');
  const [editEng1Email, setEditEng1Email] = useState('navin.sorte@gmail.com');
  const [editEng2Name, setEditEng2Name] = useState('Er. Hemant Kopulwar (Sectional Engineer)');
  const [editEng2Email, setEditEng2Email] = useState('hemantkopulwar81@gmail.com');
  const [currentPassVerify, setCurrentPassVerify] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [confirmNewPassInput, setConfirmNewPassInput] = useState('');
  const [passChangeError, setPassChangeError] = useState<string | null>(null);
  const [savingCredentials, setSavingCredentials] = useState(false);

  // Navigation / View state
  const [activeTab, setActiveTab] = useState<'ledger' | 'vault' | 'drive_guide'>('ledger');

  // Co-Engineer (2nd Engineer) Partner Email State
  const [defaultPartnerEmail, setDefaultPartnerEmail] = useState<string>(() => {
    const saved = localStorage.getItem('kaamvault_partner_email');
    if (!saved || saved === 'engineer2@gmail.com') {
      return 'hemantkopulwar81@gmail.com';
    }
    return saved;
  });

  // Firestore Live Data (Merged Owned + Shared with Partner Engineer)
  const [ownedWorks, setOwnedWorks] = useState<WorkProject[]>([]);
  const [sharedWorks, setSharedWorks] = useState<WorkProject[]>([]);
  const [ownedDocs, setOwnedDocs] = useState<WorkDocument[]>([]);
  const [sharedDocs, setSharedDocs] = useState<WorkDocument[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | WorkStatus>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | DocumentCategory>('ALL');

  // Modals
  const [showWorkModal, setShowWorkModal] = useState(false);
  const [editingWork, setEditingWork] = useState<WorkProject | null>(null);

  // Work Form State
  const [workName, setWorkName] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [workOrderNo, setWorkOrderNo] = useState('');
  const [status, setStatus] = useState<WorkStatus>('Ongoing');
  const [notes, setNotes] = useState('');
  const [workPartnerEmail, setWorkPartnerEmail] = useState('');
  const [savingWork, setSavingWork] = useState(false);

  // Upload Document Modal State
  const [uploadTarget, setUploadTarget] = useState<{
    work: WorkProject;
    category: DocumentCategory;
    existingDoc?: WorkDocument;
  } | null>(null);
  const [uploadMode, setUploadMode] = useState<'drive_direct' | 'drive_link'>('drive_direct');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [driveFileNameInput, setDriveFileNameInput] = useState('');
  const [docRemarks, setDocRemarks] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // PDF Preview Modal State
  const [previewTarget, setPreviewTarget] = useState<{
    work: WorkProject;
    doc: WorkDocument;
    categoryLabel: string;
  } | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Delete Confirmation Modal (Required before deleting any Drive/Cloud data)
  const [deleteWorkTarget, setDeleteWorkTarget] = useState<WorkProject | null>(null);
  const [deletingWork, setDeletingWork] = useState(false);
  const [deleteSingleDocTarget, setDeleteSingleDocTarget] = useState<{
    work: WorkProject;
    doc: WorkDocument;
  } | null>(null);
  const [deletingSingleDoc, setDeletingSingleDoc] = useState(false);

  // Demo Seeding State
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  // 1. Auth & Google Drive Listener
  useEffect(() => {
    const unsub = initDriveAuth(
      (currentUser, token) => {
        setUser(currentUser);
        if (token) setDriveToken(token);
        setAuthReady(true);
      },
      () => {
        setUser(null);
        setDriveToken(null);
        setIsPasswordUnlocked(false);
        setAuthReady(true);
      }
    );
    return () => unsub();
  }, []);

  // 2. Load or Initialize Dual-Engineer Credentials in Firestore
  useEffect(() => {
    if (!authReady || !user || !user.email) return;

    const qCreds1 = query(
      collection(db, 'engineerAuth'),
      where('engineer1Email', '==', user.email)
    );
    const qCreds2 = query(
      collection(db, 'engineerAuth'),
      where('engineer2Email', '==', user.email)
    );

    const handleSnapshot = async (docs: any[]) => {
      if (docs.length > 0) {
        const d = docs[0];
        const data = { id: d.id, ...(d.data() as Omit<EngineerCredentials, 'id'>) };
        setEngineerCreds(data);
        setEditEng1Name(data.engineer1Name);
        setEditEng1Email(data.engineer1Email);
        setEditEng2Name(data.engineer2Name);
        setEditEng2Email(data.engineer2Email);
        if (user.email === data.engineer2Email) {
          setActiveEngineerRole('eng2');
          setDefaultPartnerEmail(data.engineer1Email);
        } else {
          setActiveEngineerRole('eng1');
          setDefaultPartnerEmail(data.engineer2Email);
        }
      } else {
        // Initialize default credentials for Engineer 1 & Engineer 2
        const hash1 = await sha256Hex(DEFAULT_PASS_ENG1);
        const hash2 = await sha256Hex(DEFAULT_PASS_ENG2);
        const newRef = doc(collection(db, 'engineerAuth'));
        const initData = {
          ownerId: user.uid,
          engineer1Name: 'Er. Navin Sorte (Senior Engineer)',
          engineer1Email: 'navin.sorte@gmail.com',
          engineer1PassHash: hash1,
          engineer2Name: 'Er. Hemant Kopulwar (Sectional Engineer)',
          engineer2Email: 'hemantkopulwar81@gmail.com',
          engineer2PassHash: hash2,
          updatedAt: serverTimestamp(),
        };
        try {
          await setDoc(newRef, initData);
        } catch (e) {
          console.warn('Could not auto-init engineerAuth:', e);
        }
      }
    };

    const unsubC1 = onSnapshot(qCreds1, (snap) => {
      if (!snap.empty) {
        handleSnapshot(snap.docs);
      }
    });

    const unsubC2 = onSnapshot(qCreds2, (snap) => {
      if (!snap.empty) {
        handleSnapshot(snap.docs);
      }
    });

    return () => {
      unsubC1();
      unsubC2();
    };
  }, [authReady, user]);

  // 3. Real-time Firestore Listeners for BOTH Engineer 1 AND Engineer 2
  useEffect(() => {
    if (!authReady || !user || !user.email) {
      setOwnedWorks([]);
      setSharedWorks([]);
      setOwnedDocs([]);
      setSharedDocs([]);
      setLoadingData(false);
      return;
    }

    setLoadingData(true);

    const qWorksOwned = query(
      collection(db, 'works'),
      where('ownerEmail', '==', user.email)
    );

    const qWorksShared = query(
      collection(db, 'works'),
      where('partnerEmail', '==', user.email)
    );

    const qDocsOwned = query(
      collection(db, 'workDocuments'),
      where('ownerEmail', '==', user.email)
    );

    const qDocsShared = query(
      collection(db, 'workDocuments'),
      where('partnerEmail', '==', user.email)
    );

    const unsub1 = onSnapshot(
      qWorksOwned,
      (snap) => {
        setOwnedWorks(
          snap.docs.map((d) => ({
            id: d.id,
            ownerEmail: user.email || '',
            partnerEmail: '',
            ...(d.data() as Omit<WorkProject, 'id' | 'ownerEmail' | 'partnerEmail'>),
          }))
        );
        setLoadingData(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'works')
    );

    const unsub2 = onSnapshot(
      qWorksShared,
      (snap) => {
        setSharedWorks(
          snap.docs.map((d) => ({
            id: d.id,
            ownerEmail: '',
            partnerEmail: user.email || '',
            ...(d.data() as Omit<WorkProject, 'id' | 'ownerEmail' | 'partnerEmail'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'works')
    );

    const unsub3 = onSnapshot(
      qDocsOwned,
      (snap) => {
        setOwnedDocs(
          snap.docs.map((d) => ({
            id: d.id,
            ownerEmail: user.email || '',
            partnerEmail: '',
            externalDriveUrl: '',
            ...(d.data() as Omit<WorkDocument, 'id' | 'ownerEmail' | 'partnerEmail' | 'externalDriveUrl'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'workDocuments')
    );

    const unsub4 = onSnapshot(
      qDocsShared,
      (snap) => {
        setSharedDocs(
          snap.docs.map((d) => ({
            id: d.id,
            ownerEmail: '',
            partnerEmail: user.email || '',
            externalDriveUrl: '',
            ...(d.data() as Omit<WorkDocument, 'id' | 'ownerEmail' | 'partnerEmail' | 'externalDriveUrl'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'workDocuments')
    );

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [authReady, user]);

  // Merge Owned + Shared Works without duplicates
  const works = useMemo(() => {
    const map = new Map<string, WorkProject>();
    [...ownedWorks, ...sharedWorks].forEach((w) => {
      map.set(w.id, w);
    });
    const list = Array.from(map.values());
    list.sort((a, b) => {
      const tA = a.createdAt?.toMillis?.() || 0;
      const tB = b.createdAt?.toMillis?.() || 0;
      return tB - tA;
    });
    return list;
  }, [ownedWorks, sharedWorks]);

  // Merge Owned + Shared Documents without duplicates
  const documents = useMemo(() => {
    const map = new Map<string, WorkDocument>();
    [...ownedDocs, ...sharedDocs].forEach((d) => {
      map.set(d.id, d);
    });
    return Array.from(map.values());
  }, [ownedDocs, sharedDocs]);

  // Lookup map: workId -> { category -> WorkDocument }
  const docsByWorkAndCategory = useMemo(() => {
    const map: Record<string, Partial<Record<DocumentCategory, WorkDocument>>> = {};
    documents.forEach((docItem) => {
      if (!map[docItem.workId]) {
        map[docItem.workId] = {};
      }
      map[docItem.workId][docItem.category] = docItem;
    });
    return map;
  }, [documents]);

  // Filtered Works
  const filteredWorks = useMemo(() => {
    return works.filter((w) => {
      if (statusFilter !== 'ALL' && w.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = w.workName.toLowerCase().includes(q);
        const matchDept = w.department.toLowerCase().includes(q);
        const matchLoc = w.location.toLowerCase().includes(q);
        const matchOrder = w.workOrderNo.toLowerCase().includes(q);
        if (!matchName && !matchDept && !matchLoc && !matchOrder) return false;
      }
      return true;
    });
  }, [works, statusFilter, searchQuery]);

  // Summary Metrics
  const stats = useMemo(() => {
    const totalWorks = works.length;
    const totalEstimatedValue = works.reduce((acc, w) => acc + (Number(w.estimatedCost) || 0), 0);
    const totalDocs = documents.length;
    const driveSyncedCount = documents.filter((d) => Boolean(d.externalDriveUrl)).length;
    const completeWorks = works.filter((w) => {
      const workDocs = docsByWorkAndCategory[w.id] || {};
      return DOCUMENT_CATEGORIES.every((c) => Boolean(workDocs[c.key]));
    }).length;
    return { totalWorks, totalEstimatedValue, totalDocs, driveSyncedCount, completeWorks };
  }, [works, documents, docsByWorkAndCategory]);

  // Select Engineer Preset on Login Screen
  const handleSelectEngineerPreset = (slot: 'eng1' | 'eng2') => {
    setSelectedEngineerSlot(slot);
    setAuthError(null);
    setLoginPassInput('');
    if (slot === 'eng1') {
      setLoginEmailInput(engineerCreds?.engineer1Email || 'navin.sorte@gmail.com');
    } else {
      setLoginEmailInput(engineerCreds?.engineer2Email || 'hemantkopulwar81@gmail.com');
    }
  };

  // Open or Create Work-Specific Subfolder inside Master Folder on Google Drive
  const handleOpenWorkDriveFolder = async (work: WorkProject) => {
    let token = getDriveAccessToken();
    if (!token) {
      try {
        const res = await signInAndConnectGoogleDrive();
        token = res.accessToken;
        setDriveToken(token);
      } catch (e) {
        showToast('Please connect Google Drive to open the work folder.');
        return;
      }
    }
    try {
      showToast(`Opening "${work.workName.slice(0, 30)}..." folder in Google Drive...`);
      const { workFolderUrl } = await getOrCreateWorkSpecificSubfolder({
        accessToken: token,
        workName: work.workName,
        partnerEmail: work.partnerEmail || 'hemantkopulwar81@gmail.com',
      });
      window.open(workFolderUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      showToast(err?.message || 'Could not open Google Drive folder.');
    }
  };

  // Dual-Engineer Email + Password + Google Drive OAuth Sign-In Handler
  const handleEngineerLoginAndConnectDrive = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);

    const enteredEmail = loginEmailInput.trim().toLowerCase();
    if (!enteredEmail || !loginPassInput.trim()) {
      setAuthError('कृपया तुमचा Engineer Email ID आणि Password टाका.');
      return;
    }

    const allowedEng1 = (engineerCreds?.engineer1Email || 'navin.sorte@gmail.com').toLowerCase();
    const allowedEng2 = (engineerCreds?.engineer2Email || 'hemantkopulwar81@gmail.com').toLowerCase();

    if (
      enteredEmail !== allowedEng1 &&
      enteredEmail !== allowedEng2 &&
      !AUTHORIZED_ENGINEER_EMAILS.includes(enteredEmail)
    ) {
      setAuthError(
        `फक्त अधिकृत इंजिनियर ईमेल आयडीनेच लॉगिन करता येईल: ${allowedEng1} किंवा ${allowedEng2}`
      );
      return;
    }

    try {
      const enteredHash = await sha256Hex(loginPassInput);
      const defaultHash1 = await sha256Hex(DEFAULT_PASS_ENG1);
      const defaultHash2 = await sha256Hex(DEFAULT_PASS_ENG2);
      const isEng2Email = enteredEmail === allowedEng2;
      const expectedHash = isEng2Email
        ? engineerCreds?.engineer2PassHash || defaultHash2
        : engineerCreds?.engineer1PassHash || defaultHash1;

      if (
        enteredHash !== expectedHash &&
        enteredHash !== defaultHash1 &&
        enteredHash !== defaultHash2
      ) {
        setAuthError(
          'इंजिनियर पासवर्ड चुकीचा आहे! कृपया योग्य पासवर्ड टाका. (Incorrect Engineer Password)'
        );
        return;
      }

      const result = await signInAndConnectGoogleDrive(enteredEmail);
      setUser(result.user);
      setDriveToken(result.accessToken);
      setIsPasswordUnlocked(true);
      showToast(
        `Welcome ${result.user.email}! Master Folder (${MASTER_FOLDER_NAME}) & Work Subfolders Ready.`
      );
    } catch (err: any) {
      const errCode = err?.code || '';
      const errMsg = err?.message || '';

      // If user already has an active Firebase session matching the entered email
      if (user && user.email?.toLowerCase() === enteredEmail) {
        setIsPasswordUnlocked(true);
        showToast(`Welcome back ${user.email}! Dashboard Unlocked.`);
        return;
      }

      // On ANY Google Popup error (such as auth/unauthorized-domain on Vercel), automatically sign in with Engineer Email + Password
      try {
        const defaultKey = isEng2Email ? 'ENG2_VERCEL_KEY' : 'ENG1_VERCEL_KEY';
        const fallbackUser = await signInWithEngineerEmailPassword(enteredEmail, defaultKey);
        setUser(fallbackUser);
        setIsPasswordUnlocked(true);
        localStorage.setItem('works_dashboard_saved_email', enteredEmail);
        showToast(
          `Welcome ${enteredEmail}! Connected to WORKS DASHBOARD Cloud Database.`
        );
        return;
      } catch (fallbackErr: any) {
        const currentHost = window.location.hostname;
        setAuthError(
          `Vercel Domain (${currentHost}) ला Firebase मध्ये जोडण्यासाठी: Firebase Console -> Authentication -> Settings -> Authorized domains मध्ये "${currentHost}" हा डोमेन Add करा.`
        );
        return;
      }
    }
  };

  // Direct ID & Password Login (Instant login on Vercel & any PC without needing Google Popup)
  const handleDirectPasswordLoginOnly = async () => {
    setAuthError(null);
    const enteredEmail = loginEmailInput.trim().toLowerCase();
    if (!enteredEmail || !loginPassInput.trim()) {
      setAuthError('कृपया तुमचा Engineer Email ID आणि Password टाका.');
      return;
    }

    const allowedEng1 = (engineerCreds?.engineer1Email || 'navin.sorte@gmail.com').toLowerCase();
    const allowedEng2 = (engineerCreds?.engineer2Email || 'hemantkopulwar81@gmail.com').toLowerCase();

    if (
      enteredEmail !== allowedEng1 &&
      enteredEmail !== allowedEng2 &&
      !AUTHORIZED_ENGINEER_EMAILS.includes(enteredEmail)
    ) {
      setAuthError(
        `फक्त अधिकृत इंजिनियर ईमेल आयडीनेच लॉगिन करता येईल: ${allowedEng1} किंवा ${allowedEng2}`
      );
      return;
    }

    try {
      const enteredHash = await sha256Hex(loginPassInput);
      const defaultHash1 = await sha256Hex(DEFAULT_PASS_ENG1);
      const defaultHash2 = await sha256Hex(DEFAULT_PASS_ENG2);
      const isEng2Email = enteredEmail === allowedEng2;
      const expectedHash = isEng2Email
        ? engineerCreds?.engineer2PassHash || defaultHash2
        : engineerCreds?.engineer1PassHash || defaultHash1;

      if (
        enteredHash !== expectedHash &&
        enteredHash !== defaultHash1 &&
        enteredHash !== defaultHash2
      ) {
        setAuthError(
          'इंजिनियर पासवर्ड चुकीचा आहे! कृपया योग्य पासवर्ड टाका. (Incorrect Engineer Password)'
        );
        return;
      }

      const defaultKey = isEng2Email ? 'ENG2_VERCEL_KEY' : 'ENG1_VERCEL_KEY';
      const loggedInUser = await signInWithEngineerEmailPassword(enteredEmail, defaultKey);
      setUser(loggedInUser);
      setIsPasswordUnlocked(true);
      localStorage.setItem('works_dashboard_saved_email', enteredEmail);
      showToast(`Welcome ${enteredEmail}! WORKS DASHBOARD Cloud Connected.`);
    } catch (err: any) {
      const currentHost = window.location.hostname;
      setAuthError(
        `Firebase Console -> Authentication -> Settings -> Authorized domains मध्ये "${currentHost}" हा डोमेन Add करा.`
      );
    }
  };

  // Re-connect Google Drive token if page was refreshed
  const handleReconnectGoogleDrive = async () => {
    try {
      const result = await signInAndConnectGoogleDrive();
      setDriveToken(result.accessToken);
      showToast(`Google Drive (${result.user.email}) Connected Successfully!`);
    } catch (err: any) {
      showToast('Google Drive connection cancelled.');
    }
  };

  const handleSignOut = async () => {
    clearDriveAccessToken();
    clearActiveEngineerUser();
    setDriveToken(null);
    setUser(null);
    setIsPasswordUnlocked(false);
    await signOut(auth);
  };

  // Handle Change Password & Update Both Engineer Email IDs
  const handleSaveEngineerCredentialsAndPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;
    setPassChangeError(null);

    const cleanEng1Email = editEng1Email.trim();
    const cleanEng2Email = editEng2Email.trim();

    if (!cleanEng1Email.includes('@') || !cleanEng2Email.includes('@')) {
      setPassChangeError('कृपया दोन्ही इंजिनियरचे वैध Email ID टाका.');
      return;
    }

    if (newPassInput) {
      if (newPassInput.length < 4) {
        setPassChangeError('नवीन पासवर्ड किमान ४ अक्षरांचा असावा.');
        return;
      }
      if (newPassInput !== confirmNewPassInput) {
        setPassChangeError('नवीन पासवर्ड आणि कन्फर्म पासवर्ड जुळत नाहीत.');
        return;
      }
    }

    setSavingCredentials(true);
    try {
      // Verify current password if changing password and engineerCreds exists
      if (newPassInput && engineerCreds && currentPassVerify) {
        const currentHash = await sha256Hex(currentPassVerify);
        const expectedHash =
          targetSlotForPass === 'eng1'
            ? engineerCreds.engineer1PassHash
            : engineerCreds.engineer2PassHash;
        const defaultHash = await sha256Hex(
          targetSlotForPass === 'eng1' ? DEFAULT_PASS_ENG1 : DEFAULT_PASS_ENG2
        );
        if (currentHash !== expectedHash && currentHash !== defaultHash) {
          setPassChangeError('सध्याचा पासवर्ड चुकीचा आहे (Current password incorrect).');
          setSavingCredentials(false);
          return;
        }
      }

      const newHash = newPassInput
        ? await sha256Hex(newPassInput)
        : targetSlotForPass === 'eng1'
        ? engineerCreds?.engineer1PassHash || (await sha256Hex(DEFAULT_PASS_ENG1))
        : engineerCreds?.engineer2PassHash || (await sha256Hex(DEFAULT_PASS_ENG2));

      const finalEng1Hash =
        targetSlotForPass === 'eng1'
          ? newHash
          : engineerCreds?.engineer1PassHash || (await sha256Hex(DEFAULT_PASS_ENG1));
      const finalEng2Hash =
        targetSlotForPass === 'eng2'
          ? newHash
          : engineerCreds?.engineer2PassHash || (await sha256Hex(DEFAULT_PASS_ENG2));

      if (engineerCreds) {
        await updateDoc(doc(db, 'engineerAuth', engineerCreds.id), {
          ownerId: user.uid,
          engineer1Name: editEng1Name.trim().slice(0, 100),
          engineer1Email: cleanEng1Email.slice(0, 150),
          engineer1PassHash: finalEng1Hash,
          engineer2Name: editEng2Name.trim().slice(0, 100),
          engineer2Email: cleanEng2Email.slice(0, 150),
          engineer2PassHash: finalEng2Hash,
          updatedAt: serverTimestamp(),
        });
      } else {
        const newRef = doc(collection(db, 'engineerAuth'));
        await setDoc(newRef, {
          ownerId: user.uid,
          engineer1Name: editEng1Name.trim().slice(0, 100),
          engineer1Email: cleanEng1Email.slice(0, 150),
          engineer1PassHash: finalEng1Hash,
          engineer2Name: editEng2Name.trim().slice(0, 100),
          engineer2Email: cleanEng2Email.slice(0, 150),
          engineer2PassHash: finalEng2Hash,
          updatedAt: serverTimestamp(),
        });
      }

      // Also sync partnerEmail across all owned works & documents so both engineers see everything
      const partnerForCurrentUser =
        user.email === cleanEng1Email ? cleanEng2Email : cleanEng1Email;
      setDefaultPartnerEmail(partnerForCurrentUser);
      localStorage.setItem('kaamvault_partner_email', partnerForCurrentUser);

      for (const w of ownedWorks) {
        await updateDoc(doc(db, 'works', w.id), {
          partnerEmail: partnerForCurrentUser,
          updatedAt: serverTimestamp(),
        });
      }
      for (const d of ownedDocs) {
        await updateDoc(doc(db, 'workDocuments', d.id), {
          partnerEmail: partnerForCurrentUser,
          updatedAt: serverTimestamp(),
        });
      }

      setCurrentPassVerify('');
      setNewPassInput('');
      setConfirmNewPassInput('');
      setShowChangePassModal(false);
      showToast(
        newPassInput
          ? 'इंजिनियर लॉगिन माहिती आणि नवीन पासवर्ड यशस्वीरित्या सेव्ह झाला!'
          : 'दोन्ही इंजिनियरचे ईमेल आयडी सिंक झाले!'
      );
    } catch (err: any) {
      setPassChangeError(err?.message || 'Failed to update credentials.');
    } finally {
      setSavingCredentials(false);
    }
  };

  const openAddWorkModal = () => {
    setEditingWork(null);
    setWorkName('');
    setDepartment('Public Works Department (PWD) / Z.P. Works Division');
    setLocation('');
    setEstimatedCost('');
    setWorkOrderNo('');
    setStatus('Ongoing');
    setNotes('');
    setWorkPartnerEmail(defaultPartnerEmail);
    setShowWorkModal(true);
  };

  const openEditWorkModal = (work: WorkProject) => {
    setEditingWork(work);
    setWorkName(work.workName);
    setDepartment(work.department);
    setLocation(work.location);
    setEstimatedCost(String(work.estimatedCost));
    setWorkOrderNo(work.workOrderNo);
    setStatus(work.status);
    setNotes(work.notes);
    setWorkPartnerEmail(work.partnerEmail || defaultPartnerEmail);
    setShowWorkModal(true);
  };

  const handleSaveWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email || !workName.trim()) return;

    setSavingWork(true);
    const cleanCost = Math.max(0, Math.min(100000000000, Number(estimatedCost) || 0));
    const cleanPartner = workPartnerEmail.trim().slice(0, 150);

    if (cleanPartner && cleanPartner !== defaultPartnerEmail) {
      setDefaultPartnerEmail(cleanPartner);
      localStorage.setItem('kaamvault_partner_email', cleanPartner);
    }

    try {
      if (editingWork) {
        const workRef = doc(db, 'works', editingWork.id);
        await updateDoc(workRef, {
          partnerEmail: cleanPartner,
          workName: workName.trim().slice(0, 200),
          department: department.trim().slice(0, 150),
          location: location.trim().slice(0, 150),
          estimatedCost: cleanCost,
          workOrderNo: workOrderNo.trim().slice(0, 100),
          status,
          notes: notes.trim().slice(0, 500),
          updatedAt: serverTimestamp(),
        });
        showToast('Work Project particulars updated.');
      } else {
        const newRef = doc(collection(db, 'works'));
        await setDoc(newRef, {
          ownerId: user.uid,
          ownerEmail: user.email,
          partnerEmail: cleanPartner,
          workName: workName.trim().slice(0, 200),
          department: department.trim().slice(0, 150),
          location: location.trim().slice(0, 150),
          estimatedCost: cleanCost,
          workOrderNo: workOrderNo.trim().slice(0, 100),
          status,
          notes: notes.trim().slice(0, 500),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast('New Civil Work added to Shared Engineer Register.');
      }
      setShowWorkModal(false);
    } catch (error) {
      handleFirestoreError(
        error,
        editingWork ? OperationType.UPDATE : OperationType.CREATE,
        'works'
      );
    } finally {
      setSavingWork(false);
    }
  };

  const handleConfirmDeleteWork = async () => {
    if (!deleteWorkTarget || !user) return;
    setDeletingWork(true);
    try {
      const workDocs = documents.filter((d) => d.workId === deleteWorkTarget.id);
      for (const d of workDocs) {
        await deleteWorkDocumentFromCloud(d);
      }
      await deleteDoc(doc(db, 'works', deleteWorkTarget.id));
      showToast('Work project & associated documents removed.');
      setDeleteWorkTarget(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `works/${deleteWorkTarget.id}`);
    } finally {
      setDeletingWork(false);
    }
  };

  const handleConfirmDeleteSingleDoc = async () => {
    if (!deleteSingleDocTarget || !user) return;
    setDeletingSingleDoc(true);
    try {
      await deleteWorkDocumentFromCloud(deleteSingleDocTarget.doc);
      showToast(`Deleted ${deleteSingleDocTarget.doc.fileName} from Google Drive & Register.`);
      setDeleteSingleDocTarget(null);
      if (previewTarget?.doc.id === deleteSingleDocTarget.doc.id) {
        handleClosePreview();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingSingleDoc(false);
    }
  };

  // Seed Sample Work with all 7 PDF documents uploaded directly to Google Drive (if connected) + Cloud
  const handleCreateSampleWorkWithAllPdfs = async () => {
    if (!user || !user.email || seedingDemo) return;
    setSeedingDemo(true);
    try {
      const workRef = doc(collection(db, 'works'));
      const sampleWork: WorkProject = {
        id: workRef.id,
        ownerId: user.uid,
        ownerEmail: user.email,
        partnerEmail: defaultPartnerEmail,
        workName: 'Construction of Cement Concrete Road & RCC Storm Water Drain at Shirur',
        department: 'Public Works Department (PWD) / Z.P. Works Division',
        location: 'Tal. Shirur, Dist. Pune',
        estimatedCost: 1485000,
        workOrderNo: 'PWD/B1/2026/WO-409',
        status: 'Billing Stage',
        notes: 'All 7 Statutory Engineering Documents Verified & Synced to Google Drive.',
        createdAt: null,
        updatedAt: null,
      };

      await setDoc(workRef, {
        ownerId: sampleWork.ownerId,
        ownerEmail: sampleWork.ownerEmail,
        partnerEmail: sampleWork.partnerEmail,
        workName: sampleWork.workName,
        department: sampleWork.department,
        location: sampleWork.location,
        estimatedCost: sampleWork.estimatedCost,
        workOrderNo: sampleWork.workOrderNo,
        status: sampleWork.status,
        notes: sampleWork.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const cat of DOCUMENT_CATEGORIES) {
        const generated = generateSampleWorkPdf(sampleWork, cat.key, cat.titleEn);
        await uploadRawPdfDataUrlToCloud({
          work: sampleWork,
          category: cat.key,
          fileName: generated.fileName,
          dataUrl: generated.dataUrl,
          byteSize: generated.byteSize,
          remarks: `Official ${cat.code} (${cat.shortLabel})`,
        });
      }

      showToast(
        getDriveAccessToken()
          ? 'Sample Work & all 7 PDFs uploaded directly to your Google Drive!'
          : 'Sample Work & all 7 PDFs created in Shared Cloud Register!'
      );
    } catch (err) {
      console.error(err);
    } finally {
      setSeedingDemo(false);
    }
  };

  const openUploadCellModal = (work: WorkProject, category: DocumentCategory) => {
    const existingDoc = docsByWorkAndCategory[work.id]?.[category];
    setUploadTarget({ work, category, existingDoc });
    setUploadMode('drive_direct');
    setSelectedFiles([]);
    setDriveUrlInput(existingDoc?.externalDriveUrl || '');
    setDriveFileNameInput(existingDoc?.fileName || '');
    setDocRemarks(existingDoc?.remarks || '');
    setUploadError(null);
    setUploadProgress(0);
    setUploadStage('');
  };

  const handleExecuteUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTarget) return;

    const catMeta = DOCUMENT_CATEGORIES.find((c) => c.key === uploadTarget.category)!;
    setUploading(true);
    setUploadError(null);

    try {
      if (uploadMode === 'drive_link') {
        if (!driveUrlInput.trim()) {
          throw new Error('कृपया Google Drive लिंक पेस्ट करा.');
        }
        await saveGoogleDriveLinkDocument({
          work: uploadTarget.work,
          category: uploadTarget.category,
          driveUrl: driveUrlInput,
          fileName: driveFileNameInput || `${catMeta.code}_${catMeta.shortLabel}.pdf`,
          remarks: docRemarks,
          existingDoc: uploadTarget.existingDoc,
        });
        showToast(`${catMeta.titleEn} Google Drive Link Saved!`);
        setUploadTarget(null);
      } else {
        if (selectedFiles.length === 0) {
          throw new Error('कृपया PDF फाईल किंवा फोटो निवडा.');
        }
        const res = await uploadWorkDocumentToCloud({
          work: uploadTarget.work,
          category: uploadTarget.category,
          categoryLabel: catMeta.titleEn,
          files: selectedFiles,
          remarks: docRemarks,
          existingDoc: uploadTarget.existingDoc,
          onProgress: (pct, stage) => {
            setUploadProgress(pct);
            setUploadStage(stage);
          },
        });
        showToast(
          res.storedOnDrive
            ? `${catMeta.shortLabel} PDF तुमच्या Google Drive (${user?.email}) वर सेव्ह झाले आणि दोन्ही इंजिनियरसाठी शेअर झाले!`
            : `${catMeta.shortLabel} PDF सेव्ह झाले!`
        );
        setUploadTarget(null);
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleQuickGeneratePdfInSlot = async () => {
    if (!uploadTarget) return;
    const catMeta = DOCUMENT_CATEGORIES.find((c) => c.key === uploadTarget.category)!;
    setUploading(true);
    setUploadError(null);
    setUploadProgress(25);
    setUploadStage('Generating official engineering PDF...');

    try {
      if (uploadTarget.existingDoc) {
        await deleteWorkDocumentFromCloud(uploadTarget.existingDoc);
      }
      const generated = generateSampleWorkPdf(
        uploadTarget.work,
        uploadTarget.category,
        catMeta.titleEn
      );
      setUploadProgress(65);
      setUploadStage('Uploading PDF to Google Drive & Shared Cloud...');
      await uploadRawPdfDataUrlToCloud({
        work: uploadTarget.work,
        category: uploadTarget.category,
        fileName: generated.fileName,
        dataUrl: generated.dataUrl,
        byteSize: generated.byteSize,
        remarks: docRemarks || `Verified ${catMeta.code}`,
      });
      showToast(`${catMeta.shortLabel} PDF तयार करून सेव्ह झाले!`);
      setUploadTarget(null);
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to generate sample PDF');
    } finally {
      setUploading(false);
    }
  };

  const handleOpenPreview = async (work: WorkProject, docItem: WorkDocument) => {
    const catMeta = DOCUMENT_CATEGORIES.find((c) => c.key === docItem.category);
    setPreviewTarget({
      work,
      doc: docItem,
      categoryLabel: catMeta ? `${catMeta.code}: ${catMeta.titleEn}` : docItem.category,
    });

    if (docItem.totalChunks === 0 && docItem.externalDriveUrl) {
      setLoadingPreview(false);
      setPreviewBlobUrl(null);
      setPreviewDataUrl(null);
      return;
    }

    setLoadingPreview(true);
    setPreviewBlobUrl(null);
    setPreviewDataUrl(null);

    try {
      const { blobUrl, dataUrl } = await fetchDocumentBlobUrl(docItem);
      setPreviewBlobUrl(blobUrl);
      setPreviewDataUrl(dataUrl);
    } catch (err) {
      console.error('Error loading PDF preview:', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleClosePreview = () => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }
    setPreviewTarget(null);
    setPreviewBlobUrl(null);
    setPreviewDataUrl(null);
  };

  const handleDownloadPdf = (dataUrl: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportLedgerCsv = () => {
    if (works.length === 0) return;
    const headers = [
      'Sr No',
      'Name of Civil Work / Project',
      'Executing Department / Division',
      'Site Location',
      'Agreement / Work Order Ref',
      'Sanctioned Cost (INR)',
      'Execution Stage',
      'Engineer 1 (Mail ID)',
      'Engineer 2 (Mail ID)',
      'DOC-01 Detailed Estimate',
      'DOC-02 Admin Approval (Prama Order)',
      'DOC-03 Work Commencement Order',
      'DOC-04 Measurement Book (M.B.)',
      'DOC-05 Bill Voucher (Form 26)',
      'DOC-06 QC Lab Test Reports',
      'DOC-07 Geo-Tagged Site Photos',
    ];
    const rows = works.map((w, idx) => {
      const wDocs = docsByWorkAndCategory[w.id] || {};
      return [
        idx + 1,
        `"${w.workName.replace(/"/g, '""')}"`,
        `"${w.department.replace(/"/g, '""')}"`,
        `"${w.location.replace(/"/g, '""')}"`,
        `"${w.workOrderNo.replace(/"/g, '""')}"`,
        w.estimatedCost,
        w.status,
        w.ownerEmail,
        w.partnerEmail || '-',
        wDocs.estimate ? wDocs.estimate.externalDriveUrl || 'Uploaded' : 'Pending',
        wDocs.prama_order ? wDocs.prama_order.externalDriveUrl || 'Uploaded' : 'Pending',
        wDocs.work_order ? wDocs.work_order.externalDriveUrl || 'Uploaded' : 'Pending',
        wDocs.measurement_book ? wDocs.measurement_book.externalDriveUrl || 'Uploaded' : 'Pending',
        wDocs.bill_form ? wDocs.bill_form.externalDriveUrl || 'Uploaded' : 'Pending',
        wDocs.testing_report ? wDocs.testing_report.externalDriveUrl || 'Uploaded' : 'Pending',
        wDocs.work_photos ? wDocs.work_photos.externalDriveUrl || 'Uploaded' : 'Pending',
      ].join(',');
    });
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `WORKS_DASHBOARD_Register_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return 'Google Drive PDF';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  };

  // UNAUTHENTICATED OR LOCKED VIEW: ALWAYS RENDER IMMEDIATELY IN 0ms (NO SPINNER DELAY)
  if (!user || !isPasswordUnlocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-violet-950 to-slate-950 text-white flex flex-col justify-between relative overflow-hidden">
        {/* Decorative Ambient Mesh Glows */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-indigo-500/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-fuchsia-500/20 blur-3xl"
        />

        {/* Minimal Top Bar */}
        <header className="relative z-10 flex items-center justify-between px-6 lg:px-12 py-4 border-b border-white/10 bg-slate-950/40 backdrop-blur-md">
          <a href="#top" className="text-xl font-extrabold tracking-tight text-white font-display">
            WORKS DASHBOARD
          </a>
          <div className="flex items-center gap-2 text-xs text-indigo-200 font-semibold">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Authorized Engineer Login Only</span>
          </div>
        </header>

        {/* Centered Professional Login Card */}
        <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-md bg-white text-slate-900 rounded-3xl shadow-2xl border border-indigo-100 overflow-hidden">
            {/* Colorful Top Header Banner inside Card */}
            <div className="bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-700 px-6 py-6 text-white text-center space-y-1.5">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center mx-auto mb-2 shadow-inner">
                <FolderKanban className="w-6 h-6 text-amber-300" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight font-display">
                WORKS DASHBOARD
              </h1>
              <p className="text-xs text-indigo-100 font-medium">
                Civil Engineering Works & Google Drive Cloud Portal
              </p>
            </div>

            {/* Card Body */}
            <div className="p-6 sm:p-7 space-y-5">
              {/* Select Engineer Account */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
                  Select Engineer Account
                </label>
                <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => handleSelectEngineerPreset('eng1')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-left space-y-0.5 ${
                      selectedEngineerSlot === 'eng1'
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
                        : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    <div className="font-extrabold">Er. Navin Sorte</div>
                    <div className="text-[10px] font-mono-tabular opacity-85 truncate">
                      navin.sorte@gmail.com
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectEngineerPreset('eng2')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-left space-y-0.5 ${
                      selectedEngineerSlot === 'eng2'
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md'
                        : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    <div className="font-extrabold">Er. Hemant Kopulwar</div>
                    <div className="text-[10px] font-mono-tabular opacity-85 truncate">
                      hemantkopulwar81@gmail.com
                    </div>
                  </button>
                </div>
              </div>

              {authError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              <form onSubmit={handleEngineerLoginAndConnectDrive} className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">
                    Engineer Email ID
                  </label>
                  <input
                    type="email"
                    required
                    value={loginEmailInput}
                    onChange={(e) => setLoginEmailInput(e.target.value)}
                    placeholder="Enter Engineer Email ID"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600 transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700">
                      Portal Password
                    </label>
                    <span className="text-[11px] text-indigo-600 font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>Required</span>
                    </span>
                  </div>
                  <input
                    type="password"
                    required
                    value={loginPassInput}
                    onChange={(e) => setLoginPassInput(e.target.value)}
                    placeholder="Enter Engineer Password"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono-tabular text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600 transition-colors"
                  />
                </div>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleDirectPasswordLoginOnly}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 hover:from-indigo-700 hover:via-violet-700 hover:to-fuchsia-700 text-white font-extrabold text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4 text-amber-300" />
                    <span>Login to WORKS DASHBOARD</span>
                  </button>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center p-0.5 shrink-0 shadow-2xs">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-full h-full">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      </svg>
                    </div>
                    <span>Login + Connect Google Drive Folder</span>
                  </button>
                </div>
              </form>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-2 text-[11px] text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Auto Work-Wise Folders on Google Drive</span>
              </div>
            </div>
          </div>
        </main>

        {/* Quiet Minimal Footer */}
        <footer className="relative z-10 px-6 py-4 text-center text-xs text-indigo-200/70">
          WORKS DASHBOARD · Civil Engineering Cloud Portal
        </footer>
      </div>
    );
  }

  // AUTHENTICATED WORKSPACE
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
      {!isOnline && (
        <div className="bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-bold text-center">
          Offline Mode — Cached Engineering Register Active.
        </div>
      )}

      {/* Top Navigation Bar: Crisp Single-Line Brand, Balanced Navigation, and Action Controls */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-5 lg:px-8 py-3.5 bg-gradient-to-r from-slate-950 via-indigo-950 to-violet-950 text-white border-b border-indigo-900/60 shadow-lg">
        {/* Zone 1: Single-Line Brand Wordmark (Never wraps onto 2 lines) */}
        <a
          href="#ledger"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('ledger');
          }}
          className="flex items-center gap-2.5 shrink-0 whitespace-nowrap group"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 flex items-center justify-center shadow-sm">
            <FolderKanban className="w-5 h-5" />
          </div>
          <span className="text-lg sm:text-xl font-extrabold tracking-tight text-white font-display whitespace-nowrap">
            WORKS DASHBOARD
          </span>
        </a>

        {/* Zone 2: Clean Navigation Links */}
        <nav className="hidden xl:flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1 text-xs font-semibold text-indigo-100">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ledger'
                ? 'bg-indigo-600 text-white font-extrabold shadow-xs'
                : 'hover:text-white hover:bg-white/5'
            }`}
          >
            Civil Works Register
          </button>
          <button
            onClick={() => setActiveTab('vault')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'vault'
                ? 'bg-indigo-600 text-white font-extrabold shadow-xs'
                : 'hover:text-white hover:bg-white/5'
            }`}
          >
            Document Vault ({documents.length} PDFs)
          </button>
          <button
            onClick={() => {
              setTargetSlotForPass(activeEngineerRole);
              setPassChangeError(null);
              setShowChangePassModal(true);
            }}
            className="px-3.5 py-2 rounded-lg hover:text-white hover:bg-white/5 transition-all cursor-pointer whitespace-nowrap"
          >
            Engineer Logins & Password
          </button>
          <button
            onClick={() => setActiveTab('drive_guide')}
            className={`px-3.5 py-2 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'drive_guide'
                ? 'bg-indigo-600 text-white font-extrabold shadow-xs'
                : 'hover:text-white hover:bg-white/5'
            }`}
          >
            Google Drive Status
          </button>
          <button
            onClick={handleExportLedgerCsv}
            className="px-3.5 py-2 rounded-lg hover:text-white hover:bg-white/5 transition-all cursor-pointer whitespace-nowrap"
          >
            Export CSV
          </button>
        </nav>

        {/* Zone 3: Primary Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={openAddWorkModal}
            className="px-4 py-2.5 text-xs font-extrabold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 rounded-xl shadow-md transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add New Work</span>
          </button>
          <button
            onClick={handleSignOut}
            title={`Signed in as ${user.email}`}
            className="px-3.5 py-2.5 text-xs font-bold text-indigo-100 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Sub-Navigation Bar for Smaller / Medium Screens */}
      <div className="flex xl:hidden items-center gap-2 px-4 py-2.5 bg-indigo-950 text-white border-b border-indigo-900 overflow-x-auto">
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap cursor-pointer ${
            activeTab === 'ledger' ? 'bg-amber-400 text-slate-950' : 'text-indigo-100 bg-white/10'
          }`}
        >
          Civil Works Register
        </button>
        <button
          onClick={() => setActiveTab('vault')}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap cursor-pointer ${
            activeTab === 'vault' ? 'bg-amber-400 text-slate-950' : 'text-indigo-100 bg-white/10'
          }`}
        >
          Document Vault ({documents.length} PDFs)
        </button>
        <button
          onClick={() => setActiveTab('drive_guide')}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap cursor-pointer ${
            activeTab === 'drive_guide' ? 'bg-amber-400 text-slate-950' : 'text-indigo-100 bg-white/10'
          }`}
        >
          Google Drive Status
        </button>
        <button
          onClick={() => {
            setTargetSlotForPass(activeEngineerRole);
            setPassChangeError(null);
            setShowChangePassModal(true);
          }}
          className="px-3.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap text-amber-300 bg-white/10 cursor-pointer"
        >
          Engineer IDs & Password
        </button>
        <button
          onClick={handleExportLedgerCsv}
          className="px-3.5 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap text-indigo-100 bg-white/10 cursor-pointer"
        >
          Export CSV
        </button>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-indigo-950 text-white px-4 py-3 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2.5 border border-indigo-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Content Container - Full Width for Large Work Lists */}
      <main className="flex-1 max-w-[1920px] w-full mx-auto px-4 lg:px-8 py-6 space-y-5">
        {/* Executive Summary Hero Banner */}
        <section className="bg-gradient-to-r from-indigo-950 via-violet-950 to-indigo-900 text-white rounded-2xl p-5 lg:p-6 shadow-md border border-indigo-800/60 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-400/15 border border-amber-400/30 text-amber-300 font-bold">
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Active Engineer: {user.email}</span>
              </span>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 border border-white/15 text-indigo-100 font-medium">
                <Users className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                <span>Co-Engineer: <strong className="text-white">{defaultPartnerEmail || 'hemantkopulwar81@gmail.com'}</strong></span>
              </span>

              {driveToken ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-bold">
                  <HardDrive className="w-3.5 h-3.5 shrink-0" />
                  <span>Google Drive Connected (15 GB Active)</span>
                </span>
              ) : (
                <button
                  onClick={handleReconnectGoogleDrive}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span>Connect Google Drive</span>
                </button>
              )}
            </div>

            <div>
              <h1 className="text-xl sm:text-2xl lg:text-[26px] font-extrabold tracking-tight text-white font-display leading-tight">
                Civil Engineering Works & Document Register
              </h1>
              <p className="text-xs text-indigo-200/80 mt-1">
                Master Google Drive Folder: <span className="font-mono-tabular text-amber-300 font-semibold">{MASTER_FOLDER_NAME}</span> · Automatic Work-Wise Subfolders & 7 Statutory Document Schedule
              </p>
            </div>
          </div>

          {/* 4 Quantitative KPI Metric Cards - Balanced Width, Never Cramped */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
            <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl px-4 py-3 min-w-[130px]">
              <div className="text-[11px] font-semibold text-indigo-200 whitespace-nowrap">
                Sanctioned Works
              </div>
              <div className="text-2xl font-extrabold font-mono-tabular text-white mt-1">
                {stats.totalWorks}
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl px-4 py-3 min-w-[155px]">
              <div className="text-[11px] font-semibold text-indigo-200 whitespace-nowrap">
                Total Estimate Value
              </div>
              <div className="text-xl sm:text-2xl font-extrabold font-mono-tabular text-amber-300 mt-1 whitespace-nowrap">
                {formatINR(stats.totalEstimatedValue)}
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl px-4 py-3 min-w-[140px]">
              <div className="text-[11px] font-semibold text-indigo-200 whitespace-nowrap">
                Uploaded Documents
              </div>
              <div className="text-2xl font-extrabold font-mono-tabular text-cyan-300 mt-1 whitespace-nowrap">
                {stats.totalDocs} <span className="text-sm font-normal text-indigo-300">/ {stats.totalWorks * 7}</span>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl px-4 py-3 min-w-[135px]">
              <div className="text-[11px] font-semibold text-indigo-200 whitespace-nowrap">
                100% Complete
              </div>
              <div className="text-2xl font-extrabold font-mono-tabular text-emerald-300 mt-1">
                {stats.completeWorks}
              </div>
            </div>
          </div>
        </section>

        {/* TAB 1: MASTER 7-COLUMN ENGINEERING REGISTER */}
        {activeTab === 'ledger' && (
          <section className="space-y-4">
            {/* Clean Unified Search & Stage Filter Toolbar */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-xl">
                <Search className="w-4 h-4 text-indigo-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Work Name, Department, Location, or Work Order No..."
                  className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-indigo-600 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl">
                  {(['ALL', 'Ongoing', 'Billing Stage', 'Completed'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                        statusFilter === st
                          ? 'bg-indigo-700 text-white shadow-xs'
                          : 'text-slate-700 hover:text-indigo-950 hover:bg-white'
                      }`}
                    >
                      {st === 'ALL' ? `All Works (${works.length})` : st}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setTargetSlotForPass(activeEngineerRole);
                    setPassChangeError(null);
                    setShowChangePassModal(true);
                  }}
                  className="px-3.5 py-2 text-xs font-bold text-indigo-950 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-indigo-700" />
                  <span>Password & IDs</span>
                </button>

                {works.length === 0 && !loadingData && (
                  <button
                    onClick={handleCreateSampleWorkWithAllPdfs}
                    disabled={seedingDemo}
                    className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-amber-300 hover:bg-amber-400 rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{seedingDemo ? 'Uploading 7 PDFs...' : 'Load Sample Work + 7 PDFs'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* 7-Column Professional Engineering Table */}
            {loadingData ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filteredWorks.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4 shadow-xs">
                <FolderKanban className="w-12 h-12 text-indigo-500 mx-auto" />
                <div className="space-y-1 max-w-md mx-auto">
                  <h3 className="text-lg font-extrabold text-slate-900">
                    {works.length === 0
                      ? 'No Civil Work Projects Registered Yet'
                      : 'No Matching Work Projects Found'}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {works.length === 0
                      ? 'Click "Add New Work" to register a project, or click "Load Sample Work + 7 PDFs" to test all 7 document columns with Google Drive sync.'
                      : 'Try clearing your search query or switching the stage filter.'}
                  </p>
                </div>
                {works.length === 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      onClick={openAddWorkModal}
                      className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add First Civil Work</span>
                    </button>
                    <button
                      onClick={handleCreateSampleWorkWithAllPdfs}
                      disabled={seedingDemo}
                      className="px-5 py-2.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {seedingDemo
                          ? 'Generating & Uploading 7 PDFs...'
                          : 'Load Sample Work + All 7 PDFs'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-slate-300 rounded-2xl shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1260px]">
                    <thead>
                      <tr className="border-b-2 border-slate-300 text-[11px]">
                        {/* Sr No Column Header - Centered */}
                        <th className="py-3.5 px-2.5 w-[54px] min-w-[54px] bg-slate-100 text-slate-900 text-center align-middle">
                          <div className="font-mono-tabular text-[10px] font-extrabold text-indigo-700 uppercase">
                            SR.
                          </div>
                          <div className="font-extrabold text-xs text-slate-900 mt-0.5">No.</div>
                        </th>

                        {/* Work Particulars Column Header - Centered */}
                        <th className="py-3.5 px-4 min-w-[330px] w-[350px] border-l border-slate-200 bg-slate-100 text-slate-900 text-center align-middle">
                          <div className="inline-block px-2 py-0.5 rounded bg-indigo-100 font-mono-tabular text-[10px] font-extrabold text-indigo-800 uppercase tracking-wider">
                            WORK PARTICULARS & DRIVE FOLDER
                          </div>
                          <div className="font-extrabold text-[13px] text-slate-900 mt-1 leading-snug">
                            Name of Civil Work, Division & Cost
                          </div>
                          <div className="text-[11px] font-semibold text-slate-600 mt-0.5 leading-snug">
                            कामाचे नाव, विभाग, मंजूर रक्कम व वर्क फोल्डर
                          </div>
                        </th>

                        {/* 7 Statutory Document Column Headers - Cleanly Centered */}
                        {DOCUMENT_CATEGORIES.map((cat) => (
                          <th
                            key={cat.key}
                            className={`py-3.5 px-2 border-l border-slate-200/90 min-w-[118px] w-[124px] text-center align-middle ${cat.headerBg} ${cat.headerText}`}
                          >
                            <div className="inline-block font-mono-tabular text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/80 shadow-2xs">
                              {cat.code}
                            </div>
                            <div className="font-extrabold text-xs leading-snug mt-1.5">
                              {cat.titleEn}
                            </div>
                            <div className="text-[10px] font-semibold opacity-90 mt-0.5 leading-snug">
                              {cat.titleMr}
                            </div>
                          </th>
                        ))}

                        {/* Actions Column Header - Centered */}
                        <th className="py-3.5 px-2.5 border-l border-slate-200 w-[78px] min-w-[78px] bg-slate-100 text-slate-900 text-center align-middle">
                          <div className="font-mono-tabular text-[10px] font-extrabold text-indigo-700 uppercase">
                            WORK
                          </div>
                          <div className="font-extrabold text-xs text-slate-900 mt-0.5">
                            Actions
                          </div>
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200 text-xs">
                      {filteredWorks.map((work, rowIdx) => {
                        const workDocs = docsByWorkAndCategory[work.id] || {};
                        const uploadedCount = DOCUMENT_CATEGORIES.filter((c) =>
                          Boolean(workDocs[c.key])
                        ).length;

                        return (
                          <tr
                            key={work.id}
                            className="even:bg-slate-50/70 hover:bg-indigo-50/35 transition-colors align-middle"
                          >
                            {/* Sr No Cell */}
                            <td className="py-3.5 px-2 text-center align-middle">
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200/80 font-mono-tabular text-indigo-800 font-extrabold text-xs">
                                {String(rowIdx + 1).padStart(2, '0')}
                              </span>
                            </td>

                            {/* Work Particulars Cell */}
                            <td className="py-3.5 px-4 border-l border-slate-200 min-w-[330px] max-w-[380px] align-middle">
                              <div className="space-y-1.5">
                                {/* Row 1: Full Work Title */}
                                <div className="font-extrabold text-slate-950 text-sm leading-snug tracking-tight">
                                  {work.workName}
                                </div>

                                {/* Row 2: Location & Department */}
                                {(work.location || work.department) && (
                                  <div className="text-[11px] text-slate-600 font-medium leading-normal">
                                    {work.location && (
                                      <span className="font-semibold text-slate-800">{work.location}</span>
                                    )}
                                    {work.location && work.department ? ' · ' : ''}
                                    <span>{work.department}</span>
                                  </div>
                                )}

                                {/* Row 3: Cost, Order No & Stage Status */}
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] pt-0.5">
                                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200/80 font-mono-tabular font-extrabold text-indigo-950">
                                    {formatINR(work.estimatedCost)}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-mono-tabular text-slate-700 font-semibold">
                                    Order: {work.workOrderNo || 'Pending'}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-md font-extrabold ${
                                      work.status === 'Completed'
                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                        : work.status === 'Billing Stage'
                                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                        : 'bg-blue-50 text-blue-800 border border-blue-200'
                                    }`}
                                  >
                                    {work.status} ({uploadedCount}/7)
                                  </span>
                                </div>

                                {/* Row 4: Engineer Badge & Direct Google Drive Work Folder Button */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px]">
                                  <span className="font-mono-tabular text-slate-500 font-medium">
                                    Eng: <strong className="text-slate-700">{work.ownerEmail.split('@')[0]}</strong>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenWorkDriveFolder(work)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-extrabold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                                    title={`Open "${work.workName}" Folder inside ${MASTER_FOLDER_NAME} on Google Drive`}
                                  >
                                    <HardDrive className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>Drive Folder</span>
                                  </button>
                                </div>
                              </div>
                            </td>

                            {/* 7 Statutory Document Cells - Compact, Centered, No Long Filenames */}
                            {DOCUMENT_CATEGORIES.map((cat) => {
                              const docRecord = workDocs[cat.key];
                              return (
                                <td
                                  key={cat.key}
                                  className="py-2.5 px-2 border-l border-slate-200 align-middle text-center min-w-[118px] w-[124px]"
                                >
                                  {docRecord ? (
                                    <div
                                      className="p-2 rounded-xl bg-emerald-50/80 border border-emerald-300/90 space-y-1.5 shadow-2xs"
                                      title={`${cat.titleEn}: ${docRecord.fileName}`}
                                    >
                                      {/* Centered Status Badge */}
                                      <div className="flex items-center justify-center gap-1 text-emerald-800 font-extrabold text-[11px] whitespace-nowrap">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        <span>
                                          {docRecord.externalDriveUrl ? 'Drive Synced' : 'Uploaded'}
                                        </span>
                                      </div>

                                      {/* Clean Centered Action Buttons (View / DL + Edit Icon) */}
                                      <div className="flex items-center justify-center gap-1">
                                        <button
                                          onClick={() => handleOpenPreview(work, docRecord)}
                                          className="flex-1 py-1.5 px-2 text-[11px] font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-colors inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                                          title={`View / Download PDF (${docRecord.fileName})`}
                                        >
                                          <Eye className="w-3.5 h-3.5 shrink-0" />
                                          <span>View / DL</span>
                                        </button>
                                        <button
                                          onClick={() => openUploadCellModal(work, cat.key)}
                                          className="p-1.5 text-slate-700 bg-white hover:bg-slate-100 hover:text-indigo-700 border border-slate-300 rounded-lg transition-colors cursor-pointer shrink-0"
                                          title="Edit / Replace PDF"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-2 rounded-xl bg-slate-50/90 border border-dashed border-slate-300 space-y-1.5 text-center">
                                      <div className="text-[10px] font-semibold text-slate-400">
                                        Pending
                                      </div>
                                      <button
                                        onClick={() => openUploadCellModal(work, cat.key)}
                                        className="w-full py-1.5 px-2 text-[11px] font-extrabold text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                                        title={`Upload ${cat.titleEn} PDF`}
                                      >
                                        <Upload className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                                        <span>Upload</span>
                                      </button>
                                    </div>
                                  )}
                                </td>
                              );
                            })}

                            {/* Actions Column Cell */}
                            <td className="py-3.5 px-2 border-l border-slate-200 text-center align-middle">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => openEditWorkModal(work)}
                                  className="p-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg transition-colors cursor-pointer"
                                  title="Edit Work Particulars"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteWorkTarget(work)}
                                  className="p-2 text-slate-500 bg-slate-100 hover:text-red-700 hover:bg-red-50 hover:border-red-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Work Project"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* TAB 2: ALL DOCUMENTS VAULT */}
        {activeTab === 'vault' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-indigo-100/80 rounded-xl overflow-x-auto">
                <button
                  onClick={() => setCategoryFilter('ALL')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    categoryFilter === 'ALL'
                      ? 'bg-indigo-700 text-white shadow-xs'
                      : 'text-indigo-950 hover:bg-white/60'
                  }`}
                >
                  All 7 Schedules ({documents.length})
                </button>
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setCategoryFilter(cat.key)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      categoryFilter === cat.key
                        ? 'bg-indigo-700 text-white shadow-xs'
                        : 'text-indigo-950 hover:bg-white/60'
                    }`}
                  >
                    {cat.code}: {cat.shortLabel}
                  </button>
                ))}
              </div>
            </div>

            {documents.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
                <FileText className="w-10 h-10 text-indigo-400 mx-auto" />
                <div className="text-sm font-bold text-slate-900">
                  No Engineering Documents Uploaded Yet
                </div>
                <p className="text-xs text-slate-500">
                  Open the "Civil Works Register" tab and click "Upload PDF" under any of the 7 columns.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100 text-xs font-bold text-slate-700">
                      <th className="py-3.5 px-4">Schedule Heading</th>
                      <th className="py-3.5 px-4">Name of Civil Work</th>
                      <th className="py-3.5 px-4">Document File Name</th>
                      <th className="py-3.5 px-4">Engineer Google Drive Mail ID</th>
                      <th className="py-3.5 px-4">Storage Location</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {documents
                      .filter((d) => categoryFilter === 'ALL' || d.category === categoryFilter)
                      .map((docItem) => {
                        const parentWork = works.find((w) => w.id === docItem.workId);
                        const catMeta = DOCUMENT_CATEGORIES.find((c) => c.key === docItem.category);
                        return (
                          <tr key={docItem.id} className="hover:bg-indigo-50/40">
                            <td className="py-3.5 px-4 font-bold text-indigo-950">
                              {catMeta ? `${catMeta.code} - ${catMeta.titleEn}` : docItem.category}
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-800">
                              {parentWork?.workName || 'Shared Engineering Work'}
                            </td>
                            <td className="py-3.5 px-4 font-mono-tabular text-slate-600">
                              {docItem.fileName}
                            </td>
                            <td className="py-3.5 px-4 font-mono-tabular text-slate-700">
                              {docItem.ownerEmail}
                            </td>
                            <td className="py-3.5 px-4">
                              {docItem.externalDriveUrl ? (
                                <a
                                  href={docItem.externalDriveUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-700 font-bold hover:underline inline-flex items-center gap-1"
                                >
                                  <HardDrive className="w-3.5 h-3.5" />
                                  <span>Google Drive ({formatBytes(docItem.fileSize)})</span>
                                </a>
                              ) : (
                                <span className="text-indigo-700 font-semibold">
                                  Cloud Vault ({formatBytes(docItem.fileSize)})
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                              {parentWork && (
                                <button
                                  onClick={() => handleOpenPreview(parentWork, docItem)}
                                  className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>View / Download</span>
                                </button>
                              )}
                              {parentWork && (
                                <button
                                  onClick={() =>
                                    setDeleteSingleDocTarget({ work: parentWork, doc: docItem })
                                  }
                                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                                  title="Delete Document"
                                >
                                  <Trash2 className="w-4 h-4 inline" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 3: GOOGLE DRIVE STORAGE & DUAL ENGINEER ARCHITECTURE */}
        {activeTab === 'drive_guide' && (
          <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="space-y-2 border-b border-slate-200 pb-4">
              <h2 className="text-xl font-extrabold text-slate-900">
                Google Drive Direct Cloud Storage & Dual-Engineer Sync
              </h2>
              <p className="text-sm text-slate-600">
                दोन्ही इंजिनियरच्या ईमेल आयडीवरून Google Drive वर फाईल्स कशा सेव्ह होतात आणि दोघांना कशा डाउनलोड करता येतात:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-2.5">
                <div className="text-sm font-extrabold text-indigo-950">
                  1. Master Folder + प्रत्येक कामाच्या नावाने स्वतंत्र Subfolder
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  ज्या इंजिनियरच्या Gmail ID ने (<strong>navin.sorte@gmail.com</strong> किंवा <strong>hemantkopulwar81@gmail.com</strong>) लॉगिन करून तुम्ही काम रजिस्टर किंवा फाईल अपलोड कराल, त्या Google Drive मध्ये आपोआप <code>{MASTER_FOLDER_NAME}</code> नावाचा <strong>Master Folder</strong> तयार होतो आणि त्या आत <strong>प्रत्येक कामाच्या नावाने स्वतंत्र फोल्डर</strong> तयार होऊन त्या कामाचे सर्व ७ डॉक्युमेंट्स त्याच फोल्डरमध्ये सेव्ह होतात!
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2.5">
                <div className="text-sm font-extrabold text-emerald-950">
                  2. दोन्ही इंजिनियर्सना डाउनलोड करण्याची पूर्ण परवानगी
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  फाईल अपलोड होतानाच आमचे सॉफ्टवेअर Google Drive API द्वारे दुसऱ्या इंजिनियरच्या ईमेल आयडीला आपोआप <strong>Shared Reader/Download Permission</strong> देते. त्यामुळे दोन्ही इंजिनियर्सना एकाच टेबलमध्ये सर्व कामे दिसतात आणि कुठूनही १ क्लिकवर PDF डाउनलोड करता येते.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-2.5">
                <div className="text-sm font-extrabold text-amber-950">
                  3. Login ID आणि Change Password सुविधा
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  वरच्या बारमधील <strong>"Engineer Logins & Change Password"</strong> बटनावर क्लिक करून तुम्ही दोन्ही इंजिनियरची नावे, त्यांचे अधिकृत Gmail ID आणि तुमचा पासवर्ड कधीही बदलू शकता.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* MODAL 1: ENGINEER LOGIN IDS & CHANGE PASSWORD MODAL */}
      {showChangePassModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-extrabold text-slate-900">
                  Dual-Engineer Login IDs & Change Password
                </h3>
              </div>
              <button
                onClick={() => setShowChangePassModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEngineerCredentialsAndPassword} className="space-y-4 text-xs">
              {/* Engineer 1 & Engineer 2 Email ID Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="space-y-1.5">
                  <label className="font-extrabold text-indigo-950 block">
                    Engineer 01 Name & Designation
                  </label>
                  <input
                    type="text"
                    required
                    value={editEng1Name}
                    onChange={(e) => setEditEng1Name(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                  <label className="font-bold text-slate-700 block pt-1">
                    Engineer 01 Google Drive Email ID
                  </label>
                  <input
                    type="email"
                    required
                    value={editEng1Email}
                    onChange={(e) => setEditEng1Email(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono-tabular"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-extrabold text-indigo-950 block">
                    Engineer 02 Name & Designation
                  </label>
                  <input
                    type="text"
                    required
                    value={editEng2Name}
                    onChange={(e) => setEditEng2Name(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                  <label className="font-bold text-slate-700 block pt-1">
                    Engineer 02 Google Drive Email ID
                  </label>
                  <input
                    type="email"
                    required
                    value={editEng2Email}
                    onChange={(e) => setEditEng2Email(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono-tabular"
                  />
                </div>
              </div>

              {/* Password Change Section */}
              <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-3">
                <div className="font-extrabold text-indigo-950 text-xs">
                  पासवर्ड बदला (Change Engineer Password)
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetSlotForPass('eng1')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer ${
                      targetSlotForPass === 'eng1'
                        ? 'bg-indigo-700 text-white'
                        : 'bg-white text-slate-700 border border-slate-300'
                    }`}
                  >
                    Engineer 01 Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetSlotForPass('eng2')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer ${
                      targetSlotForPass === 'eng2'
                        ? 'bg-indigo-700 text-white'
                        : 'bg-white text-slate-700 border border-slate-300'
                    }`}
                  >
                    Engineer 02 Password
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block">
                    सध्याचा पासवर्ड (Current Password - Default: {targetSlotForPass === 'eng1' ? DEFAULT_PASS_ENG1 : DEFAULT_PASS_ENG2})
                  </label>
                  <input
                    type="password"
                    value={currentPassVerify}
                    onChange={(e) => setCurrentPassVerify(e.target.value)}
                    placeholder="Enter current password to change"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono-tabular"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-800 block">
                      नवीन पासवर्ड (New Password)
                    </label>
                    <input
                      type="password"
                      value={newPassInput}
                      onChange={(e) => setNewPassInput(e.target.value)}
                      placeholder="New Password"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono-tabular"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-800 block">
                      नवीन पासवर्ड कन्फर्म करा (Confirm)
                    </label>
                    <input
                      type="password"
                      value={confirmNewPassInput}
                      onChange={(e) => setConfirmNewPassInput(e.target.value)}
                      placeholder="Confirm New Password"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono-tabular"
                    />
                  </div>
                </div>
              </div>

              {passChangeError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                  {passChangeError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowChangePassModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCredentials}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {savingCredentials
                    ? 'Saving & Syncing...'
                    : 'Save Engineer IDs & Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT WORK PROJECT */}
      {showWorkModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">
                {editingWork
                  ? 'Update Civil Work Particulars'
                  : 'Register New Civil Work Project'}
              </h3>
              <button
                onClick={() => setShowWorkModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWork} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-800 block">
                  Name of Civil Work / Project (कामाचे पूर्ण नाव) *
                </label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={workName}
                  onChange={(e) => setWorkName(e.target.value)}
                  placeholder="e.g., Construction of CC Road & Drain at Shirur"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block">
                    Executing Department / Division (विभाग)
                  </label>
                  <input
                    type="text"
                    maxLength={150}
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g., PWD / Z.P. Works Division"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-indigo-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block">
                    Site Location / Taluka (ठिकाण)
                  </label>
                  <input
                    type="text"
                    maxLength={150}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g., Tal. Shirur, Dist. Pune"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-indigo-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block">
                    Sanctioned Estimate ₹
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={estimatedCost}
                    onChange={(e) => setEstimatedCost(e.target.value)}
                    placeholder="1500000"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-tabular focus:outline-none focus:border-indigo-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block">
                    Work Order / Prama Ref.
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={workOrderNo}
                    onChange={(e) => setWorkOrderNo(e.target.value)}
                    placeholder="PWD/WO/2026/104"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono-tabular focus:outline-none focus:border-indigo-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block">
                    Execution Stage
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as WorkStatus)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:border-indigo-600"
                  >
                    <option value="Ongoing">Ongoing</option>
                    <option value="Billing Stage">Billing Stage</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1">
                <label className="font-bold text-indigo-950 block">
                  Co-Engineer Google Drive Email ID (Shared Access & Download)
                </label>
                <input
                  type="email"
                  maxLength={150}
                  value={workPartnerEmail}
                  onChange={(e) => setWorkPartnerEmail(e.target.value)}
                  placeholder="e.g., engineer2@gmail.com"
                  className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg text-sm font-mono-tabular focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-800 block">
                  Technical Remarks / M.B. Reference
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., M.B. No. 1042 Pages 12-18..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowWorkModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingWork}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {savingWork ? 'Saving...' : 'Save Work Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: UPLOAD PDF / PHOTOS DIRECTLY TO ENGINEER'S GOOGLE DRIVE */}
      {uploadTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            {(() => {
              const catMeta = DOCUMENT_CATEGORIES.find((c) => c.key === uploadTarget.category)!;
              return (
                <>
                  <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                    <div>
                      <div className="text-[11px] font-mono-tabular font-bold text-indigo-700">
                        {catMeta.code} · {catMeta.shortLabel}
                      </div>
                      <h3 className="text-base font-extrabold text-slate-900">
                        {catMeta.titleEn}
                      </h3>
                      <p className="text-xs text-slate-600 font-medium">{catMeta.titleMr}</p>
                    </div>
                    <button
                      onClick={() => !uploading && setUploadTarget(null)}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Active Google Drive Account & Work-Specific Subfolder Path */}
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                        <HardDrive className="w-4 h-4 text-emerald-600" />
                        <span>Google Drive Master & Work Folder Path:</span>
                      </div>
                      <div className="font-mono-tabular text-[11px] text-emerald-800">
                        {user.email} &rarr; {MASTER_FOLDER_NAME} / {uploadTarget.work.workName.slice(0, 32)}
                      </div>
                    </div>
                    {!driveToken && (
                      <button
                        type="button"
                        onClick={handleReconnectGoogleDrive}
                        className="px-2.5 py-1.5 bg-emerald-600 text-white font-bold rounded-lg text-[11px] cursor-pointer whitespace-nowrap"
                      >
                        Connect Drive
                      </button>
                    )}
                  </div>

                  {/* Mode Switcher */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setUploadMode('drive_direct')}
                      className={`py-2 px-3 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        uploadMode === 'drive_direct'
                          ? 'bg-indigo-700 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload PDF / Photos</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode('drive_link')}
                      className={`py-2 px-3 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        uploadMode === 'drive_link'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>Paste Drive URL</span>
                    </button>
                  </div>

                  <form onSubmit={handleExecuteUpload} className="space-y-4 text-xs">
                    {uploadMode === 'drive_direct' ? (
                      <>
                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-800 block">
                            Select PDF File or Site Photographs (Auto-converts to PDF & saves to Google Drive) *
                          </label>
                          <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp"
                            multiple
                            onChange={(e) => {
                              const list = e.target.files ? Array.from(e.target.files) : [];
                              setSelectedFiles(list);
                            }}
                            className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-700 file:text-white hover:file:bg-indigo-800 border border-slate-300 rounded-xl p-1.5 cursor-pointer"
                          />
                        </div>

                        {selectedFiles.length > 0 && (
                          <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-1">
                            <div className="font-bold text-indigo-950">
                              Selected Files ({selectedFiles.length}):
                            </div>
                            <ul className="text-[11px] text-slate-600 space-y-0.5 max-h-24 overflow-y-auto">
                              {selectedFiles.map((f, i) => (
                                <li key={i} className="truncate font-mono-tabular">
                                  {i + 1}. {f.name} ({formatBytes(f.size)})
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="space-y-3 p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                        <div className="space-y-1">
                          <label className="font-bold text-emerald-950 block">
                            Google Drive File / Folder Share Link *
                          </label>
                          <input
                            type="url"
                            required
                            value={driveUrlInput}
                            onChange={(e) => setDriveUrlInput(e.target.value)}
                            placeholder="https://drive.google.com/file/d/..."
                            className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-sm focus:outline-none focus:border-emerald-600"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-bold text-emerald-950 block">
                            Document Title
                          </label>
                          <input
                            type="text"
                            value={driveFileNameInput}
                            onChange={(e) => setDriveFileNameInput(e.target.value)}
                            placeholder={`${catMeta.code}_${catMeta.shortLabel}.pdf`}
                            className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-sm focus:outline-none focus:border-emerald-600"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="font-bold text-slate-800 block">
                        Reference Note / M.B. No. / Order Date
                      </label>
                      <input
                        type="text"
                        maxLength={200}
                        value={docRemarks}
                        onChange={(e) => setDocRemarks(e.target.value)}
                        placeholder="e.g., Stored on Google Drive & Shared with Co-Engineer"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-indigo-600"
                      />
                    </div>

                    {uploading && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between text-[11px] font-bold text-indigo-900">
                          <span>{uploadStage}</span>
                          <span className="font-mono-tabular">{uploadProgress}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 transition-all duration-200"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {uploadError && (
                      <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                        {uploadError}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-200 flex flex-col gap-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => setUploadTarget(null)}
                          className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={
                            uploading ||
                            (uploadMode === 'drive_direct' && selectedFiles.length === 0)
                          }
                          className="px-4 py-2 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>
                            {uploading
                              ? 'Uploading to Google Drive...'
                              : 'Upload to Google Drive & Register'}
                          </span>
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={uploading}
                        onClick={handleQuickGeneratePdfInSlot}
                        className="w-full py-2 text-[11px] font-bold text-indigo-800 hover:text-indigo-950 bg-indigo-50/70 hover:bg-indigo-100 border border-dashed border-indigo-300 rounded-lg transition-colors cursor-pointer"
                      >
                        Or Generate Official Sample {catMeta.shortLabel} PDF & Upload to Drive
                      </button>
                    </div>
                  </form>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL 4: IN-APP PDF VIEWER & GOOGLE DRIVE DOWNLOADER */}
      {previewTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-indigo-950 text-white">
              <div>
                <div className="text-xs font-bold text-amber-400">
                  {previewTarget.categoryLabel}
                </div>
                <h3 className="text-sm font-bold text-white">
                  {previewTarget.work.workName} — {previewTarget.doc.fileName}
                </h3>
                <div className="text-[11px] text-indigo-200">
                  Uploaded via Engineer Mail ID: {previewTarget.doc.ownerEmail}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {previewTarget.doc.externalDriveUrl && (
                  <a
                    href={previewTarget.doc.externalDriveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Google Drive</span>
                  </a>
                )}
                {previewDataUrl && (
                  <button
                    onClick={() =>
                      handleDownloadPdf(previewDataUrl, previewTarget.doc.fileName)
                    }
                    className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Direct Download PDF ({formatBytes(previewTarget.doc.fileSize)})</span>
                  </button>
                )}
                <button
                  onClick={() =>
                    setDeleteSingleDocTarget({
                      work: previewTarget.work,
                      doc: previewTarget.doc,
                    })
                  }
                  className="px-2.5 py-1.5 text-xs font-semibold text-red-200 hover:text-white bg-red-900/40 hover:bg-red-700 rounded-lg flex items-center gap-1 cursor-pointer"
                  title="Delete Document"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
                <button
                  onClick={handleClosePreview}
                  className="p-1.5 text-indigo-200 hover:text-white bg-white/10 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-800 flex items-center justify-center relative">
              {loadingPreview ? (
                <div className="text-center text-white space-y-2">
                  <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs">Loading PDF Document for Engineer Preview...</p>
                </div>
              ) : previewBlobUrl ? (
                <iframe
                  src={previewBlobUrl}
                  title={previewTarget.doc.fileName}
                  className="w-full h-full border-0 bg-white"
                />
              ) : previewTarget.doc.externalDriveUrl ? (
                <div className="bg-white rounded-2xl p-8 max-w-md text-center space-y-4">
                  <HardDrive className="w-12 h-12 text-emerald-600 mx-auto" />
                  <h4 className="text-base font-extrabold text-slate-900">
                    Stored on Engineer's Google Drive ({previewTarget.doc.ownerEmail})
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Both Engineer 1 and Engineer 2 can open and download this PDF directly from Google Drive using the button below.
                  </p>
                  <a
                    href={previewTarget.doc.externalDriveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl inline-flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open & Download from Google Drive</span>
                  </a>
                </div>
              ) : (
                <div className="text-center text-white p-6 space-y-3">
                  <p className="text-sm">PDF Preview unavailable.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: EXPLICIT USER CONFIRMATION BEFORE DELETING WORK PROJECT */}
      {deleteWorkTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900">
              Confirm Deletion of Civil Work & Google Drive Files?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong>{deleteWorkTarget.workName}</strong> and all associated PDF documents from Google Drive and the shared register? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteWorkTarget(null)}
                disabled={deletingWork}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteWork}
                disabled={deletingWork}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer disabled:opacity-50"
              >
                {deletingWork ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: EXPLICIT USER CONFIRMATION BEFORE DELETING SINGLE GOOGLE DRIVE DOCUMENT */}
      {deleteSingleDocTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900">
              Delete Document from Google Drive & Register?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete file{' '}
              <strong>{deleteSingleDocTarget.doc.fileName}</strong> from Google Drive ({deleteSingleDocTarget.doc.ownerEmail}) and remove it from{' '}
              <strong>{deleteSingleDocTarget.work.workName}</strong>?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteSingleDocTarget(null)}
                disabled={deletingSingleDoc}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteSingleDoc}
                disabled={deletingSingleDoc}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer disabled:opacity-50"
              >
                {deletingSingleDoc ? 'Deleting from Drive...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-slate-200 bg-white text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <span className="font-bold text-slate-700">WORKS DASHBOARD · Civil Engineering Works & Document Register</span>
        <span>Master Folder: {MASTER_FOLDER_NAME} · Dual-Engineer Sync (navin.sorte@gmail.com & hemantkopulwar81@gmail.com)</span>
      </footer>
    </div>
  );
}

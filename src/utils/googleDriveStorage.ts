/**
 * Computes a lowercase 64-character SHA-256 hex digest for secure password verification.
 */
export async function sha256Hex(plainText: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const MASTER_FOLDER_NAME = 'WORKS_DASHBOARD_MASTER_RECORDS';

/**
 * Sanitizes a work name so it can be safely used in a Google Drive API query and folder name.
 */
export function sanitizeDriveFolderName(rawName: string): string {
  return rawName
    .replace(/['"\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Civil_Work_Project';
}

/**
 * Shares a Google Drive file or folder with the Partner Engineer's email and sets link reader permission
 * so BOTH Engineer 1 (navin.sorte@gmail.com) and Engineer 2 (hemantkopulwar81@gmail.com) can access and download.
 */
export async function shareDriveItemWithPartner(
  accessToken: string,
  itemId: string,
  partnerEmail?: string
): Promise<void> {
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${itemId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });

    if (partnerEmail && partnerEmail.includes('@')) {
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${itemId}/permissions?sendNotificationEmail=false`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'user',
            emailAddress: partnerEmail.trim(),
          }),
        }
      );
    }
  } catch (err) {
    console.warn('Drive permission share warning:', err);
  }
}

/**
 * Step 1: Finds or creates the Master Folder (`WORKS_DASHBOARD_MASTER_RECORDS`)
 * in the currently signed-in Engineer's Google Drive.
 */
export async function getOrCreateMasterDriveFolder(
  accessToken: string,
  partnerEmail?: string
): Promise<string> {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${MASTER_FOLDER_NAME}' and trashed=false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: MASTER_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    throw new Error('Failed to create Master Folder on Google Drive.');
  }

  const folderData = await createRes.json();
  await shareDriveItemWithPartner(accessToken, folderData.id, partnerEmail);
  return folderData.id;
}

/**
 * Step 2: Inside the Master Folder, finds or creates a dedicated Subfolder named after the specific Work (`workName`).
 * Returns both the subfolder ID and its webViewLink so engineers can open that work's folder directly in Google Drive!
 */
export async function getOrCreateWorkSpecificSubfolder(params: {
  accessToken: string;
  workName: string;
  partnerEmail?: string;
}): Promise<{ masterFolderId: string; workFolderId: string; workFolderUrl: string }> {
  const { accessToken, workName, partnerEmail } = params;
  const masterFolderId = await getOrCreateMasterDriveFolder(accessToken, partnerEmail);
  const cleanFolderName = sanitizeDriveFolderName(workName);

  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${cleanFolderName}' and '${masterFolderId}' in parents and trashed=false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      const existing = searchData.files[0];
      return {
        masterFolderId,
        workFolderId: existing.id,
        workFolderUrl:
          existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`,
      };
    }
  }

  // Create the Work-Specific Subfolder inside the Master Folder
  const createRes = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: cleanFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [masterFolderId],
      }),
    }
  );

  if (!createRes.ok) {
    throw new Error(`Failed to create Work Folder "${cleanFolderName}" on Google Drive.`);
  }

  const createdFolder = await createRes.json();
  await shareDriveItemWithPartner(accessToken, createdFolder.id, partnerEmail);

  return {
    masterFolderId,
    workFolderId: createdFolder.id,
    workFolderUrl:
      createdFolder.webViewLink || `https://drive.google.com/drive/folders/${createdFolder.id}`,
  };
}

/**
 * Converts a DataURL string (`data:application/pdf;base64,...`) into a Blob.
 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}

/**
 * Uploads a PDF Blob directly into `WORKS_DASHBOARD_MASTER_RECORDS / <Work Name Folder> / <Category_File.pdf>`
 * on the signed-in Engineer's Google Drive, shares it with the Partner Engineer (`hemantkopulwar81@gmail.com` or `navin.sorte@gmail.com`),
 * and returns the Drive File ID, File View Link, and Work Folder URL.
 */
export async function uploadPdfBlobToEngineerGoogleDrive(params: {
  accessToken: string;
  pdfBlob: Blob;
  workName: string;
  fileName: string;
  partnerEmail?: string;
}): Promise<{ fileId: string; webViewLink: string; workFolderUrl: string; folderPath: string }> {
  const { accessToken, pdfBlob, workName, fileName, partnerEmail } = params;

  const { workFolderId, workFolderUrl } = await getOrCreateWorkSpecificSubfolder({
    accessToken,
    workName,
    partnerEmail,
  });

  const cleanFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;

  const metadata = {
    name: cleanFileName,
    mimeType: 'application/pdf',
    parents: [workFolderId],
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', pdfBlob);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Google Drive Upload Failed: ${errText}`);
  }

  const uploaded = await uploadRes.json();
  const fileId: string = uploaded.id;

  await shareDriveItemWithPartner(accessToken, fileId, partnerEmail);

  const webViewLink =
    uploaded.webViewLink || `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;

  return {
    fileId,
    webViewLink,
    workFolderUrl,
    folderPath: `${MASTER_FOLDER_NAME} / ${sanitizeDriveFolderName(workName)}`,
  };
}

/**
 * Deletes a file from the Engineer's Google Drive when requested with explicit user confirmation.
 */
export async function deleteFileFromGoogleDrive(
  accessToken: string,
  driveFileId: string
): Promise<void> {
  if (!accessToken || !driveFileId) return;
  await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

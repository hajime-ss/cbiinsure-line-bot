const { google } = require('googleapis');
const stream = require('stream');

// Initialize Google Auth
let auth;
const scopes = [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.readonly'
];

if (process.env.GOOGLE_CREDENTIALS_JSON) {
    // Render/Cloud deployment
    auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
        scopes
    });
} else {
    // Local deployment
    auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes
    });
}

const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

/**
 * Queries the Google Sheet for a match based on ID and Plate.
 * Returns the Google Drive File ID if found.
 */
async function querySheetDocs(id, plate) {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID is missing");

    // We assume the data is on the first sheet "Sheet1"
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:E', // Columns: Client, Name, ID, Plate, File ID
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return null;
    }

    // Attempt to find a match (skipping header row ideally, assuming row 0 is headers)
    for (let i = 1; i < rows.length; i++) {
        const rowId = (rows[i][2] || '').toString().trim().replace(/-/g, '');
        const rowPlate = (rows[i][3] || '').toString().trim().toLowerCase().replace(/\s/g, '');
        
        const searchId = id.toString().trim().replace(/-/g, '');
        const searchPlate = plate.toString().trim().toLowerCase().replace(/\s/g, '');

        if (rowId === searchId && rowPlate === searchPlate) {
            return { found: true, clientName: rows[i][1] };
        }
    }
    return { found: false, clientName: null };
  } catch (error) {
    console.error('Error querying Google Sheets:', error);
    throw error;
  }
}

/**
 * Searches the Master folder for the precise clientName folder,
 * and fetches up to 5 documents inside of it.
 */
async function getFilesForClient(clientName) {
    try {
        const masterFolderId = process.env.GOOGLE_DRIVE_MASTER_FOLDER_ID;
        if (!masterFolderId) throw new Error("GOOGLE_DRIVE_MASTER_FOLDER_ID is missing");

        // 1. Search for the exact folder named "clientName" in the master folder
        const folderQuery = `name = '${clientName.replace(/'/g, "\\'")}' and '${masterFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const folderRes = await drive.files.list({
            q: folderQuery,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        if (!folderRes.data.files || folderRes.data.files.length === 0) {
            return { folderFound: false, files: [] };
        }

        const clientFolderId = folderRes.data.files[0].id;

        // 2. Fetch all files inside this client's folder
        const filesQuery = `'${clientFolderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
        const filesRes = await drive.files.list({
            q: filesQuery,
            fields: 'files(id, name)',
            spaces: 'drive',
            orderBy: 'name'
        });

        const files = filesRes.data.files || [];
        return { folderFound: true, files };
    } catch (error) {
        console.error("Error fetching files for client:", error);
        return { folderFound: false, files: [] };
    }
}

/**
 * Fetches the document from Google Drive and streams it directly to the Express Response object.
 */
async function streamDriveFile(fileId, res) {
  try {
    // Get file metadata to determine the mime type and name
    const fileMeta = await drive.files.get({
        fileId: fileId,
        fields: 'name, mimeType'
    });

    res.setHeader('Content-Type', fileMeta.data.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileMeta.data.name)}`);

    // Get the file content
    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      response.data
        .on('end', () => resolve())
        .on('error', err => reject(err))
        .pipe(res);
    });
  } catch (error) {
    console.error('Error streaming Google Drive file:', error);
    res.status(500).send('Error securely fetching document.');
  }
}

module.exports = {
    querySheetDocs,
    getFilesForClient,
    streamDriveFile
};

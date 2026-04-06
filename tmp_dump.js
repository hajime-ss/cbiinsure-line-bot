require('dotenv').config();
const { google } = require('googleapis');

async function dumpSheet() {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'Sheet1!A:E',
        });
        console.log(JSON.stringify(response.data.values, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}
dumpSheet();

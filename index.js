require('dotenv').config();
const express = require('express');
const { middleware, messagingApi } = require('@line/bot-sdk');

const app = express();
const port = process.env.PORT || 3000;

// LINE configuration
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

if (!config.channelAccessToken || !config.channelSecret) {
  console.warn('WARNING: LINE Channel token or secret is not set in environment variables.');
}

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

const { handleMessageEvent } = require('./line');
const { streamDriveFile } = require('./google');

// Middleware for LINE webhook validation
app.post('/webhook', middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(event => handleMessageEvent(event, req)))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// Secure Proxy Route for file downloading
app.get('/secure-download/:fileId', async (req, res) => {
    const fileId = req.params.fileId;
    if (!fileId) return res.status(400).send('Missing file ID');
    
    // We stream the file directly from Google Drive back to the client
    await streamDriveFile(fileId, res);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const { messagingApi } = require('@line/bot-sdk');
const { querySheetDocs } = require('./google');

// Keep track of failed attempts in memory to prevent abuse (resets on server restart)
// In production, consider using Redis
const failedAttempts = {};
const MAX_ATTEMPTS = 5;

function createLineClient() {
    return new messagingApi.MessagingApiClient({
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
    });
}

function extractIdAndPlate(text) {
    // Basic extraction: expects 13 digits followed by a space and then the plate
    // e.g. "1234567890123 1AB1234"
    const regex = /^(\d{13})\s+(.+)$/i;
    const match = text.trim().match(regex);
    if (match) {
        return {
            id: match[1],
            plate: match[2].trim()
        };
    }
    return null;
}

async function handleMessageEvent(event, req) {
    if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
    }

    const userId = event.source.userId;
    const client = createLineClient();

    // Check rate limit
    if (failedAttempts[userId] >= MAX_ATTEMPTS) {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                type: 'text',
                text: 'You have exceeded the maximum number of attempts. Please contact our support team directly for assistance.'
            }]
        });
    }

    const text = event.message.text;
    const extractedData = extractIdAndPlate(text);

    if (!extractedData) {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                type: 'text',
                text: 'Please enter your 13-digit ID and car license plate, separated by a space.\n\nExample: 1234567890123 1AB1234'
            }]
        });
    }

    try {
        const result = await querySheetDocs(extractedData.id, extractedData.plate);

        if (result.found && result.clientName) {
            // Found the client in the sheet!
            failedAttempts[userId] = 0;
            
            // Now fetch their files from Drive
            const { getFilesForClient } = require('./google');
            const driveResult = await getFilesForClient(result.clientName);

            if (!driveResult.folderFound) {
                return client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [{
                        type: 'text',
                        text: `We found your details! However, our administrative team hasn't created your document folder yet. Please contact support!`
                    }]
                });
            }

            if (!driveResult.files || driveResult.files.length === 0) {
                return client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [{
                        type: 'text',
                        text: `Your document folder is ready, but it is currently empty. Please contact our administrative team.`
                    }]
                });
            }
            
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.headers.host;

            let fileListText = 'Here are your documents:\n\n';
            driveResult.files.forEach((file, index) => {
                const proxyLink = `${protocol}://${host}/secure-download/${file.id}`;
                fileListText += `${index + 1}. ${file.name}\n${proxyLink}\n\n`;
            });

            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{
                    type: 'text',
                    text: fileListText.trim()
                }]
            });

        } else {
            // Failed to find in sheet
            failedAttempts[userId] = (failedAttempts[userId] || 0) + 1;
            const remaining = MAX_ATTEMPTS - failedAttempts[userId];

            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{
                    type: 'text',
                    text: `Sorry, we couldn't find any documents matching that ID and License Plate.\n\nYou have ${remaining} attempts remaining before your account is temporarily restricted.`
                }]
            });
        }

    } catch (err) {
        console.error('Webhook processing error:', err);
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                type: 'text',
                text: 'Sorry, we are experiencing internal system issues right now. Please try again later.'
            }]
        });
    }
}

module.exports = {
    handleMessageEvent
};

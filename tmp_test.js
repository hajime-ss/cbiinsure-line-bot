require('dotenv').config();
const { querySheetDocs } = require('./google');

async function test() {
    try {
        console.log("Testing with 1209000000000 and 1rt4455...");
        const result = await querySheetDocs('1209000000000', '1rt4455');
        console.log("Result:", result);
    } catch (e) {
        console.error("Error:", e);
    }
}
test();

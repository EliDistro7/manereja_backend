

// Download the helper library from https://www.twilio.com/docs/node/install
const accountSid = process.env.TWILIO_ACCOUNT_SID; // Twilio Account SID
const authToken = process.env.TWILIO_AUTH_TOKEN;   // Twilio Auth Token
const client = require('twilio')(accountSid, authToken); // Twilio client

// SMS details
const senderPhoneNumber = process.env.TWILIO_PHONE_NUMBER; // Your Twilio phone number
const recipientPhoneNumber = '+255765762688'; // Replace with recipient's phone number
const messageBody = `
Bwana Yesu asifiwe, 
Tunayofuraha kukujulisha umefanikiwa kujiunga na Usharika wa Yombo Kuu Online. 
Endelea kutembelea tovuti na Dashboard yako ili kupata taarifa zaidi, 
pia unaweza kujiunga na huduma mbalimbali kumtumikia Mungu katika usharika mtandaoni. 
Mungu akubariki.
`;

// Send SMS
client.messages
  .create({
    body: messageBody,             // Message content
    from: senderPhoneNumber,       // Your Twilio phone number
    to: recipientPhoneNumber       // Recipient phone number
  })
  .then(message => console.log(`SMS sent! Message SID: ${message.sid}`))
  .catch(error => console.error('Error sending SMS:', error.message));

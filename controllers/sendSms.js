

const MailSlurp = require('mailslurp-client').default;
 require("dotenv").config();
const apiKey = process.env.sms; // Replace with your MailSlurp API key
console.log('api key: ' + apiKey);

const mailslurp = new MailSlurp({ apiKey });

async function sendSmsToUser(phoneNumber, message) {
  try {
    // Step 1: Create a virtual phone number
    const phoneNumberInfo = await mailslurp.createPhoneNumber();
    console.log(`Created virtual phone number: ${phoneNumberInfo.phoneNumber}`);
    
    // Step 2: Send SMS to the user's phone number
    await mailslurp.sendSms(phoneNumberInfo.id, {
      to: phoneNumber, // User's phone number
      body: message,   // Message to send
    });

    console.log(`SMS sent to ${phoneNumber} with message: "${message}"`);
  } catch (error) {
    console.error("Failed to send SMS:", error);
  }
}

// Example usage
sendSmsToUser('+25565762688', 'Welcome to our app! Your verification code is 123456.');

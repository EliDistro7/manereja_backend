const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const formidable = require('formidable');
const fs = require('fs');
const dotenv = require('dotenv');
const { createPost } = require('./post-controller'); // Import the createPost function

dotenv.config()

// Initialize Wasabi S3 client using AWS SDK v3
const s3 = new S3Client({
    credentials: {
        accessKeyId: process.env.WASABI_ACCESS_KEY,
        secretAccessKey: process.env.WASABI_SECRET_KEY,
    },
    endpoint: 'https://s3.eu-central-2.wasabisys.com', // Update this endpoint
    region: 'eu-central-2', // Your Wasabi region
    forcePathStyle: true, // Wasabi requires this for path-style requests
});

// Controller to handle file uploads and create a post after upload
const uploadFile = async (req, res) => {
    //console.log('Upload request received');
    
    const form = new formidable.IncomingForm();
    
    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing form:', err);
            return res.status(500).json({ error: 'Failed to parse form data' });
        }

        //console.log("Fields: ", fields);
        //console.log("Files: ", files);

        const file = files.file ? files.file[0] : null; // Ensure a file exists
        
        // Destructure and ensure proper values from fields
        let { bucketName, author, content, title } = fields;
        bucketName = bucketName ? bucketName[0] : null;
        author = author ? author[0] : null;
        content = content ? content[0] : null;
        title = title ? title[0] : null;
        
        let tags = ""; // Can be updated to accept tags

        // Validation checks for required fields
        if (!bucketName || typeof bucketName !== 'string') {
            return res.status(400).json({ error: 'Invalid or missing bucket name' });
        }
        
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
    
        try {
            // Read file buffer
            const fileContent = fs.readFileSync(file.filepath);
            const key = `uploads/${Date.now()}_${file.originalFilename}`; // Unique key for Wasabi

           // console.log('File content being uploaded:', fileContent.length, 'bytes');

            // Set up the upload parameters
            const params = {
                Bucket: bucketName, // Ensure bucket name is a string
                Key: key,
                Body: fileContent,
                ContentType: file.mimetype, // Use the correct MIME type
                ACL: 'public-read'
            };
            
            const command = new PutObjectCommand(params);
           // console.log('Starting file upload to Wasabi');

            // Upload the file using the S3 client
            await s3.send(command);
            const mediaUrl = `https://s3.eu-central-2.wasabisys.com/${bucketName}/${key}`; // Construct the media URL
           // console.log('File upload complete. Media URL:', mediaUrl);

            // Prepare the post data
            const postData = { author, content, media: mediaUrl, tags, title };
            
            // Mock request and response for post creation
            const mockReq = { body: postData };
            const mockRes = {
                status: (statusCode) => ({
                    json: (data) => console.log('Post creation response:', statusCode, data),
                }),
            };

            // Call the createPost function to save the post
            await createPost(mockReq, mockRes);

            // Send success response
            res.status(200).json({ message: 'File uploaded and post created successfully', mediaUrl });
        } catch (error) {
            console.error('Error during file upload or post creation:', error);
            res.status(500).json({ error: `File upload or post creation failed: ${error.message}` });
        }
    });
};

module.exports = { uploadFile };





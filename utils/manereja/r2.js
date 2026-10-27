
const { S3Client, DeleteObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");
const fs = require("fs");
const { NodeHttpHandler } = require("@smithy/node-http-handler");

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  requestHandler: new NodeHttpHandler({
    requestTimeout: 180000,
    connectionTimeout: 30000,
  }),
});

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

async function uploadFileStreamToR2(file, prefix, defaultExt) {
  const ext = (file.originalname.split(".").pop() || defaultExt).toLowerCase();
  const key = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const stream = fs.createReadStream(file.path);

  try {
    const upload = new Upload({
      client: r2,
      params: {
        Bucket: BUCKET,
        Key: key,
        Body: stream,
        ContentType: file.mimetype,
      },
      partSize: 10 * 1024 * 1024,
      queueSize: 1,
    });

    await upload.done();
  } finally {
    fs.unlink(file.path, (err) => {
      if (err) console.error(`Failed to remove temp file ${file.path}:`, err.message);
    });
  }

  return `${PUBLIC_URL}/${key}`;
}

// ── Images ────────────────────────────────────────────────────────────────────

async function uploadImageToR2(file) {
  return uploadFileStreamToR2(file, "properties/images", "jpg");
}

async function uploadImagesToR2(files = []) {
  return Promise.all(files.map(uploadImageToR2));
}

async function deleteImageFromR2(url) {
  if (!url || !url.startsWith(PUBLIC_URL)) return;
  const key = url.replace(`${PUBLIC_URL}/`, "");

  try {
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    console.error(`Failed to delete R2 image ${key}:`, err.message);
  }
}

async function deleteImagesFromR2(urls = []) {
  await Promise.all(urls.map(deleteImageFromR2));
}

// ── Videos ────────────────────────────────────────────────────────────────────

async function uploadVideoToR2(file) {
  return uploadFileStreamToR2(file, "properties/videos", "mp4");
}

async function uploadVideosToR2(files = []) {
  return Promise.all(files.map(uploadVideoToR2));
}

async function deleteVideoFromR2(url) {
  if (!url || !url.startsWith(PUBLIC_URL)) return;
  const key = url.replace(`${PUBLIC_URL}/`, "");

  try {
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    console.error(`Failed to delete R2 video ${key}:`, err.message);
  }
}

async function deleteVideosFromR2(urls = []) {
  await Promise.all(urls.map(deleteVideoFromR2));
}

// ── Presigned URLs ────────────────────────────────────────────────────────────

async function createPresignedUploadUrl(prefix, filename, contentType) {
  const ext = filename.split(".").pop().toLowerCase();
  const key = `${prefix}/${crypto.randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    // Do not lock ContentType into the signature —
    // browser MIME detection can differ from what the server expects,
    // causing a SignatureDoesNotMatch rejection.
  });

  const url = await getSignedUrl(r2, command, { expiresIn: 600 });
  return { url, key, publicUrl: `${PUBLIC_URL}/${key}` };
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  r2,
  uploadImageToR2,
  uploadImagesToR2,
  deleteImageFromR2,
  deleteImagesFromR2,
  uploadFileStreamToR2,
  uploadVideoToR2,
  uploadVideosToR2,
  deleteVideoFromR2,
  deleteVideosFromR2,
  createPresignedUploadUrl,
};
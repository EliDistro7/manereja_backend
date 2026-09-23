const Admin = require("./admin-schema"); // adjust path

const SUPER_ADMIN = {
  name:     "Bari",
  email:    "manereja07@gmail.com",    // ← your email
  password: "Manereja@Admin2024!",   // ← your password
  role:     "super_admin",
  isActive: true,
}

async function seedAdmin() {
  try {
    const existing = await Admin.findOne({ email: SUPER_ADMIN.email });
    if (existing) {
      console.log(`ℹ️  Super admin already exists (${existing.email}), skipping seed.`);
      return;
    }
    const admin = await Admin.create(SUPER_ADMIN);
    console.log(`✅ Super admin seeded: ${admin.email}`);
  } catch (err) {
    console.error("❌ Admin seed failed:", err.message);

  }
};

module.exports = seedAdmin;
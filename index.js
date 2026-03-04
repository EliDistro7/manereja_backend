const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const http = require("http");
const cors = require('cors');
const { initSocket } = require("./socket/base");
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

dotenv.config();

const userRoutes = require('./routes/manereja/auth_routes.js');
const serviceRoutes = require('./routes/manereja/service_routes.js');



const syncRoutes = require("./routes/manereja/sync-routes.js");
const profileRoutes = require("./routes/manereja/profile-routes");
const salesItemRoutes= require('./routes/manereja/salesItem-routes.js');
const TanzaniaSeed = require('./seeds/locations/Tanzania.js');
const PackagesSeed = require('./models/manereja/seed_package.js');
const locationRoutes = require('./routes/manereja/location-routes.js');
const attendanceRoutes = require('./routes/manereja/attendance-routes.js');
const projectRoutes = require('./routes/manereja/project-routes.js');
const taskRoutes = require('./routes/manereja/task-routes.js');
const packageRoutes = require('./routes/manereja/package-routes.js');
const systemNotificationRoutes = require('./routes/manereja/systemNotificationRoutes.js');

const PORT = process.env.PORT || 5000;

const allowedOrigins = [
    'http://127.0.0.1:60194',
    'http://localhost:60194',
    'http://192.168.0.72:5000',
    'http://192.168.0.72:3000',
    'http://192.168.43.163:5000',
     'http://192.168.0.185:3000',
    'http://localhost:5000',
    
    'exp://localhost:19000',

     // Try these alternatives:
    'http://192.168.0.19:5000',
    'http://192.168.0.19:3000', 
    'http://192.168.0.1:5000',
    'http://192.168.0.1:3000',   // Different subnet
    'http://10.0.0.72:5000',       // Different private range
    'http://172.16.0.72:5000',     // Another private range
   
    process.env.ORIGIN,
    null, 
];

const app = express();

// CORS configuration

app.use(cors({
    origin: function(origin, callback) {
        if(!origin) return callback(null, true);
        if(allowedOrigins.indexOf(origin) === -1) {
            return callback(null, true); // For development
        }
        return callback(null, true);
    },
    credentials: true
}));

const server = http.createServer(app);

// Middleware
app.use(express.json({ limit: '10mb' }));

// Add request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url} from ${req.ip}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// MongoDB Connection
mongoose.connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    connectTimeoutMS: 20000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log("Connected to MongoDB");
   //
   // TanzaniaSeed.seedTanzaniaLocations();
  // PackagesSeed.upsertPackages();
})
.catch((err) => {
    console.log("NOT CONNECTED TO NETWORK", err);
});

// Initialize Socket.IO
const io = initSocket(server);

// Routes
app.use('/', packageRoutes);
app.use('/locations', locationRoutes);
app.use('/', userRoutes);
app.use('/', serviceRoutes);


app.use('/sync', syncRoutes);
app.use('/profiles', profileRoutes);
app.use('/api/sales-items', salesItemRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);

app.use('/api/system-notifications', systemNotificationRoutes);


// Start the server - IMPORTANT: bind to all interfaces
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started at port no. ${PORT} on all interfaces`);
    console.log(`Local access: http://localhost:${PORT}`);
    console.log(`Network access: http://192.168.0.72:${PORT}`);
});
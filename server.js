require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dns = require('dns');

// Fix for internal network DNS issues
dns.setServers(["1.1.1.1","8.8.8.8"]);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'placement-tracker-fallback-secret-key-123';

// Middleware
app.use(cors());
app.use(express.json());
// Serve static frontend files from 'public' folder
app.use(express.static('public'));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Connected to MongoDB successfully!"))
    .catch((err) => console.log("MongoDB connection failed:", err.message));

// --- 1. SCHEMAS & MODELS ---

// User Schema (NEW)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Application Schema (UPDATED for Multi-User)
const applicationSchema = new mongoose.Schema({
    company: { type: String, required: true },
    role: { type: String, required: true },
    status: { type: String, required: true },
    date: { type: String, required: true },
    notes: { type: String, default: '' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true } // Creates unique data boundary
}, { timestamps: true });

// Transform MongoDB's internal `_id` into a clean `id` for our frontend
applicationSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
    }
});

const Application = mongoose.model('Application', applicationSchema);

// --- 2. AUTHENTICATION MIDDLEWARE ---
// This acts as a security guard for our API routes
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extracts "TOKEN" from "Bearer TOKEN"

    if (!token) return res.status(401).json({ message: "Access Denied: No Authentication Token Provided!" });

    jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
        if (err) return res.status(403).json({ message: "Invalid or Expired Token." });
        req.user = decodedUser;
        next(); // Token is valid, proceed to the requested route
    });
};

// --- 3. AUTHENTICATION APIs (Public) ---

// Register New User
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        // Check if username is already taken
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ message: 'Username is already taken. Try another!' });

        // Hash the password securely
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create and save user
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: 'User registered successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

// Login User
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Find user
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ message: 'Invalid credentials!' });

        // Compare hashed passwords
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ message: 'Invalid credentials!' });

        // Generate JSON Web Token (JWT)
        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ token, username: user.username });
    } catch (err) {
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// --- 4. PROTECTED APPLICATION APIs (Requires JWT) ---

// GET API - Retrieve ONLY the logged-in user's applications
app.get('/api/applications', authenticateToken, async (req, res) => {
    try {
        // req.user.id is injected securely by our authenticateToken middleware!
        const apps = await Application.find({ user: req.user.id });
        res.json(apps);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch applications' });
    }
});

// POST API - Add a new application tied to the specific user
app.post('/api/applications', authenticateToken, async (req, res) => {
    try {
        const newApp = new Application({
            company: req.body.company,
            role: req.body.role,
            status: req.body.status,
            date: req.body.date,
            notes: req.body.notes || '',
            user: req.user.id // Extremely important: Assign the current user's ID
        });
        const savedApp = await newApp.save();
        res.status(201).json(savedApp);
    } catch (err) {
        res.status(400).json({ error: 'Failed to create application' });
    }
});

// PUT API - Ensure the requested application belongs to the current user before updating
app.put('/api/applications/:id', authenticateToken, async (req, res) => {
    try {
        const updatedApp = await Application.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id }, // Query boundary
            { status: req.body.status },
            { returnDocument: 'after' } 
        );
        
        if (updatedApp) {
            res.json(updatedApp);
        } else {
            res.status(404).json({ message: 'Application not found or Unauthorized access!' });
        }
    } catch (err) {
        res.status(400).json({ error: 'Failed to update application' });
    }
});

// DELETE API
app.delete('/api/applications/:id', authenticateToken, async (req, res) => {
    try {
        const deletedApp = await Application.findOneAndDelete({ _id: req.params.id, user: req.user.id });
        
        if (deletedApp) {
            res.status(204).send(); // Send No Content status
        } else {
            res.status(404).json({ message: 'Application not found or Unauthorized access!' });
        }
    } catch (err) {
        res.status(400).json({ error: 'Failed to delete application' });
    }
});

// Start the server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running beautifully at http://localhost:${PORT}`);
    });
}

module.exports = app;

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./router/authRouter');
const adminRoutes = require('./router/adminRouter');
const employeeRoutes = require('./router/empRouter');

const app = express();
const PORT = process.env.PORT || 4000;

const MONGODB_URI = 'mongodb+srv://akshay2004vbi:akshay2004vbi@cluster0.hwzatkm.mongodb.net/?appName=Cluster0';

const allowedOrigins = [
    "https://employee-frontend-i28v.onrender.com",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
];

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) === -1) {
                const msg = "The CORS policy for this site does not allow access from the specified Origin.";
                return callback(new Error(msg), false);
            }
            return callback(null, true);
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

app.use(express.json());

mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB Connected Successfully!'))
    .catch(err => {
        console.error('MongoDB Connection Error:', err.message);
        process.exit(1);
    });

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/employee', employeeRoutes);

app.get('/', (req, res) => {
    res.send('IT Management System API is running...');
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});